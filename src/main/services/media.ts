import { EventEmitter } from 'node:events'
import { spawn, type ChildProcess } from 'node:child_process'
import readline from 'node:readline'
import type { MediaState } from '@shared/types'
import { resourcePath } from '../lib/paths'
import { runPowerShell } from '../lib/ps'
import { lyricsService } from './lyrics'
import { log } from '../lib/logger'

const APP_NAMES: Record<string, string> = {
  MSEdge: 'Microsoft Edge',
  chrome: 'Chrome',
  firefox: 'Firefox',
  spotify: 'Spotify',
  Spotify: 'Spotify',
  'Microsoft.ZuneMusic': 'Media Player',
  'Microsoft.ZuneVideo': '电影和电视',
  'Music.UI': 'Media Player',
  'ApplicationFrameHost': '系统应用',
  'vlc': 'VLC',
  'foobar2000': 'foobar2000',
  'QQMusic': 'QQ 音乐',
  'cloudmusic': '网易云音乐',
  'KuGou': '酷狗音乐'
}

const POLL_INTERVAL_MS = 900
const EMIT_INTERVAL_MS = 1000

function friendlyAppName(appId: string | null): string | null {
  if (!appId) return null
  const base = appId.split('!')[0]
  return APP_NAMES[base] ?? APP_NAMES[base.replace(/\.exe$/i, '')] ?? base
}

const EMPTY_MEDIA: MediaState = {
  hasSession: false,
  appId: null,
  appName: null,
  title: null,
  artist: null,
  album: null,
  playing: false,
  positionMs: 0,
  durationMs: 0,
  canPrev: false,
  canNext: false,
  canPause: false,
  updatedAt: Date.now(),
  lyrics: { status: 'idle', lines: [], synced: false, source: null }
}

/**
 * Media bridge.
 * A single long-lived Windows PowerShell process samples SMTC every 900 ms and
 * prints one JSON line per sample. The main process coalesces those samples to
 * at most one renderer event per second; the renderer extrapolates playback
 * position locally between samples so the progress bar stays smooth without
 * increasing the system polling rate.
 */
class MediaService extends EventEmitter {
  private state: MediaState = { ...EMPTY_MEDIA }
  private child: ChildProcess | null = null
  private reader: readline.Interface | null = null
  private stopping = false
  private started = false
  private retries = 0
  private lastEmit = 0
  private pendingTimer: NodeJS.Timeout | null = null
  private trackToken = 0
  private commandInFlight = false

  start(): void {
    if (this.started) return
    this.started = true
    this.spawnPoller()
  }

  stop(): void {
    this.stopping = true
    this.started = false
    if (this.pendingTimer) clearTimeout(this.pendingTimer)
    this.pendingTimer = null
    this.reader?.close()
    this.reader = null
    if (this.child && !this.child.killed) {
      const pid = this.child.pid
      this.child.kill()
      if (pid) {
        // PowerShell spawns a console host; make sure nothing is left behind.
        spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      }
    }
    this.child = null
  }

  get(): MediaState {
    return this.state
  }

  async command(action: 'playpause' | 'next' | 'previous' | 'seek', positionMs?: number): Promise<{ ok: boolean; message: string }> {
    if (this.commandInFlight) return { ok: false, message: '上一条指令仍在执行' }
    this.commandInFlight = true
    try {
      const result = await runPowerShell(
        resourcePath('ps', 'media-control.ps1'),
        ['-Action', action, '-PositionMs', String(Math.max(0, Math.round(positionMs ?? 0)))],
        { timeoutMs: 15000 }
      )
      let payload: { ok?: boolean; message?: string } = {}
      try {
        payload = JSON.parse(result.stdout.trim().split(/\r?\n/).pop() ?? '{}')
      } catch {
        payload = {}
      }
      const ok = Boolean(payload.ok)
      if (ok && action === 'playpause') {
        // Optimistic flip; the next poll confirms the real state.
        this.state = { ...this.state, playing: !this.state.playing, updatedAt: Date.now() }
        this.emitNow()
      } else if (ok && action === 'seek') {
        this.state = { ...this.state, positionMs: Math.max(0, positionMs ?? 0), updatedAt: Date.now() }
        this.emitNow()
      }
      return { ok, message: payload.message ?? (ok ? 'ok' : '控制失败') }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '控制失败' }
    } finally {
      this.commandInFlight = false
    }
  }

  private spawnPoller(): void {
    this.stopping = false
    const script = resourcePath('ps', 'now-playing.ps1')
    const child = spawn(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-IntervalMs', String(POLL_INTERVAL_MS)],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
    )
    this.child = child
    this.reader = readline.createInterface({ input: child.stdout, crlfDelay: Infinity })

    let stderrTail = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString('utf8')).slice(-2000)
    })

    this.reader.on('line', (line) => {
      const trimmed = line.trim()
      if (!trimmed.startsWith('{')) return
      try {
        const sample = JSON.parse(trimmed)
        this.retries = 0
        this.applySample(sample)
      } catch {
        /* ignore malformed line */
      }
    })

    child.on('exit', (code) => {
      this.reader?.close()
      this.reader = null
      this.child = null
      if (this.stopping || !this.started) return
      this.retries += 1
      if (this.retries <= 5) {
        log.warn(`media poller exited (code ${code}); retry ${this.retries}/5`)
        setTimeout(() => {
          if (this.started && !this.child) this.spawnPoller()
        }, Math.min(8000, 1500 * this.retries))
      } else {
        log.error(`media poller unavailable: ${stderrTail}`)
        this.state = { ...EMPTY_MEDIA, updatedAt: Date.now(), lyrics: { ...EMPTY_MEDIA.lyrics } }
        this.emitNow()
      }
    })

    child.on('error', (error) => {
      log.error('media poller spawn error', error.message)
    })
  }

  private applySample(sample: any): void {
    const hasSession = Boolean(sample?.hasSession)
    const title = typeof sample?.title === 'string' && sample.title.trim() ? sample.title.trim() : null
    const artist = typeof sample?.artist === 'string' && sample.artist.trim() ? sample.artist.trim() : null
    const album = typeof sample?.album === 'string' && sample.album.trim() ? sample.album.trim() : null
    const appId = typeof sample?.appId === 'string' ? sample.appId : null
    const previous = this.state
    const trackChanged = previous.appId !== appId || previous.title !== title || previous.artist !== artist
    const playbackChanged = previous.playing !== Boolean(sample?.playing) || previous.hasSession !== hasSession

    const next: MediaState = {
      hasSession,
      appId,
      appName: friendlyAppName(appId),
      title,
      artist,
      album,
      playing: Boolean(sample?.playing),
      positionMs: Number.isFinite(sample?.positionMs) ? Math.max(0, Number(sample.positionMs)) : 0,
      durationMs: Number.isFinite(sample?.durationMs) ? Math.max(0, Number(sample.durationMs)) : 0,
      canPrev: Boolean(sample?.canPrev),
      canNext: Boolean(sample?.canNext),
      canPause: Boolean(sample?.canPause),
      updatedAt: Date.now(),
      lyrics: previous.lyrics
    }

    if (trackChanged || !hasSession) {
      this.trackToken += 1
      next.lyrics = { status: 'idle', lines: [], synced: false, source: null }
      if (hasSession && title) {
        this.loadLyrics(next)
      }
    }

    this.state = next
    if (trackChanged || playbackChanged) this.emitNow()
    else this.scheduleEmit()
  }

  private loadLyrics(base: MediaState): void {
    const token = ++this.trackToken
    const meta = {
      artist: base.artist ?? '',
      title: base.title ?? '',
      album: base.album ?? '',
      durationMs: base.durationMs
    }
    base.lyrics = { status: 'loading', lines: [], synced: false, source: null }
    void lyricsService
      .fetch(meta)
      .then((lyrics) => {
        if (token !== this.trackToken) return
        if (this.state.title !== base.title || this.state.artist !== base.artist) return
        this.state = { ...this.state, lyrics, updatedAt: Date.now(), hasSession: this.state.hasSession }
        this.emitNow()
      })
      .catch(() => {
        if (token !== this.trackToken) return
        this.state = { ...this.state, lyrics: { status: 'error', lines: [], synced: false, source: null } }
        this.emitNow()
      })
  }

  private emitNow(): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer)
      this.pendingTimer = null
    }
    this.lastEmit = Date.now()
    this.emit('media', this.state)
  }

  private scheduleEmit(): void {
    if (this.pendingTimer) return
    const elapsed = Date.now() - this.lastEmit
    const delay = Math.max(0, EMIT_INTERVAL_MS - elapsed)
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null
      this.lastEmit = Date.now()
      this.emit('media', this.state)
    }, delay)
  }
}

export const mediaService = new MediaService()
