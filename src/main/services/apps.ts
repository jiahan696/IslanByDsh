import { EventEmitter } from 'node:events'
import { app } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AppEntry, AppListStatus, UninstallPreview, UninstallResult } from '@shared/types'
import { resourcePath } from '../lib/paths'
import { runPowerShell } from '../lib/ps'
import { log } from '../lib/logger'

interface RawApp {
  id?: string
  name?: string
  version?: string
  publisher?: string
  installLocation?: string
  uninstallString?: string
  quietUninstallString?: string
  estimatedSizeKb?: number | null
  displayIcon?: string
  source?: string
  hive?: string
  systemComponent?: boolean
  packageFullName?: string | null
  requiresElevation?: boolean
}

function normalizeApp(raw: RawApp): AppEntry | null {
  if (!raw || typeof raw.name !== 'string' || !raw.name.trim()) return null
  const source = raw.source === 'store' ? 'store' : 'registry'
  const hive = raw.hive === 'user' ? 'user' : raw.hive === 'store' ? 'store' : 'machine'
  const packageFullName = typeof raw.packageFullName === 'string' && raw.packageFullName ? raw.packageFullName : null
  return {
    id: String(raw.id ?? `${source}:${raw.name}`),
    name: raw.name.trim(),
    version: typeof raw.version === 'string' ? raw.version : '',
    publisher: typeof raw.publisher === 'string' ? raw.publisher : '',
    installLocation: typeof raw.installLocation === 'string' ? raw.installLocation : '',
    uninstallString: typeof raw.uninstallString === 'string' ? raw.uninstallString : '',
    quietUninstallString: typeof raw.quietUninstallString === 'string' ? raw.quietUninstallString : '',
    estimatedSizeKb:
      typeof raw.estimatedSizeKb === 'number' && Number.isFinite(raw.estimatedSizeKb) && raw.estimatedSizeKb > 0
        ? Math.round(raw.estimatedSizeKb)
        : null,
    displayIcon: typeof raw.displayIcon === 'string' ? raw.displayIcon : '',
    source,
    hive,
    systemComponent: Boolean(raw.systemComponent),
    packageFullName,
    requiresElevation: Boolean(raw.requiresElevation) || (source === 'registry' && hive === 'machine')
  }
}

/**
 * Installed-application inventory and uninstall launcher.
 *
 * Security boundary: the renderer can only reference an opaque `id` from the
 * cached inventory. The uninstall command itself is never accepted from the
 * renderer — it is read from the registry (or constructed from a validated AppX
 * package full name), shown verbatim in the confirmation dialog, and launched
 * with a fixed argument vector. No elevation is requested silently: any UAC
 * prompt comes from the vendor uninstaller / Windows itself.
 */
class AppsService extends EventEmitter {
  private status: AppListStatus = { state: 'idle', apps: [], updatedAt: 0, error: null }
  private loading = false
  private readonly iconCache = new Map<string, string | null>()

  start(): void {
    void this.refresh()
  }

  getStatus(): AppListStatus {
    return this.status
  }

  async refresh(): Promise<AppListStatus> {
    if (this.loading) return this.status
    this.loading = true
    this.status = { ...this.status, state: 'loading', error: null }
    this.emit('apps', this.status)

    const outFile = path.join(os.tmpdir(), `liquid-island-apps-${process.pid}-${Date.now()}.json`)
    try {
      const result = await runPowerShell(
        resourcePath('ps', 'apps.ps1'),
        ['-OutFile', outFile, '-IncludeStore'],
        { timeoutMs: 90000, maxBuffer: 1024 * 1024 }
      )
      if (!result.ok && !fs.existsSync(outFile)) throw new Error(result.stderr.trim() || '应用清单读取失败')
      const payload = JSON.parse(fs.readFileSync(outFile, 'utf8')) as { apps?: RawApp[] }
      const apps = (payload.apps ?? []).map(normalizeApp).filter((item): item is AppEntry => Boolean(item))
      apps.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
      this.status = { state: 'ready', apps, updatedAt: Date.now(), error: null }
      log.info(`installed apps: ${apps.length}`)
      this.emit('apps', this.status)
      return this.status
    } catch (error) {
      this.status = {
        ...this.status,
        state: 'error',
        error: error instanceof Error ? error.message : '应用清单读取失败'
      }
      this.emit('apps', this.status)
      log.error('apps refresh failed', this.status.error)
      return this.status
    } finally {
      this.loading = false
      try {
        fs.unlinkSync(outFile)
      } catch {
        /* nothing to clean */
      }
    }
  }

  find(id: string): AppEntry | null {
    return this.status.apps.find((item) => item.id === id) ?? null
  }

  preview(id: string): UninstallPreview | null {
    const entry = this.find(id)
    if (!entry) return null
    try {
      return { app: entry, command: this.resolveLaunch(entry).display, needsElevation: entry.requiresElevation }
    } catch {
      return { app: entry, command: '', needsElevation: entry.requiresElevation }
    }
  }

  private resolveLaunch(entry: AppEntry): { program: string; args: string[]; display: string; store: boolean } {
    if (entry.source === 'store') {
      if (!entry.packageFullName || !/^[A-Za-z0-9._\-+]+$/.test(entry.packageFullName)) {
        throw new Error('无效的 AppX 包标识')
      }
      const command = `Remove-AppxPackage -Package '${entry.packageFullName}'`
      return {
        program: 'powershell.exe',
        args: ['-NoProfile', '-NonInteractive', '-Command', command],
        display: `powershell.exe -NoProfile -Command "${command}"`,
        store: true
      }
    }
    const command = entry.quietUninstallString || entry.uninstallString
    if (!command.trim()) throw new Error('该应用未注册卸载命令')
    return {
      program: 'cmd.exe',
      args: ['/d', '/s', '/c', command.trim()],
      display: command.trim(),
      store: false
    }
  }

  async uninstall(id: string): Promise<UninstallResult> {
    const entry = this.find(id)
    if (!entry) return { ok: false, message: '应用不在当前清单中，请刷新后重试' }

    let launch: { program: string; args: string[]; display: string; store: boolean }
    try {
      launch = this.resolveLaunch(entry)
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '无法解析卸载命令' }
    }

    try {
      if (launch.store) {
        const child = spawn(launch.program, launch.args, {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe']
        })
        const result = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
          let stderr = ''
          child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')))
          child.on('error', (err) => resolve({ code: -1, stderr: err.message }))
          child.on('exit', (code) => resolve({ code, stderr }))
        })
        setTimeout(() => void this.refresh(), 1500)
        return result.code === 0
          ? { ok: true, message: `已移除 ${entry.name}` }
          : { ok: false, message: `卸载失败：${result.stderr.trim().slice(0, 300) || '系统拒绝该操作'}` }
      }

      const child = spawn(launch.program, launch.args, {
        windowsHide: false,
        detached: false,
        stdio: 'ignore'
      })
      child.on('error', (error) => log.error('uninstall spawn failed', error.message))
      child.on('exit', (code) => {
        log.info(`uninstaller exited (${code}) for ${entry.name}`)
        setTimeout(() => void this.refresh(), 2000)
      })
      setTimeout(() => void this.refresh(), 25_000)
      return { ok: true, message: `已启动 ${entry.name} 的卸载程序，请按系统提示完成` }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '启动卸载程序失败' }
    }
  }

  async icon(id: string): Promise<string | null> {
    if (this.iconCache.has(id)) return this.iconCache.get(id) ?? null
    const entry = this.find(id)
    if (!entry?.displayIcon) return null
    try {
      const iconPath = entry.displayIcon.replace(/^"|"$/g, '')
      if (!fs.existsSync(iconPath)) return null
      const image = await app.getFileIcon(iconPath, { size: 'normal' })
      const dataUrl = image.isEmpty() ? null : image.toDataURL()
      this.iconCache.set(id, dataUrl)
      return dataUrl
    } catch {
      return null
    }
  }
}

export const appsService = new AppsService()
