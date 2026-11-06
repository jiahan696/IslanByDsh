import { contextBridge, ipcRenderer } from 'electron'
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
  onTheme: (cb) => subscribe(IPC.onTheme, cb),
  onSettings: (cb) => subscribe(IPC.onSettings, cb),
  onPanelClose: (cb) => subscribe(IPC.onPanelClose, cb),
  onBackdrop: (cb) => subscribe(IPC.onBackdrop, cb),
  onToast: (cb) => subscribe(IPC.onToast, cb)
}

contextBridge.exposeInMainWorld('island', api)
