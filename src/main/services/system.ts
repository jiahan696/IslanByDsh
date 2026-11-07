import { EventEmitter } from 'node:events'
import { spawn, type ChildProcess } from 'node:child_process'
import { app, BrowserWindow, desktopCapturer, ipcMain, nativeImage, screen } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import type { SystemState } from '@shared/types'
import { resourcePath } from '../lib/paths'
import { runPowerShell } from '../lib/ps'
import { log } from '../lib/logger'

const STATE: SystemState = {
  brightness: null,
  volume: 50,
  muted: false,
  capsLock: false,
  numLock: false,
  recording: false,
  recordingStartedAt: null
}

class SystemService extends EventEmitter {
  private child: ChildProcess | null = null
  private reader: readline.Interface | null = null
  private enabled = false
  private commandBusy = false

  get(): SystemState {
    return { ...STATE }
  }

  start(enabled: boolean): void {
    this.setEnabled(enabled)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (enabled) this.spawnMonitor()
    else this.stopMonitor()
  }

  private spawnMonitor(): void {
    if (this.child) return
    try {
      const child = spawn(
        'powershell.exe',
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resourcePath('ps', 'system-status.ps1'), '-IntervalMs', '1800'],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
      )
      this.child = child
      this.reader = readline.createInterface({ input: child.stdout! })
      this.reader.on('line', (line) => {
        try {
          const sample = JSON.parse(line) as Partial<SystemState>
          if (typeof sample.brightness === 'number') STATE.brightness = sample.brightness
          STATE.capsLock = Boolean(sample.capsLock)
          STATE.numLock = Boolean(sample.numLock)
          this.emit('system', this.get())
        } catch {
          /* malformed sample */
        }
      })
      child.on('exit', () => {
        if (this.child !== child) return
        this.reader?.close()
        this.reader = null
        this.child = null
        if (this.enabled) setTimeout(() => this.enabled && !this.child && this.spawnMonitor(), 2500)
      })
    } catch (error) {
      log.warn('system monitor failed', error instanceof Error ? error.message : error)
    }
  }

  private stopMonitor(): void {
    this.reader?.close()
    this.reader = null
    if (this.child && !this.child.killed) this.child.kill()
    this.child = null
  }

  stop(): void {
    this.enabled = false
    this.stopMonitor()
  }

  async setBrightness(value: number): Promise<SystemState> {
    const next = Math.max(0, Math.min(100, Math.round(value)))
    STATE.brightness = next
    this.emit('system', this.get())
    await this.control('brightness', next)
    return this.get()
  }

  async setVolume(value: number): Promise<SystemState> {
    const next = Math.max(0, Math.min(100, Math.round(value)))
    STATE.volume = next
    STATE.muted = false
    this.emit('system', this.get())
    await this.control('volume', next)
    return this.get()
  }

  async toggleMute(): Promise<SystemState> {
    STATE.muted = !STATE.muted
    this.emit('system', this.get())
    await this.control('mute', 0)
    return this.get()
  }

  private async control(action: 'brightness' | 'volume' | 'mute', value: number): Promise<void> {
    if (this.commandBusy) return
    this.commandBusy = true
    try {
      await runPowerShell(
        resourcePath('ps', 'system-control.ps1'),
        ['-Action', action, '-Value', String(value)],
        { timeoutMs: 20000 }
      )
    } catch (error) {
      log.warn(`system ${action} failed`, error instanceof Error ? error.message : error)
    } finally {
      this.commandBusy = false
    }
  }

  setRecording(active: boolean): void {
    STATE.recording = active
    STATE.recordingStartedAt = active ? Date.now() : null
    this.emit('system', this.get())
  }

  async selectRegion(): Promise<{ x: number; y: number; w: number; h: number } | null> {
    return this.chooseRect()
  }

  private async chooseRect(): Promise<{ x: number; y: number; w: number; h: number } | null> {
    const display = screen.getPrimaryDisplay()
    const overlay = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false
      }
    })
    overlay.setAlwaysOnTop(true, 'screen-saver')
    try {
      await overlay.loadFile(resourcePath('screenshot-selection.html'))
      overlay.show()
      overlay.focus()
      return await new Promise((resolve) => {
        let settled = false
        const finish = (rect: { x: number; y: number; w: number; h: number } | null): void => {
          if (settled) return
          settled = true
          ipcMain.removeListener('island:screenshot-selected', onSelect)
          ipcMain.removeListener('island:screenshot-cancel', onCancel)
          overlay.close()
          resolve(rect)
        }
        const onSelect = (event: Electron.IpcMainEvent, rect: unknown): void => {
          if (event.sender !== overlay.webContents) return
          const value = rect as { x?: number; y?: number; w?: number; h?: number }
          finish({
            x: Math.max(0, Math.round(Number(value.x) || 0)),
            y: Math.max(0, Math.round(Number(value.y) || 0)),
            w: Math.max(8, Math.round(Number(value.w) || 0)),
            h: Math.max(8, Math.round(Number(value.h) || 0))
          })
        }
        const onCancel = (event: Electron.IpcMainEvent): void => {
          if (event.sender !== overlay.webContents) return
          finish(null)
        }
        ipcMain.on('island:screenshot-selected', onSelect)
        ipcMain.on('island:screenshot-cancel', onCancel)
        overlay.on('closed', () => finish(null))
      })
    } catch (error) {
      if (!overlay.isDestroyed()) overlay.close()
      throw error
    }
  }

  async screenshot(): Promise<{ ok: boolean; message: string; dataUrl?: string; path?: string }> {
    try {
      const selection = await this.chooseRect()
      if (!selection) return { ok: false, message: '已取消截图' }
      const display = screen.getPrimaryDisplay()
      const scale = display.scaleFactor || 1
      // Let the overlay disappear before sampling, so the selection UI itself
      // never ends up in the saved image.
      await new Promise((resolve) => setTimeout(resolve, 90))
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.round(display.bounds.width * scale),
          height: Math.round(display.bounds.height * scale)
        },
        fetchWindowIcons: false
      })
      const source =
        sources.find((candidate) => String(candidate.display_id) === String(display.id)) ?? sources[0]
      if (!source || source.thumbnail.isEmpty()) return { ok: false, message: '无法获取屏幕画面' }
      const image = source.thumbnail.crop({
        x: Math.round(selection.x * scale),
        y: Math.round(selection.y * scale),
        width: Math.round(selection.w * scale),
        height: Math.round(selection.h * scale)
      })
      const dir = path.join(app.getPath('pictures'), 'Liquid Island')
      fs.mkdirSync(dir, { recursive: true })
      const file = path.join(dir, `LiquidIsland-${new Date().toISOString().replace(/[:.]/g, '-')}.png`)
      fs.writeFileSync(file, image.toPNG())
      return { ok: true, message: '截图已保存', dataUrl: image.toDataURL(), path: file }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '截图失败' }
    }
  }

  async saveRecording(data: string, mime: string): Promise<{ ok: boolean; message: string; path?: string }> {
    try {
      const dir = path.join(app.getPath('videos'), 'Liquid Island')
      fs.mkdirSync(dir, { recursive: true })
      const ext = mime.includes('mp4') ? 'mp4' : 'webm'
      const file = path.join(dir, `LiquidIsland-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`)
      fs.writeFileSync(file, Buffer.from(data, 'base64'))
      return { ok: true, message: '录屏已保存', path: file }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '录屏保存失败' }
    }
  }
}

export const systemService = new SystemService()
