import { EventEmitter } from 'node:events'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import { desktopCapturer, nativeImage, screen } from 'electron'
import type { IslandMode } from '@shared/types'
import { log } from '../lib/logger'

export interface BackdropFrame {
  url: string
  ts: number
  width: number
  height: number
}

const COLLAPSED_INTERVAL = 1600

/**
 * Real desktop backdrop for the glass.
 *
 * CSS backdrop-filter can only sample pixels inside the same Chromium window,
 * so a transparent widget would otherwise have nothing to blur. We capture the
 * primary display at ~0.5 scale, JPEG it, and use it as the glass backdrop. 1.6 s
 * cadence while collapsed; while expanded the frame is frozen, because capturing
 * an open panel would recursively feed the widget into its own blur. No frame
 * ever leaves the machine.
 */
class CaptureService extends EventEmitter {
  private timer: NodeJS.Timeout | null = null
  private mode: IslandMode = 'collapsed'
  private enabled = true
  private suspended = false
  private busy = false
  private started = false
  private lastErrorAt = 0
  private frame: BackdropFrame | null = null
  private wallpaper: BackdropFrame | null | undefined = undefined

  start(enabled: boolean): void {
    this.enabled = enabled
    this.started = true
    this.schedule(0)
  }

  stop(): void {
    this.started = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.frame = null
      this.emit('backdrop', null)
    } else {
      this.schedule(0)
    }
  }

  setMode(mode: IslandMode): void {
    this.mode = mode
    if (mode === 'collapsed') this.schedule(700)
  }

  setSuspended(suspended: boolean): void {
    this.suspended = suspended
    if (suspended) {
      if (this.timer) clearTimeout(this.timer)
      this.timer = null
    } else {
      this.schedule(500)
    }
  }

  getFrame(): BackdropFrame | null {
    return this.frame
  }

  captureNow(): void {
    void this.grab()
  }

  private schedule(delay: number): void {
    if (!this.started || !this.enabled || this.suspended) return
    if (this.timer) clearTimeout(this.timer)
    // Freeze while expanded: capturing now would include the open panel itself.
    if (this.mode === 'expanded') {
      this.timer = null
      return
    }
    this.timer = setTimeout(() => {
      void this.grab().finally(() => this.schedule(COLLAPSED_INTERVAL))
    }, delay)
  }

  private async grab(): Promise<void> {
    if (!this.enabled || this.suspended || this.busy || !this.started) return
    this.busy = true
    try {
      const display = screen.getPrimaryDisplay()
      const width = Math.min(880, Math.max(480, Math.round(display.bounds.width * 0.5)))
      const height = Math.round((width * display.bounds.height) / display.bounds.width)
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width, height },
        fetchWindowIcons: false
      })
      const source =
        sources.find((candidate) => String(candidate.display_id) === String(display.id)) ?? sources[0] ?? null
      if (!source || source.thumbnail.isEmpty()) throw new Error('screen source unavailable')
      const size = source.thumbnail.getSize()
      const frame: BackdropFrame = {
        url: `data:image/jpeg;base64,${source.thumbnail.toJPEG(62).toString('base64')}`,
        ts: Date.now(),
        width: size.width,
        height: size.height
      }
      // A mode switch to solid can land while desktopCapturer is in flight.
      // Never publish a glass frame after the renderer has left glass mode.
      if (!this.enabled) return
      this.frame = frame
      this.emit('backdrop', frame)
    } catch (error) {
      const now = Date.now()
      if (now - this.lastErrorAt > 60_000) {
        this.lastErrorAt = now
        log.warn('backdrop capture failed, using wallpaper fallback', error instanceof Error ? error.message : error)
      }
      if (!this.frame) {
        const wallpaper = await this.wallpaperFrame()
        if (wallpaper) {
          this.frame = wallpaper
          this.emit('backdrop', wallpaper)
        }
      }
    } finally {
      this.busy = false
    }
  }

  /**
   * desktopCapturer can be unavailable (remote sessions, some VMs/GPU drivers).
   * The current wallpaper is a privacy-safe static stand-in that still gives the
   * glass real pixels to refract instead of a flat colour.
   */
  private async wallpaperFrame(): Promise<BackdropFrame | null> {
    if (this.wallpaper !== undefined) return this.wallpaper
    this.wallpaper = null
    try {
      const output = await new Promise<string>((resolve) => {
        execFile(
          'powershell.exe',
          [
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            '[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); (Get-ItemProperty "HKCU:\\Control Panel\\Desktop").WallPaper'
          ],
          { windowsHide: true, timeout: 8000, encoding: 'utf8' },
          (error, stdout) => resolve(error ? '' : String(stdout).trim())
        )
      })
      if (!output || !fs.existsSync(output)) return null
      const image = nativeImage.createFromPath(output)
      if (image.isEmpty()) return null
      const size = image.getSize()
      const width = Math.min(1280, size.width)
      const height = Math.max(1, Math.round((size.height * width) / Math.max(1, size.width)))
      const resized = image.resize({ width, height, quality: 'good' })
      this.wallpaper = {
        url: `data:image/jpeg;base64,${resized.toJPEG(66).toString('base64')}`,
        ts: Date.now(),
        width,
        height
      }
      log.info('wallpaper backdrop fallback ready', `${width}x${height}`)
      return this.wallpaper
    } catch {
      return null
    }
  }
}

export const captureService = new CaptureService()
