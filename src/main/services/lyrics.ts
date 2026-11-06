import fs from 'node:fs'
import type { LyricLine, LyricsState } from '@shared/types'
import { parseLrc } from '@shared/lrc'
import { JsonStore } from '../lib/json-store'
import { userDataPath } from '../lib/paths'
import { apiUsageService } from './api-usage'
import { log } from '../lib/logger'

interface CacheEntry {
  key: string
  lines: LyricLine[]
  synced: boolean
  source: string
  savedAt: number
}

interface CacheFile {
  entries: Record<string, CacheEntry>
}

const EMPTY: LyricsState = { status: 'idle', lines: [], synced: false, source: null }

function normalizeTitle(title: string): string {
  return title
    .replace(/\((?:feat|ft|with)[^)]*\)/gi, '')
    .replace(/\[(?:feat|ft|with)[^\]]*\]/gi, '')
    .replace(/\b(official|lyrics?|mv|video|audio|hd|4k)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cacheKey(artist: string, title: string, durationMs: number): string {
  const duration = Math.round(durationMs / 5000)
  return `${artist.toLowerCase().trim()}|${normalizeTitle(title).toLowerCase()}|${duration}`
}

/**
 * Synced lyrics via LRCLIB (free, no API key). The system media session exposes
 * timestamps but never lyrics, so this is the only network dependency of the
 * media module. Failures are non-fatal: the UI falls back to a track placeholder.
 */
class LyricsService {
  private readonly store = new JsonStore<CacheFile>(userDataPath('lyrics-cache.json'), { entries: {} })
  private cache: Record<string, CacheEntry>
  private inFlight = new Map<string, Promise<LyricsState>>()

  constructor() {
    this.cache = this.store.get().entries ?? {}
  }

  async fetch(meta: { artist: string; title: string; album: string; durationMs: number }): Promise<LyricsState> {
    const title = normalizeTitle(meta.title)
    if (!title) return { ...EMPTY }
    const key = cacheKey(meta.artist, title, meta.durationMs)
    const cached = this.cache[key]
    if (cached && Date.now() - cached.savedAt < 7 * 24 * 3600 * 1000) {
      return { status: 'found', lines: cached.lines, synced: cached.synced, source: cached.source }
    }
    const existing = this.inFlight.get(key)
    if (existing) return existing

    const promise = this.lookup(key, meta, title).finally(() => this.inFlight.delete(key))
    this.inFlight.set(key, promise)
    return promise
  }

  private async lookup(
    key: string,
    meta: { artist: string; title: string; album: string; durationMs: number },
    title: string
  ): Promise<LyricsState> {
    const headers = { 'User-Agent': 'LiquidIsland/1.0 (desktop widget)' }
    try {
      let record: any = null
      if (meta.artist) {
        const params = new URLSearchParams({ artist_name: meta.artist, track_name: title })
        if (meta.album) params.set('album_name', meta.album)
        if (meta.durationMs > 5000) params.set('duration', String(Math.round(meta.durationMs / 1000)))
        apiUsageService.increment('lyrics')
        const response = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
          headers,
          signal: AbortSignal.timeout(7000)
        })
        if (response.ok) record = await response.json()
      }

      if (!record) {
        apiUsageService.increment('lyrics')
        const q = encodeURIComponent(`${meta.artist} ${title}`.trim() || title)
        const search = await fetch(`https://lrclib.net/api/search?q=${q}`, {
          headers,
          signal: AbortSignal.timeout(7000)
        })
        if (search.ok) {
          const list = (await search.json()) as any[]
          record = Array.isArray(list)
            ? list.find((item) => typeof item?.syncedLyrics === 'string' && item.syncedLyrics.trim()) ?? null
            : null
        }
      }

      const syncedText: string = record?.syncedLyrics ?? ''
      const lines = parseLrc(syncedText)
      if (lines.length === 0) {
        return { status: 'missing', lines: [], synced: false, source: 'lrclib' }
      }
      const entry: CacheEntry = {
        key,
        lines,
        synced: true,
        source: 'LRCLIB',
        savedAt: Date.now()
      }
      this.cache[key] = entry
      this.trimCache()
      this.store.replace({ entries: this.cache })
      return { status: 'found', lines, synced: true, source: 'LRCLIB' }
    } catch (error) {
      log.warn('lyrics lookup failed', error instanceof Error ? error.message : error)
      return { status: 'error', lines: [], synced: false, source: null, error: '歌词服务暂不可用' }
    }
  }

  private trimCache(): void {
    const entries = Object.values(this.cache)
    if (entries.length <= 200) return
    entries.sort((a, b) => b.savedAt - a.savedAt)
    this.cache = Object.fromEntries(entries.slice(0, 200).map((entry) => [entry.key, entry]))
  }

  /** Remove entries containing the given track title (used by "clear cache"). */
  clear(): void {
    this.cache = {}
    this.store.replace({ entries: {} })
  }
}

export const lyricsService = new LyricsService()
export const EMPTY_LYRICS = EMPTY
