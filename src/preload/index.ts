import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '../shared/channels'
import type { IslandApi } from '../shared/types'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: IslandApi = {
  bootstrap: () => ipcRenderer.invoke(IPC.bootstrap),
  expand: () => ipcRenderer.invoke(IPC.expand),
  collapse: () => ipcRenderer.invoke(IPC.collapse),
  setCapsuleBounds: (bounds) => ipcRenderer.send(IPC.capsuleBounds, bounds),
  quit: () => ipcRenderer.invoke(IPC.quit),
  openSettingsFile: () => ipcRenderer.invoke(IPC.openSettingsFile),
  openPath: (target: string) => ipcRenderer.invoke(IPC.openPath, target),
  revealPath: (target: string) => ipcRenderer.invoke(IPC.revealPath, target),
  mediaCommand: (command, positionMs) => ipcRenderer.invoke(IPC.mediaCommand, command, positionMs),
  search: (query: string) => ipcRenderer.invoke(IPC.search, query),
  rebuildIndex: () => ipcRenderer.invoke(IPC.rebuildIndex),
  setSearchRoots: (roots: string[]) => ipcRenderer.invoke(IPC.setSearchRoots, roots),
  pickSearchRoot: () => ipcRenderer.invoke(IPC.pickSearchRoot),
  refreshApps: () => ipcRenderer.invoke(IPC.refreshApps),
  getAppIcon: (appId: string) => ipcRenderer.invoke(IPC.appIcon, appId),
  previewUninstall: (appId: string) => ipcRenderer.invoke(IPC.previewUninstall, appId),
  uninstall: (appId: string) => ipcRenderer.invoke(IPC.uninstall, appId),
  refreshWeather: () => ipcRenderer.invoke(IPC.refreshWeather),
  setWeatherCity: (city: string) => ipcRenderer.invoke(IPC.setWeatherCity, city),
  stopwatch: (action) => ipcRenderer.invoke(IPC.stopwatch, action),
  countdown: (action, payload) => ipcRenderer.invoke(IPC.countdown, action, payload),
  alarms: (action, alarm) => ipcRenderer.invoke(IPC.alarms, action, alarm),
  todos: (action, payload) => ipcRenderer.invoke(IPC.todos, action, payload),
  notifications: (action, payload) => ipcRenderer.invoke(IPC.notifications, action, payload),
  clipboard: (action, payload) => ipcRenderer.invoke(IPC.clipboard, action, payload),
  systemSetBrightness: (value) => ipcRenderer.invoke(IPC.systemSetBrightness, value),
  systemSetVolume: (value) => ipcRenderer.invoke(IPC.systemSetVolume, value),
  systemToggleMute: () => ipcRenderer.invoke(IPC.systemToggleMute),
  systemScreenshot: () => ipcRenderer.invoke(IPC.systemScreenshot),
  systemCopyScreenshot: (dataUrl) => ipcRenderer.invoke(IPC.systemCopyScreenshot, dataUrl),
  systemSaveRecording: (data, mime) => ipcRenderer.invoke(IPC.systemSaveRecording, data, mime),
  filesAdd: (paths) => ipcRenderer.invoke(IPC.filesAdd, paths),
  filesRemove: (id) => ipcRenderer.invoke(IPC.filesRemove, id),
  filesClear: () => ipcRenderer.invoke(IPC.filesClear),
  filesDragOut: (id) => ipcRenderer.send(IPC.filesDragOut, id),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
  updateSettings: (patch) => ipcRenderer.invoke(IPC.updateSettings, patch),
  hidePanel: () => ipcRenderer.invoke(IPC.collapse),

  onMode: (cb) => subscribe(IPC.onMode, cb),
  onMetrics: (cb) => subscribe(IPC.onMetrics, cb),
  onMedia: (cb) => subscribe(IPC.onMedia, cb),
  onNotifications: (cb) => subscribe(IPC.onNotifications, cb),
  onTimers: (cb) => subscribe(IPC.onTimers, cb),
  onSearchStatus: (cb) => subscribe(IPC.onSearchStatus, cb),
  onApps: (cb) => subscribe(IPC.onApps, cb),
  onWeather: (cb) => subscribe(IPC.onWeather, cb),
  onClipboard: (cb) => subscribe(IPC.onClipboard, cb),
  onSystem: (cb) => subscribe(IPC.onSystem, cb),
  onFiles: (cb) => subscribe(IPC.onFiles, cb),
  onTheme: (cb) => subscribe(IPC.onTheme, cb),
  onSettings: (cb) => subscribe(IPC.onSettings, cb),
  onPanelClose: (cb) => subscribe(IPC.onPanelClose, cb),
  onBackdrop: (cb) => subscribe(IPC.onBackdrop, cb),
  onToast: (cb) => subscribe(IPC.onToast, cb)
}

contextBridge.exposeInMainWorld('island', api)
