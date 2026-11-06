import { EventEmitter } from 'node:events'
import type { WeatherNow } from '@shared/types'
import { JsonStore } from '../lib/json-store'
import { userDataPath } from '../lib/paths'
import { apiUsageService } from './api-usage'
import { log } from '../lib/logger'

interface GeoInfo {
  city: string
  region: string
  country: string
  lat: number
  lon: number
  ts: number
}

interface WeatherCache {
  customCity: string | null
  geo: GeoInfo | null
  weather: (Omit<WeatherNow, 'status' | 'error'> & { ts: number }) | null
}

const WEATHER_TTL = 10 * 60 * 1000
const GEO_TTL = 6 * 60 * 60 * 1000
const MIN_REFRESH = 30 * 1000

const WEATHER_CODE: Record<number, { condition: string; icon: string }> = {
  0: { condition: '晴', icon: 'sun' },
  1: { condition: '大部晴朗', icon: 'sun' },
  2: { condition: '局部多云', icon: 'cloud-sun' },
  3: { condition: '阴', icon: 'cloud' },
  45: { condition: '有雾', icon: 'fog' },
  48: { condition: '雾凇', icon: 'fog' },
  51: { condition: '小毛毛雨', icon: 'drizzle' },
  53: { condition: '毛毛雨', icon: 'drizzle' },
  55: { condition: '强毛毛雨', icon: 'drizzle' },
  56: { condition: '冻毛毛雨', icon: 'drizzle' },
  57: { condition: '强冻毛毛雨', icon: 'drizzle' },
  61: { condition: '小雨', icon: 'rain' },
  63: { condition: '中雨', icon: 'rain' },
  65: { condition: '大雨', icon: 'rain' },
  66: { condition: '冻雨', icon: 'rain' },
  67: { condition: '强冻雨', icon: 'rain' },
  71: { condition: '小雪', icon: 'snow' },
  73: { condition: '中雪', icon: 'snow' },
  75: { condition: '大雪', icon: 'snow' },
  77: { condition: '米雪', icon: 'snow' },
  80: { condition: '阵雨', icon: 'rain' },
  81: { condition: '中阵雨', icon: 'rain' },
  82: { condition: '强阵雨', icon: 'rain' },
  85: { condition: '阵雪', icon: 'snow' },
  86: { condition: '强阵雪', icon: 'snow' },
  95: { condition: '雷阵雨', icon: 'storm' },
  96: { condition: '雷阵雨伴冰雹', icon: 'storm' },
  99: { condition: '强雷暴冰雹', icon: 'storm' }
}

function weatherMeta(code: number): { condition: string; icon: string } {
  return WEATHER_CODE[code] ?? { condition: '未知天气', icon: 'cloud' }
}

async function getJson(url: string, timeoutMs = 8000): Promise<any> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'LiquidIsland/1.0' },
    signal: AbortSignal.timeout(timeoutMs)
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

/**
 * Weather + IP-based city location.
 * Location is deliberately coarse (IP geolocation) and only leaves the machine
 * when weather is refreshed. Data is cached for 10 min and the refresh action is
 * rate-limited to one attempt per 30 s. A manual city overrides IP lookup.
 */
class WeatherService extends EventEmitter {
  private readonly store = new JsonStore<WeatherCache>(userDataPath('weather-cache.json'), {
    customCity: null,
    geo: null,
    weather: null
  })
  private cache = this.store.get()
  private state: WeatherNow
  private lastAttempt = 0
  private inFlight: Promise<WeatherNow> | null = null
  private timer: NodeJS.Timeout | null = null

  constructor() {
    super()
    const cached = this.cache.weather
    this.state = cached
      ? { ...cached, status: 'ready', error: null, updatedAt: cached.ts }
      : {
          status: 'loading',
          city: '定位中',
          region: '',
          country: '',
          lat: null,
          lon: null,
          tempC: null,
          feelsLikeC: null,
          condition: '正在获取天气',
          icon: 'cloud',
          humidity: null,
          windKph: null,
          highC: null,
          lowC: null,
          updatedAt: 0,
          source: null,
          error: null
        }
  }

  start(): void {
    void this.refresh()
    this.timer = setInterval(() => void this.refresh(), 10 * 60 * 1000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  get(): WeatherNow {
    return this.state
  }

  async refresh(force = false): Promise<WeatherNow> {
    if (this.inFlight) return this.inFlight
    const now = Date.now()
    if (!force && this.state.updatedAt > 0 && now - this.state.updatedAt < WEATHER_TTL && this.state.status === 'ready') {
      return this.state
    }
    if (!force && now - this.lastAttempt < MIN_REFRESH) return this.state
    this.lastAttempt = now
    this.inFlight = this.doRefresh().finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  private async doRefresh(): Promise<WeatherNow> {
    this.state = { ...this.state, status: this.state.city === '定位中' ? 'loading' : this.state.status, error: null }
    this.emit('weather', this.state)
    try {
      const geo = await this.resolveGeo()
      apiUsageService.increment('weather')
      const params = new URLSearchParams({
        latitude: String(geo.lat),
        longitude: String(geo.lon),
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
        daily: 'temperature_2m_max,temperature_2m_min',
        timezone: 'auto',
        forecast_days: '1'
      })
      const data = await getJson(`https://api.open-meteo.com/v1/forecast?${params.toString()}`)
      const current = data?.current ?? {}
      const daily = data?.daily ?? {}
      const code = Number(current.weather_code ?? 0)
      const meta = weatherMeta(code)
      const next: Omit<WeatherNow, 'status' | 'error'> & { ts: number } = {
        city: geo.city,
        region: geo.region,
        country: geo.country,
        lat: geo.lat,
        lon: geo.lon,
        tempC: Number.isFinite(Number(current.temperature_2m)) ? Number(current.temperature_2m) : null,
        feelsLikeC: Number.isFinite(Number(current.apparent_temperature)) ? Number(current.apparent_temperature) : null,
        condition: meta.condition,
        icon: meta.icon,
        humidity: Number.isFinite(Number(current.relative_humidity_2m)) ? Number(current.relative_humidity_2m) : null,
        windKph: Number.isFinite(Number(current.wind_speed_10m)) ? Number(current.wind_speed_10m) : null,
        highC: Array.isArray(daily.temperature_2m_max) ? Number(daily.temperature_2m_max[0]) : null,
        lowC: Array.isArray(daily.temperature_2m_min) ? Number(daily.temperature_2m_min[0]) : null,
        updatedAt: Date.now(),
        source: 'Open-Meteo',
        ts: Date.now()
      }
      this.cache = { ...this.cache, geo, weather: next }
      this.store.replace(this.cache)
      this.state = { ...next, status: 'ready', error: null }
      this.emit('weather', this.state)
      return this.state
    } catch (error) {
      const message = error instanceof Error ? error.message : '天气获取失败'
      this.state = { ...this.state, status: 'error', error: `天气获取失败：${message}` }
      this.emit('weather', this.state)
      log.warn('weather refresh failed', message)
      return this.state
    }
  }

  private async resolveGeo(): Promise<GeoInfo> {
    const custom = this.cache.customCity
    if (custom) {
      if (this.cache.geo && this.cache.geo.city === custom && Date.now() - this.cache.geo.ts < GEO_TTL) return this.cache.geo
      apiUsageService.increment('geocode')
      const query = encodeURIComponent(custom)
      const data = await getJson(
        `https://geocoding-api.open-meteo.com/v1/search?name=${query}&count=1&language=zh&format=json`
      )
      const hit = Array.isArray(data?.results) ? data.results[0] : null
      if (!hit) throw new Error(`未找到城市“${custom}”`)
      const geo: GeoInfo = {
        city: hit.name ?? custom,
        region: hit.admin1 ?? '',
        country: hit.country ?? '',
        lat: Number(hit.latitude),
        lon: Number(hit.longitude),
        ts: Date.now()
      }
      return geo
    }

    if (this.cache.geo && Date.now() - this.cache.geo.ts < GEO_TTL) return this.cache.geo

    try {
      apiUsageService.increment('geolocation')
      const ip = await getJson('https://ipwho.is/')
      if (ip?.success && Number.isFinite(Number(ip.latitude))) {
        const geo: GeoInfo = {
          city: String(ip.city ?? '未知城市'),
          region: String(ip.region ?? ''),
          country: String(ip.country ?? ''),
          lat: Number(ip.latitude),
          lon: Number(ip.longitude),
          ts: Date.now()
        }
        this.cache = { ...this.cache, geo }
        this.store.replace(this.cache)
        return geo
      }
    } catch (error) {
      log.warn('ip geolocation failed, trying fallback', error instanceof Error ? error.message : error)
    }

    apiUsageService.increment('geolocation')
    const fallback = await getJson('https://ipapi.co/json/')
    if (!Number.isFinite(Number(fallback?.latitude))) throw new Error('无法通过 IP 定位城市')
    const geo: GeoInfo = {
      city: String(fallback.city ?? '未知城市'),
      region: String(fallback.region ?? ''),
      country: String(fallback.country_name ?? ''),
      lat: Number(fallback.latitude),
      lon: Number(fallback.longitude),
      ts: Date.now()
    }
    this.cache = { ...this.cache, geo }
    this.store.replace(this.cache)
    return geo
  }

  async setCity(city: string): Promise<WeatherNow> {
    const trimmed = city.trim()
    this.cache = { ...this.cache, customCity: trimmed || null, geo: trimmed ? this.cache.geo : null }
    this.store.replace(this.cache)
    return this.refresh(true)
  }
}

export const weatherService = new WeatherService()
