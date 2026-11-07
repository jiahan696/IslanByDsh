import { create } from 'zustand'
import type {
  AppListStatus,
  Bootstrap,
  ClipboardEntry,
  GlassCustom,
  IslandLayout,
  IslandMode,
  MediaState,
  NotificationState,
  RecordingState,
  ResolvedTheme,
  SearchStatus,
  Settings,
  ShelfItem,
  SolidTheme,
  SystemMetrics,
  SystemState,
  TimerState,
  ToolSettings,
  TodoItem,
  WeatherNow
} from '@shared/types'

export type PanelTab = 'search' | 'apps' | 'tools'

export interface Toast {
  id: string
  kind: 'info' | 'error'
  text: string
}

interface Backdrop {
  url: string
  ts: number
  width: number
  height: number
}

const initialMetrics: SystemMetrics = {
  ts: 0,
  battery: { hasBattery: false, percent: null, isCharging: false, acConnected: true, isFull: false, low: false },
  bluetooth: [],
  cpu: 0,
  mem: { used: 0, total: 0, percent: 0 },
  net: { down: 0, up: 0, iface: null },
  apiUsage: { today: 0, byService: {}, date: '' },
  uptimeSec: 0
}

const initialMedia: MediaState = {
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

const initialNotifications: NotificationState = {
  unread: 0,
  items: [],
  sources: { toast: 'unavailable', bridge: false, watcher: false, bridgePort: null },
  acknowledgedAt: null
}

const initialTimers: TimerState = {
  stopwatch: { running: false, elapsedMs: 0, laps: [] },
  countdown: {
    running: false,
    remainingMs: 25 * 60_000,
    totalMs: 25 * 60_000,
    label: '专注',
    finishedAt: null,
    reminderEnabled: true,
    reminderKind: 'message',
    snoozeUntil: null
  },
  alarms: [],
  firingAlarm: null,
  firingTodo: null,
  firingCountdown: null,
  now: Date.now()
}

const initialSearch: SearchStatus = {
  state: 'idle',
  indexed: 0,
  roots: [],
  updatedAt: 0,
  scannedDirs: 0,
  error: null,
  truncated: false
}

const initialApps: AppListStatus = { state: 'idle', apps: [], updatedAt: 0, error: null }

const initialWeather: WeatherNow = {
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

const defaultGlassCustom: GlassCustom = {
  glassOpacity: 58,
  blur: 18,
  radius: 32,
  contrast: 82,
  borderWidth: 1,
  borderOpacity: 35,
  accent: '#7c8cff'
}

const defaultSolidTheme: SolidTheme = {
  preset: 'black',
  background: '#000000',
  backgroundOpacity: 100,
  textColor: '#ffffff',
  textOpacity: 100,
  textContrast: 100
}

const defaultLayout: IslandLayout = {
  anchor: 'top-center',
  scale: 50,
  orientation: 'horizontal',
  x: null,
  y: null,
  freeDrag: true
}

const defaultTools: ToolSettings = {
  media: true,
  clipboard: false,
  system: false,
  fileShelf: false,
  clipboardMax: 80,
  clipboardClearOnStart: true,
  shelfClearOnStart: false
}

const initialSettings: Settings = {
  renderMode: 'glass',
  theme: 'system',
  captureBackdrop: true,
  glassCustom: defaultGlassCustom,
  solidTheme: defaultSolidTheme,
  layout: defaultLayout,
  tools: defaultTools,
  reduceMotion: false,
  showSeconds: false,
  notificationsBridge: true,
  startAtLogin: false,
  searchRoots: [],
  panelWidth: 980
}

const initialSystem: SystemState = {
  brightness: null,
  volume: 50,
  muted: false,
  capsLock: false,
  numLock: false,
  recording: false,
  recordingStartedAt: null
}

interface IslandState {
  ready: boolean
  mode: IslandMode
  settings: Settings
  theme: ResolvedTheme
  metrics: SystemMetrics
  media: MediaState
  notifications: NotificationState
  timers: TimerState
  searchStatus: SearchStatus
  apps: AppListStatus
  weather: WeatherNow
  todos: TodoItem[]
  clipboard: ClipboardEntry[]
  system: SystemState
  files: ShelfItem[]
  recording: RecordingState
  backdrop: Backdrop | null
  version: string

  tab: PanelTab
  settingsOpen: boolean
  uninstallId: string | null
  searchFocusNonce: number
  toasts: Toast[]

  hydrate: (bootstrap: Bootstrap) => void
  setMode: (mode: IslandMode) => void
  setSettings: (settings: Settings) => void
  setTheme: (theme: ResolvedTheme) => void
  setMetrics: (metrics: SystemMetrics) => void
  setMedia: (media: MediaState) => void
  setNotifications: (state: NotificationState) => void
  setTimers: (state: TimerState) => void
  setSearchStatus: (state: SearchStatus) => void
  setApps: (state: AppListStatus) => void
  setWeather: (state: WeatherNow) => void
  setTodos: (items: TodoItem[]) => void
  setClipboard: (items: ClipboardEntry[]) => void
  setSystem: (state: SystemState) => void
  setFiles: (items: ShelfItem[]) => void
  setRecording: (state: RecordingState) => void
  setBackdrop: (frame: Backdrop | null) => void
  setTab: (tab: PanelTab) => void
  setSettingsOpen: (open: boolean) => void
  setUninstallId: (id: string | null) => void
  requestSearchFocus: () => void
  pushToast: (toast: Toast) => void
  dismissToast: (id: string) => void
}

export const useIsland = create<IslandState>((set) => ({
  ready: false,
  mode: 'collapsed',
  settings: initialSettings,
  theme: 'dark',
  metrics: initialMetrics,
  media: initialMedia,
  notifications: initialNotifications,
  timers: initialTimers,
  searchStatus: initialSearch,
  apps: initialApps,
  weather: initialWeather,
  todos: [],
  clipboard: [],
  system: initialSystem,
  files: [],
  recording: { active: false, startedAt: null },
  backdrop: null,
  version: '1.0.0',

  tab: 'search',
  settingsOpen: false,
  uninstallId: null,
  searchFocusNonce: 0,
  toasts: [],

  hydrate: (bootstrap) =>
    set({
      ready: true,
      mode: bootstrap.mode,
      settings: bootstrap.settings,
      theme: bootstrap.theme,
      metrics: bootstrap.metrics,
      media: bootstrap.media,
      notifications: bootstrap.notifications,
      timers: bootstrap.timers,
      searchStatus: bootstrap.searchStatus,
      apps: bootstrap.apps,
      weather: bootstrap.weather,
      todos: bootstrap.todos,
      clipboard: bootstrap.clipboard,
      system: bootstrap.system,
      files: bootstrap.files,
      backdrop: bootstrap.backdrop,
      version: bootstrap.version
    }),
  setMode: (mode) => set({ mode, ...(mode === 'collapsed' ? { settingsOpen: false, uninstallId: null } : {}) }),
  setSettings: (settings) => set({ settings }),
  setTheme: (theme) => set({ theme }),
  setMetrics: (metrics) => set({ metrics }),
  setMedia: (media) => set({ media }),
  setNotifications: (notifications) => set({ notifications }),
  setTimers: (timers) => set({ timers }),
  setSearchStatus: (searchStatus) => set({ searchStatus }),
  setApps: (apps) => set({ apps }),
  setWeather: (weather) => set({ weather }),
  setTodos: (todos) => set({ todos }),
  setClipboard: (clipboard) => set({ clipboard }),
  setSystem: (system) => set({ system }),
  setFiles: (files) => set({ files }),
  setRecording: (recording) => set({ recording }),
  setBackdrop: (backdrop) => set({ backdrop }),
  setTab: (tab) => set({ tab }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setUninstallId: (uninstallId) => set({ uninstallId }),
  requestSearchFocus: () => set((state) => ({ searchFocusNonce: state.searchFocusNonce + 1, tab: 'search' })),
  pushToast: (toast) => {
    set((state) => ({ toasts: [...state.toasts.filter((item) => item.id !== toast.id), toast].slice(-3) }))
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((item) => item.id !== toast.id) }))
    }, 3600)
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }))
}))
