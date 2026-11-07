/**
 * Shared contracts between the Electron main process, the preload bridge and the
 * React renderer. Everything here is JSON-serialisable because it crosses an IPC
 * boundary (structured clone).
 */

export type IslandMode = 'collapsed' | 'expanded'
export type ThemeMode = 'system' | 'light' | 'dark' | 'custom'
export type ResolvedTheme = 'light' | 'dark'
export type RenderMode = 'glass' | 'solid'
export type SolidPreset = 'black' | 'white' | 'custom'
export type ReminderKind = 'message' | 'alarm'

export interface ToolSettings {
  media: boolean
  clipboard: boolean
  system: boolean
  fileShelf: boolean
  clipboardMax: number
  clipboardClearOnStart: boolean
  shelfClearOnStart: boolean
}

export interface ClipboardEntry {
  id: string
  text: string
  pinned: boolean
  createdAt: number
}

export interface ShelfItem {
  id: string
  path: string
  name: string
  isDir: boolean
  icon: string | null
}

export interface SystemState {
  brightness: number | null
  volume: number
  muted: boolean
  capsLock: boolean
  numLock: boolean
  recording: boolean
  recordingStartedAt: number | null
}

export interface RecordingState {
  active: boolean
  startedAt: number | null
}

export type LayoutAnchor =
  | 'top-center'
  | 'bottom-center'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'custom'
export type LayoutOrientation = 'horizontal' | 'vertical'

/** Global island placement; independent of the render mode. */
export interface IslandLayout {
  anchor: LayoutAnchor
  scale: number
  orientation: LayoutOrientation
  x: number | null
  y: number | null
  freeDrag: boolean
}

/** Parameters that only affect the liquid-glass renderer. */
export interface GlassCustom {
  glassOpacity: number
  blur: number
  radius: number
  contrast: number
  borderWidth: number
  borderOpacity: number
  accent: string
}

/** Parameters that only affect the solid renderer. */
export interface SolidTheme {
  preset: SolidPreset
  background: string
  backgroundOpacity: number
  textColor: string
  textOpacity: number
  textContrast: number
}

export interface BatteryInfo {
  hasBattery: boolean
  percent: number | null
  isCharging: boolean
  acConnected: boolean
  /** Full while plugged in at >= 99% */
  isFull: boolean
  low: boolean
}

export type BluetoothKind = 'audio' | 'input' | 'phone' | 'other'

export interface BluetoothDevice {
  id: string
  name: string
  kind: BluetoothKind
  battery: number | null
  connected: boolean
}

export interface NetworkInfo {
  /** bytes per second */
  down: number
  up: number
  iface: string | null
}

export interface ApiUsage {
  today: number
  byService: Record<string, number>
  date: string
}

export interface SystemMetrics {
  ts: number
  battery: BatteryInfo
  bluetooth: BluetoothDevice[]
  cpu: number
  mem: { used: number; total: number; percent: number }
  net: NetworkInfo
  apiUsage: ApiUsage
  uptimeSec: number
}

export interface LyricLine {
  /** seconds from the beginning of the track */
  time: number
  text: string
}

export type LyricsStatus = 'idle' | 'loading' | 'found' | 'missing' | 'error'

export interface LyricsState {
  status: LyricsStatus
  lines: LyricLine[]
  synced: boolean
  source: string | null
  error?: string
}

export interface MediaState {
  hasSession: boolean
  appId: string | null
  appName: string | null
  title: string | null
  artist: string | null
  album: string | null
  playing: boolean
  positionMs: number
  durationMs: number
  canPrev: boolean
  canNext: boolean
  canPause: boolean
  /** system timestamp of the sample (Date.now()) */
  updatedAt: number
  lyrics: LyricsState
}

export type NotificationApp = 'wechat' | 'qq' | 'system'

export interface NotificationItem {
  id: string
  app: NotificationApp
  appLabel: string
  title: string
  body: string
  ts: number
  /** high = OS bridge, low = heuristic window watcher, demo = manual injection */
  confidence: 'high' | 'low' | 'demo'
}

export interface NotificationSourceStatus {
  toast: 'unavailable' | 'denied' | 'granted' | 'unknown'
  bridge: boolean
  watcher: boolean
  bridgePort: number | null
}

export interface NotificationState {
  unread: number
  items: NotificationItem[]
  sources: NotificationSourceStatus
  /** set when the badge is acknowledged; new items reset it */
  acknowledgedAt: number | null
}

export interface StopwatchState {
  running: boolean
  elapsedMs: number
  laps: number[]
}

export interface CountdownState {
  running: boolean
  remainingMs: number
  totalMs: number
  label: string
  finishedAt: number | null
  reminderEnabled: boolean
  reminderKind: ReminderKind
  snoozeUntil: number | null
}

export interface Alarm {
  id: string
  time: string
  label: string
  enabled: boolean
  /** 0 = Sunday ... 6 = Saturday; empty means one-shot */
  days: number[]
  /** Optional one-shot calendar date (YYYY-MM-DD); null = recurrence by days. */
  date: string | null
  lastTriggeredDate: string | null
  snoozeUntil: number | null
}

export interface TimerState {
  stopwatch: StopwatchState
  countdown: CountdownState
  alarms: Alarm[]
  firingAlarm: Alarm | null
  firingTodo: TodoItem | null
  firingCountdown: CountdownState | null
  now: number
}

export type SearchIndexState = 'idle' | 'indexing' | 'ready' | 'error'

export interface SearchStatus {
  state: SearchIndexState
  indexed: number
  roots: string[]
  updatedAt: number
  scannedDirs: number
  error: string | null
  truncated: boolean
}

export interface SearchResult {
  path: string
  name: string
  dir: string
  ext: string
  kind: 'file' | 'folder'
  size: number | null
  mtime: number
  score: number
}

export interface SearchResponse {
  query: string
  results: SearchResult[]
  tookMs: number
  totalMatched: number
}

export interface AppEntry {
  id: string
  name: string
  version: string
  publisher: string
  installLocation: string
  uninstallString: string
  quietUninstallString: string
  estimatedSizeKb: number | null
  displayIcon: string
  source: 'registry' | 'store'
  hive: 'machine' | 'user' | 'store'
  systemComponent: boolean
  packageFullName: string | null
  requiresElevation: boolean
}

export interface AppListStatus {
  state: 'idle' | 'loading' | 'ready' | 'error'
  apps: AppEntry[]
  updatedAt: number
  error: string | null
}

export interface WeatherNow {
  status: 'idle' | 'loading' | 'ready' | 'error'
  city: string
  region: string
  country: string
  lat: number | null
  lon: number | null
  tempC: number | null
  feelsLikeC: number | null
  condition: string
  icon: string
  humidity: number | null
  windKph: number | null
  highC: number | null
  lowC: number | null
  updatedAt: number
  source: string | null
  error: string | null
}

export interface TodoItem {
  id: string
  text: string
  done: boolean
  date: string
  createdAt: number
  remindAt: number | null
  reminderEnabled: boolean
  reminderKind: ReminderKind
  reminderDone: boolean
  snoozeUntil: number | null
}

export interface Settings {
  /** Rendering source. Completely independent from the theme values below. */
  renderMode: RenderMode
  /** Liquid-glass theme. */
  theme: ThemeMode
  captureBackdrop: boolean
  glassCustom: GlassCustom
  /** Solid theme; never read by the glass renderer. */
  solidTheme: SolidTheme
  /** Position/scale/orientation are shared by both render modes. */
  layout: IslandLayout
  /** Optional tool modules. Disabled tools render nothing and use no width. */
  tools: ToolSettings
  reduceMotion: boolean
  showSeconds: boolean
  notificationsBridge: boolean
  startAtLogin: boolean
  searchRoots: string[]
  panelWidth: number
}

export interface Bootstrap {
  settings: Settings
  mode: IslandMode
  backdrop: { url: string; ts: number; width: number; height: number } | null
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
  theme: ResolvedTheme
  version: string
  platform: string
}

export interface UninstallPreview {
  app: AppEntry
  command: string
  needsElevation: boolean
}

export interface UninstallResult {
  ok: boolean
  message: string
}

export interface DemoNotificationInput {
  app: NotificationApp
  title: string
  body: string
}

export interface IslandApi {
  bootstrap: () => Promise<Bootstrap>
  expand: () => Promise<void>
  collapse: () => Promise<void>
  setCapsuleBounds: (bounds: { x: number; y: number; w: number; h: number }) => void
  quit: () => void
  openSettingsFile: () => void
  openPath: (path: string) => Promise<string>
  revealPath: (path: string) => void
  mediaCommand: (
    command: 'playpause' | 'next' | 'previous' | 'seek',
    positionMs?: number
  ) => Promise<{ ok: boolean; message: string }>
  search: (query: string) => Promise<SearchResponse>
  rebuildIndex: () => Promise<SearchStatus>
  setSearchRoots: (roots: string[]) => Promise<SearchStatus>
  pickSearchRoot: () => Promise<string | null>
  refreshApps: () => Promise<AppListStatus>
  getAppIcon: (appId: string) => Promise<string | null>
  previewUninstall: (appId: string) => Promise<UninstallPreview | null>
  uninstall: (appId: string) => Promise<UninstallResult>
  refreshWeather: () => Promise<WeatherNow>
  setWeatherCity: (city: string) => Promise<WeatherNow>
  stopwatch: (action: 'start' | 'pause' | 'reset' | 'lap') => void
  countdown: (
    action: 'start' | 'pause' | 'reset' | 'configure',
    payload?: {
      minutes?: number
      seconds?: number
      label?: string
      kind?: ReminderKind
      reminderEnabled?: boolean
    }
  ) => void
  alarms: (
    action: 'add' | 'update' | 'remove' | 'toggle' | 'dismiss',
    alarm?: Partial<Alarm> & { id?: string; mode?: 'close' | 'snooze' }
  ) => void
  todos: (
    action: 'add' | 'toggle' | 'remove' | 'clearDone' | 'updateReminder' | 'dismissReminder',
    payload?: {
      id?: string
      text?: string
      date?: string
      remindAt?: number | null
      reminderEnabled?: boolean
      reminderKind?: ReminderKind
      mode?: 'close' | 'snooze'
    }
  ) => Promise<TodoItem[]>
  notifications: (action: 'clear' | 'demo' | 'remove', payload?: { id?: string } | DemoNotificationInput) => Promise<NotificationState>
  clipboard: (
    action: 'copy' | 'pin' | 'remove' | 'clear',
    payload?: { id?: string; text?: string }
  ) => Promise<ClipboardEntry[]>
  systemSetBrightness: (value: number) => Promise<SystemState>
  systemSetVolume: (value: number) => Promise<SystemState>
  systemToggleMute: () => Promise<SystemState>
  systemScreenshot: () => Promise<{ ok: boolean; message: string; dataUrl?: string; path?: string }>
  systemSelectRegion: () => Promise<{ x: number; y: number; w: number; h: number } | null>
  systemCopyScreenshot: (dataUrl: string) => Promise<{ ok: boolean; message: string }>
  systemSaveRecording: (data: string, mime: string) => Promise<{ ok: boolean; message: string; path?: string }>
  filesAdd: (paths: string[]) => Promise<ShelfItem[]>
  filesRemove: (id: string) => Promise<ShelfItem[]>
  filesClear: () => Promise<ShelfItem[]>
  filesDragOut: (id: string) => void
  getPathForFile: (file: File) => string
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>
  hidePanel: () => void
  onMode: (cb: (mode: IslandMode) => void) => () => void
  onMetrics: (cb: (metrics: SystemMetrics) => void) => () => void
  onMedia: (cb: (media: MediaState) => void) => () => void
  onNotifications: (cb: (state: NotificationState) => void) => () => void
  onTimers: (cb: (state: TimerState) => void) => () => void
  onSearchStatus: (cb: (status: SearchStatus) => void) => () => void
  onApps: (cb: (status: AppListStatus) => void) => () => void
  onWeather: (cb: (weather: WeatherNow) => void) => () => void
  onClipboard: (cb: (items: ClipboardEntry[]) => void) => () => void
  onSystem: (cb: (state: SystemState) => void) => () => void
  onFiles: (cb: (items: ShelfItem[]) => void) => () => void
  onTheme: (cb: (theme: ResolvedTheme) => void) => () => void
  onSettings: (cb: (settings: Settings) => void) => () => void
  onPanelClose: (cb: () => void) => () => void
  onBackdrop: (cb: (data: { url: string; ts: number; width: number; height: number } | null) => void) => () => void
  onToast: (cb: (toast: { id: string; kind: 'info' | 'error'; text: string }) => void) => () => void
}
