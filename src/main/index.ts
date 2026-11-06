import {
  app,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  shell,
  Tray,
  type MenuItemConstructorOptions
} from 'electron'
import { IPC } from '@shared/channels'
import type {
  Alarm,
  DemoNotificationInput,
  IslandMode,
  Settings,
  TodoItem
} from '@shared/types'
import { islandWindow } from './window'
import { settingsService } from './services/settings'
import { metricsService } from './services/metrics'
import { mediaService } from './services/media'
import { searchService } from './services/search'
import { appsService } from './services/apps'
import { weatherService } from './services/weather'
import { timerService } from './services/timers'
import { todoService } from './services/todos'
import { notificationService } from './services/notifications'
import { captureService } from './services/capture'
import { bluetoothService } from './services/bluetooth'
import { userDataPath, resourcePath } from './lib/paths'
import { log } from './lib/logger'

let tray: Tray | null = null
let quitting = false
let toastSeq = 0

function toast(kind: 'info' | 'error', text: string): void {
  islandWindow.send(IPC.onToast, { id: `t${++toastSeq}`, kind, text })
}

function switchMode(mode: IslandMode): void {
  islandWindow.setMode(mode)
}

function buildTrayMenu(): void {
  if (!tray) return
  const expanded = islandWindow.getMode() === 'expanded'
  const template: MenuItemConstructorOptions[] = [
    { label: expanded ? '收起灵动岛' : '展开灵动岛', click: () => switchMode(expanded ? 'collapsed' : 'expanded') },
    { label: '快速搜索', click: () => switchMode('expanded') },
    { type: 'separator' },
    {
      label: '发送测试通知',
      click: () => {
        notificationService.demo({
          app: 'wechat',
          title: '演示消息',
          body: '来自托盘菜单的测试通知，用于验证角标与微动效。'
        })
        toast('info', '已注入一条演示通知')
      }
    },
    {
      label: '重建文件索引',
      click: () => {
        void searchService.rebuild().then((status) => {
          toast(status.state === 'ready' ? 'info' : 'error', `索引：${status.indexed} 项`)
        })
      }
    },
    {
      label: '开机自启',
      type: 'checkbox',
      checked: settingsService.get().startAtLogin,
      click: (item) => settingsService.update({ startAtLogin: item.checked })
    },
    { type: 'separator' },
    { label: '打开数据目录', click: () => void shell.openPath(app.getPath('userData')) },
    { label: '退出 Liquid Island', click: () => quitApp() }
  ]
  tray.setContextMenu(Menu.buildFromTemplate(template))
}

function createTray(): void {
  let image = nativeImage.createFromPath(resourcePath('tray.png'))
  if (image.isEmpty()) image = nativeImage.createEmpty()
  tray = new Tray(image.resize({ width: 16, height: 16 }))
  tray.setToolTip('Liquid Island · 液态玻璃灵动岛')
  tray.on('click', () => islandWindow.toggle())
  buildTrayMenu()
}

function registerIpc(): void {
  ipcMain.handle(IPC.bootstrap, () => ({
    settings: settingsService.get(),
    mode: islandWindow.getMode(),
    backdrop: captureService.getFrame(),
    metrics: metricsService.latest(),
    media: mediaService.get(),
    notifications: notificationService.get(),
    timers: timerService.get(),
    searchStatus: searchService.getStatus(),
    apps: appsService.getStatus(),
    weather: weatherService.get(),
    todos: todoService.list(),
    theme: settingsService.resolvedTheme(),
    version: app.isPackaged ? app.getVersion() : '1.0.0',
    platform: process.platform
  }))

  ipcMain.handle(IPC.expand, () => {
    switchMode('expanded')
    void weatherService.refresh()
  })
  ipcMain.handle(IPC.collapse, () => switchMode('collapsed'))
  ipcMain.handle(IPC.quit, () => quitApp())

  ipcMain.on(IPC.capsuleBounds, (_event, bounds) => {
    if (!bounds || typeof bounds !== 'object') return
    islandWindow.setCapsuleBounds({
      x: Number((bounds as any).x),
      y: Number((bounds as any).y),
      w: Number((bounds as any).w),
      h: Number((bounds as any).h)
    })
  })

  ipcMain.handle(IPC.openSettingsFile, () => {
    shell.showItemInFolder(userDataPath('settings.json'))
  })

  ipcMain.handle(IPC.openPath, async (_event, target: unknown) => {
    if (typeof target !== 'string' || !target) return '无效路径'
    return shell.openPath(target)
  })

  ipcMain.handle(IPC.revealPath, (_event, target: unknown) => {
    if (typeof target === 'string' && target) shell.showItemInFolder(target)
  })

  ipcMain.handle(IPC.mediaCommand, (_event, command: unknown, positionMs: unknown) => {
    const allowed = ['playpause', 'next', 'previous', 'seek'] as const
    if (!allowed.includes(command as (typeof allowed)[number])) return { ok: false, message: '未知指令' }
    return mediaService.command(command as (typeof allowed)[number], Number(positionMs) || 0)
  })

  ipcMain.handle(IPC.search, async (_event, query: unknown) => {
    const text = typeof query === 'string' ? query.slice(0, 200) : ''
    if (!text.trim()) return { query: '', results: [], tookMs: 0, totalMatched: 0 }
    return searchService.query(text)
  })

  ipcMain.handle(IPC.rebuildIndex, () => searchService.rebuild())

  ipcMain.handle(IPC.setSearchRoots, async (_event, roots: unknown) => {
    if (!Array.isArray(roots)) return searchService.getStatus()
    const sanitized = roots.filter((item): item is string => typeof item === 'string').slice(0, 8)
    settingsService.update({ searchRoots: sanitized })
    const status = await searchService.setRoots(settingsService.get().searchRoots)
    islandWindow.send(IPC.onSearchStatus, status)
    return status
  })

  ipcMain.handle(IPC.pickSearchRoot, async () => {
    const parent = islandWindow.browserWindow
    const result = parent
      ? await dialog.showOpenDialog(parent, { properties: ['openDirectory'], title: '选择索引目录' })
      : await dialog.showOpenDialog({ properties: ['openDirectory'], title: '选择索引目录' })
    return result.canceled ? null : result.filePaths[0] ?? null
  })

  ipcMain.handle(IPC.refreshApps, () => appsService.refresh())
  ipcMain.handle(IPC.appIcon, (_event, id: unknown) => appsService.icon(String(id ?? '')))
  ipcMain.handle(IPC.previewUninstall, (_event, id: unknown) => appsService.preview(String(id ?? '')))
  ipcMain.handle(IPC.uninstall, async (_event, id: unknown) => {
    const result = await appsService.uninstall(String(id ?? ''))
    toast(result.ok ? 'info' : 'error', result.message)
    return result
  })

  ipcMain.handle(IPC.refreshWeather, () => weatherService.refresh(true))
  ipcMain.handle(IPC.setWeatherCity, (_event, city: unknown) => weatherService.setCity(typeof city === 'string' ? city : ''))

  ipcMain.handle(IPC.stopwatch, (_event, action: unknown) => {
    if (['start', 'pause', 'reset', 'lap'].includes(String(action))) {
      timerService.stopwatch(action as 'start' | 'pause' | 'reset' | 'lap')
    }
  })
  ipcMain.handle(IPC.countdown, (_event, action: unknown, payload: unknown) => {
    if (['start', 'pause', 'reset', 'configure'].includes(String(action))) {
      timerService.countdown(
        action as 'start' | 'pause' | 'reset' | 'configure',
        (payload ?? {}) as {
          minutes?: number
          seconds?: number
          label?: string
          kind?: 'message' | 'alarm'
          reminderEnabled?: boolean
        }
      )
    }
  })
  ipcMain.handle(IPC.alarms, (_event, action: unknown, alarm: unknown) => {
    if (['add', 'update', 'remove', 'toggle', 'dismiss'].includes(String(action))) {
      timerService.alarms(action as 'add' | 'update' | 'remove' | 'toggle' | 'dismiss', (alarm ?? {}) as Partial<Alarm> & { id?: string })
    }
  })

  ipcMain.handle(IPC.todos, (_event, action: unknown, payload: unknown) => {
    const data = (payload ?? {}) as {
      id?: string
      text?: string
      date?: string
      remindAt?: number | null
      reminderEnabled?: boolean
      reminderKind?: 'message' | 'alarm'
      mode?: 'close' | 'snooze'
    }
    let items: TodoItem[] = todoService.list()
    if (action === 'add') {
      items = todoService.add(
        typeof data.text === 'string' ? data.text : '',
        data.date,
        data.remindAt,
        data.reminderEnabled,
        data.reminderKind
      )
    } else if (action === 'toggle' && data.id) items = todoService.toggle(data.id)
    else if (action === 'remove' && data.id) items = todoService.remove(data.id)
    else if (action === 'clearDone') items = todoService.clearDone()
    else if (action === 'updateReminder' && data.id) {
      items = todoService.updateReminder(data.id, data)
    } else if (action === 'dismissReminder') {
      timerService.dismissTodo(data.mode === 'snooze' ? 'snooze' : 'close')
      items = todoService.list()
    }
    return items
  })

  ipcMain.handle(IPC.notifications, (_event, action: unknown, payload: unknown) => {
    if (action === 'clear') return notificationService.clear()
    if (action === 'remove') return notificationService.remove(String((payload as { id?: string })?.id ?? ''))
    if (action === 'demo') return notificationService.demo((payload ?? {}) as DemoNotificationInput)
    return notificationService.get()
  })

  ipcMain.handle(IPC.updateSettings, async (_event, patch: unknown) => {
    try {
      const previous = settingsService.get()
      const next = settingsService.update((patch ?? {}) as Partial<Settings>)
      const captureEnabled = next.captureBackdrop && next.renderMode === 'glass'
      if (previous.captureBackdrop !== next.captureBackdrop || previous.renderMode !== next.renderMode) {
        captureService.setEnabled(captureEnabled)
      }
      if (previous.notificationsBridge !== next.notificationsBridge) notificationService.startBridge(next.notificationsBridge)
      if (JSON.stringify(previous.searchRoots) !== JSON.stringify(next.searchRoots)) {
        await searchService.setRoots(next.searchRoots)
      }
      islandWindow.send(IPC.onSettings, next)
      return next
    } catch (error) {
      log.error('update settings failed', error instanceof Error ? error.stack ?? error.message : error)
      return settingsService.get()
    }
  })
}

let alertBeepOn = false
let alertBeepTimer: NodeJS.Timeout | null = null

function wireEvents(): void {
  islandWindow.on('mode', (mode: IslandMode) => {
    timerService.setExpanded(mode === 'expanded')
    captureService.setMode(mode)
    buildTrayMenu()
    if (mode === 'expanded') void weatherService.refresh()
  })

  metricsService.on('metrics', (metrics) => islandWindow.send(IPC.onMetrics, metrics))
  mediaService.on('media', (media) => islandWindow.send(IPC.onMedia, media))
  notificationService.on('notifications', (state) => islandWindow.send(IPC.onNotifications, state))
  timerService.on('timers', (state) => {
    const shouldBeep =
      Boolean(state.firingAlarm) ||
      state.firingTodo?.reminderKind === 'alarm' ||
      state.firingCountdown?.reminderKind === 'alarm'
    if (shouldBeep && !alertBeepOn) {
      try {
        shell.beep()
      } catch {
        /* no audio device */
      }
      alertBeepTimer = setInterval(() => {
        try {
          shell.beep()
        } catch {
          /* no audio device */
        }
      }, 1500)
    } else if (!shouldBeep && alertBeepOn) {
      if (alertBeepTimer) clearInterval(alertBeepTimer)
      alertBeepTimer = null
    }
    alertBeepOn = shouldBeep
    islandWindow.send(IPC.onTimers, state)
  })
  searchService.on('status', (status) => islandWindow.send(IPC.onSearchStatus, status))
  appsService.on('apps', (status) => islandWindow.send(IPC.onApps, status))
  weatherService.on('weather', (state) => islandWindow.send(IPC.onWeather, state))
  captureService.on('backdrop', (frame) => islandWindow.send(IPC.onBackdrop, frame))
  settingsService.on('theme', (theme) => islandWindow.send(IPC.onTheme, theme))
  settingsService.on('settings', (settings) => {
    islandWindow.send(IPC.onSettings, settings)
    buildTrayMenu()
  })
}

function registerShortcuts(): void {
  const shortcuts: Array<[string, () => void]> = [
    ['Control+Alt+Space', () => islandWindow.toggle()],
    [
      'Control+Alt+N',
      () =>
        notificationService.demo({
          app: 'qq',
          title: '测试提醒',
          body: '快捷键注入的演示通知（Ctrl+Alt+N）。'
        })
    ]
  ]
  for (const [accelerator, handler] of shortcuts) {
    try {
      const ok = globalShortcut.register(accelerator, handler)
      if (!ok) log.warn(`global shortcut busy: ${accelerator}`)
    } catch (error) {
      log.warn(`global shortcut failed: ${accelerator}`, error instanceof Error ? error.message : error)
    }
  }
}

function startDeferredServices(): void {
  // The island UI must paint first. Every sampler, network call, timer loop and
  // heavyweight index is scheduled after the first visible frame.
  setTimeout(() => metricsService.start(), 120)
  setTimeout(() => timerService.start(), 200)
  setTimeout(() => captureService.start(
    settingsService.get().captureBackdrop && settingsService.get().renderMode === 'glass'
  ), 600)
  setTimeout(() => notificationService.startBridge(settingsService.get().notificationsBridge), 800)
  setTimeout(() => appsService.start(), 900)
  setTimeout(() => mediaService.start(), 1000)
  setTimeout(() => weatherService.start(), 1200)
  setTimeout(() => searchService.start(settingsService.get().searchRoots), 1500)
  setTimeout(() => bluetoothService.start(), 3000)
}

function stopServices(): void {
  try {
    if (alertBeepTimer) clearInterval(alertBeepTimer)
    alertBeepTimer = null
    settingsService.flush()
    todoService.flush()
    bluetoothService.stop()
    metricsService.stop()
    mediaService.stop()
    timerService.stop()
    searchService.stop()
    weatherService.stop()
    notificationService.stop()
    captureService.stop()
    settingsService.removeAllListeners()
    globalShortcut.unregisterAll()
  } catch (error) {
    log.error('shutdown error', error instanceof Error ? error.message : error)
  }
}

function quitApp(): void {
  quitting = true
  app.quit()
}

async function init(): Promise<void> {
  app.setAppUserModelId('com.desktool.liquidisland')
  log.rotate()

  registerIpc()
  const win = islandWindow.create()
  win.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      switchMode('collapsed')
    }
  })

  wireEvents()
  settingsService.init()
  createTray()
  registerShortcuts()
  win.once('ready-to-show', () => {
    // ready-to-show is emitted after the renderer has produced its first frame.
    startDeferredServices()
  })

  powerMonitor.on('suspend', () => {
    metricsService.setSuspended(true)
    captureService.setSuspended(true)
  })
  powerMonitor.on('resume', () => {
    metricsService.setSuspended(false)
    captureService.setSuspended(false)
  })
  powerMonitor.on('lock-screen', () => {
    metricsService.setSuspended(true)
    captureService.setSuspended(true)
  })
  powerMonitor.on('unlock-screen', () => {
    metricsService.setSuspended(false)
    captureService.setSuspended(false)
  })

  log.info(`Liquid Island ready (electron ${process.versions.electron}, chrome ${process.versions.chrome})`)
}

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    switchMode('expanded')
    islandWindow.browserWindow?.focus()
  })

  app.whenReady().then(() => {
    void init().catch((error) => {
      log.error('init failed', error instanceof Error ? error.stack ?? error.message : error)
      dialog.showErrorBox('Liquid Island 启动失败', error instanceof Error ? error.message : String(error))
      app.quit()
    })
  })

  app.on('window-all-closed', () => {
    // Keep the tray resident; quit only through the tray/menu or Cmd+Q equivalent.
  })

  app.on('before-quit', () => {
    quitting = true
    stopServices()
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })
}

process.on('unhandledRejection', (reason) => {
  log.error('unhandled rejection', reason instanceof Error ? reason.stack ?? reason.message : reason)
})
