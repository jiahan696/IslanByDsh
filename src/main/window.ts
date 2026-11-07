import { app, BrowserWindow, screen, shell } from 'electron'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import type { IslandMode } from '@shared/types'
import { log } from './lib/logger'

interface CapsuleBounds {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Owns the single transparent, always-on-top window.
 *
 * The window always spans the primary display so the expanded panel can animate
 * with pure CSS (no native resize jank). While collapsed, the window is
 * click-through everywhere except the capsule rect; the rect is reported by the
 * renderer and checked against the OS cursor 25x/second. While expanded, the
 * whole surface is interactive, which makes "click outside to collapse" reliable
 * instead of relying on a global mouse hook.
 */
class IslandWindow extends EventEmitter {
  private win: BrowserWindow | null = null
  private mode: IslandMode = 'collapsed'
  private capsule: CapsuleBounds = { x: 0, y: 0, w: 900, h: 56 }
  private pollTimer: NodeJS.Timeout | null = null
  private ignoring: boolean | null = null
  private panelCloseTimer: NodeJS.Timeout | null = null
  private lastShapeKey = ''
  private hasCapsuleBounds = false

  constructor() {
    super()
  }

  create(): BrowserWindow {
    const display = screen.getPrimaryDisplay()
    const win = new BrowserWindow({
      ...display.bounds,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: true,
      thickFrame: false,
      roundedCorners: false,
      title: 'Liquid Island',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        spellcheck: false
      }
    })

    this.win = win
    // BrowserWindow may clamp the initial height to the work area; the widget's
    // expanded click-catcher should cover the full display.
    win.setBounds(display.bounds)
    win.setAlwaysOnTop(true, 'floating')
    win.setSkipTaskbar(true)
    win.setHasShadow(false)
    win.setMenuBarVisibility(false)
    try {
      win.setVisibleOnAllWorkspaces(true)
    } catch {
      /* Windows does not expose virtual desktop pinning through this API */
    }
    this.setIgnore(true)

    win.once('ready-to-show', () => {
      win.showInactive()
      win.setAlwaysOnTop(true, 'floating')
      this.applyShape()
      this.startPolling()
    })

    win.webContents.on('did-finish-load', () => {
      this.send('mode', this.mode)
    })

    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })

    win.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape' && this.mode === 'expanded') {
        this.setMode('collapsed')
      }
      if (input.type === 'keyDown' && input.key === 'F12' && !process.env.NODE_ENV?.includes('production')) {
        win.webContents.toggleDevTools()
      }
    })

    win.on('closed', () => {
      this.win = null
      this.stopPolling()
    })

    const rendererUrl = process.env['ELECTRON_RENDERER_URL']
    if (rendererUrl) void win.loadURL(rendererUrl)
    else void win.loadFile(join(__dirname, '../renderer/index.html'))

    const relayout = (): void => {
      const primary = screen.getPrimaryDisplay()
      if (!this.win || this.win.isDestroyed()) return
      this.win.setBounds(primary.bounds)
      this.updateClickThrough()
    }
    screen.on('display-metrics-changed', relayout)
    screen.on('display-added', relayout)
    screen.on('display-removed', relayout)

    return win
  }

  get browserWindow(): BrowserWindow | null {
    return this.win
  }

  getMode(): IslandMode {
    return this.mode
  }

  setMode(mode: IslandMode): void {
    if (this.mode === mode) {
      if (mode === 'expanded') this.win?.focus()
      return
    }
    this.mode = mode
    if (this.panelCloseTimer) clearTimeout(this.panelCloseTimer)
    this.panelCloseTimer = null

    if (mode === 'expanded') {
      // The expanded panel needs the full transparent canvas for its animation
      // and its click-outside catcher. The tight capsule mask is restored after
      // the close animation finishes.
      this.applyShape()
      this.setIgnore(false)
      // show() (rather than only focus()) gives the window a chance to become
      // the foreground window even when the panel was opened from the tray.
      // Windows' foreground lock can still reject focus(); app.focus({steal})
      // is the documented escape hatch for an explicit user action (tray /
      // global shortcut), and a focused window delivers the next click to the
      // page instead of consuming it for activation.
      this.win?.show()
      app.focus({ steal: true })
      this.win?.focus()
    } else {
      this.updateClickThrough()
      // Drive the unmount from the main process: Chromium timers can be
      // throttled once the window loses focus (click-outside), which would
      // otherwise leave the closed panel lingering on screen.
      this.panelCloseTimer = setTimeout(() => {
        if (this.mode === 'collapsed') {
          this.applyShape()
          this.send('panel-close')
        }
      }, 380)
    }
    this.send('mode', mode)
    this.emit('mode', mode)
  }

  toggle(): void {
    this.setMode(this.mode === 'collapsed' ? 'expanded' : 'collapsed')
  }

  setCapsuleBounds(bounds: CapsuleBounds): void {
    if (
      !Number.isFinite(bounds.x) ||
      !Number.isFinite(bounds.y) ||
      !Number.isFinite(bounds.w) ||
      !Number.isFinite(bounds.h)
    ) {
      return
    }
    this.capsule = {
      x: Math.max(0, bounds.x),
      y: Math.max(0, bounds.y),
      w: Math.max(1, bounds.w),
      h: Math.max(1, bounds.h)
    }
    this.hasCapsuleBounds = true
    if (this.mode === 'collapsed') this.scheduleShape()
    this.updateClickThrough()
  }

  private scheduleShape(): void {
    if (this.shapeTimer) return
    // Coalesce the 60–120 Hz renderer resize stream into at most one native
    // mask update per frame. setShape is a synchronous OS call; flooding it
    // during the width transition is a major source of stutter.
    this.shapeTimer = setTimeout(() => {
      this.shapeTimer = null
      this.applyShape()
    }, 16)
  }

  /**
   * Apply the native mask. Collapsed = only the live capsule rectangle is
   * drawable/interactive; expanded = the full display stays available for the
   * panel and its click-outside catcher.
   */
  private shapeTimer: NodeJS.Timeout | null = null

  private applyShape(): void {
    if (!this.win || this.win.isDestroyed()) return
    try {
      const display = screen.getPrimaryDisplay()
      const full = { x: 0, y: 0, width: display.bounds.width, height: display.bounds.height }
      const rect =
        this.mode === 'expanded' || !this.hasCapsuleBounds
          ? full
          : {
              x: Math.round(this.capsule.x),
              y: Math.round(this.capsule.y),
              width: Math.max(1, Math.round(this.capsule.w)),
              height: Math.max(1, Math.round(this.capsule.h))
            }
      const key = `${rect.x}:${rect.y}:${rect.width}:${rect.height}`
      if (key === this.lastShapeKey) return
      this.lastShapeKey = key
      this.win.setShape([rect])
    } catch (error) {
      log.warn('native window mask update failed', error instanceof Error ? error.message : error)
    }
  }

  private startPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    // Poll faster than the old 100 ms cadence: a 100 ms click-through window
    // made the first click after the pointer entered the capsule feel lost.
    this.pollTimer = setInterval(() => this.updateClickThrough(), 40)
  }

  private stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
    if (this.shapeTimer) clearTimeout(this.shapeTimer)
    this.shapeTimer = null
  }

  private updateClickThrough(): void {
    if (!this.win || this.win.isDestroyed()) return
    if (this.mode === 'expanded') {
      this.setIgnore(false)
      return
    }
    const point = screen.getCursorScreenPoint()
    const origin = this.win.getBounds()
    const left = origin.x + this.capsule.x
    const top = origin.y + this.capsule.y
    const inside =
      point.x >= left && point.x <= left + this.capsule.w && point.y >= top && point.y <= top + this.capsule.h
    this.setIgnore(!inside)
  }

  private setIgnore(ignore: boolean): void {
    if (!this.win || this.win.isDestroyed()) return
    if (this.ignoring === ignore) return
    this.ignoring = ignore
    this.win.setIgnoreMouseEvents(ignore)
  }

  send(channel: string, payload?: unknown): void {
    if (!this.win || this.win.isDestroyed() || this.win.webContents.isDestroyed()) return
    try {
      this.win.webContents.send(channel, payload)
    } catch (error) {
      log.warn('renderer send failed', error instanceof Error ? error.message : error)
    }
  }
}

export const islandWindow = new IslandWindow()
