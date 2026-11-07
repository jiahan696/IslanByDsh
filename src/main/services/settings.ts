import { app, nativeTheme } from 'electron'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import type {
  GlassCustom,
  IslandLayout,
  ResolvedTheme,
  Settings,
  SolidPreset,
  SolidTheme,
  ToolSettings
} from '@shared/types'
import { JsonStore } from '../lib/json-store'
import { userDataPath } from '../lib/paths'

const DEFAULT_ROOTS = (): string[] => {
  const candidates = ['desktop', 'documents', 'downloads']
  const roots: string[] = []
  for (const name of candidates) {
    try {
      const dir = app.getPath(name as 'desktop' | 'documents' | 'downloads')
      if (dir && fs.existsSync(dir)) roots.push(dir)
    } catch {
      /* path not available on this Windows install */
    }
  }
  return roots
}

export const DEFAULT_GLASS_CUSTOM: GlassCustom = {
  glassOpacity: 58,
  blur: 18,
  radius: 32,
  contrast: 82,
  borderWidth: 1,
  borderOpacity: 35,
  accent: '#7c8cff'
}

export const DEFAULT_SOLID_THEME: SolidTheme = {
  preset: 'black',
  background: '#000000',
  backgroundOpacity: 100,
  textColor: '#ffffff',
  textOpacity: 100,
  textContrast: 100
}

export const DEFAULT_LAYOUT: IslandLayout = {
  anchor: 'top-center',
  scale: 50,
  orientation: 'horizontal',
  x: null,
  y: null,
  freeDrag: true
}

export const DEFAULT_TOOLS: ToolSettings = {
  media: true,
  clipboard: false,
  system: false,
  fileShelf: false,
  clipboardMax: 80,
  clipboardClearOnStart: true,
  shelfClearOnStart: false
}

export const DEFAULT_SETTINGS: Settings = {
  renderMode: 'glass',
  theme: 'system',
  captureBackdrop: true,
  glassCustom: DEFAULT_GLASS_CUSTOM,
  solidTheme: DEFAULT_SOLID_THEME,
  layout: DEFAULT_LAYOUT,
  tools: DEFAULT_TOOLS,
  reduceMotion: false,
  showSeconds: false,
  notificationsBridge: true,
  startAtLogin: false,
  searchRoots: DEFAULT_ROOTS(),
  panelWidth: 980
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function clampFloat(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n * 10) / 10))
}

function sanitizeHex(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback
}

function sanitizeGlassCustom(patch: unknown, current: GlassCustom): GlassCustom {
  const raw = patch && typeof patch === 'object' ? (patch as Partial<GlassCustom>) : {}
  return {
    glassOpacity: clampNumber(raw.glassOpacity, 0, 100, current.glassOpacity),
    blur: clampNumber(raw.blur, 0, 60, current.blur),
    radius: clampNumber(raw.radius, 12, 60, current.radius),
    contrast: clampNumber(raw.contrast, 30, 100, current.contrast),
    borderWidth: clampFloat(raw.borderWidth, 0, 4, current.borderWidth),
    borderOpacity: clampNumber(raw.borderOpacity, 0, 100, current.borderOpacity),
    accent: sanitizeHex(raw.accent, current.accent)
  }
}

function sanitizeSolidTheme(patch: unknown, current: SolidTheme): SolidTheme {
  const raw = patch && typeof patch === 'object' ? (patch as Partial<SolidTheme>) : {}
  const presets: SolidPreset[] = ['black', 'white', 'custom']
  return {
    preset: presets.includes(raw.preset as SolidPreset) ? (raw.preset as SolidPreset) : current.preset,
    background: sanitizeHex(raw.background, current.background),
    backgroundOpacity: clampNumber(raw.backgroundOpacity, 0, 100, current.backgroundOpacity),
    textColor: sanitizeHex(raw.textColor, current.textColor),
    textOpacity: clampNumber(raw.textOpacity, 0, 100, current.textOpacity),
    textContrast: clampNumber(raw.textContrast, 30, 100, current.textContrast)
  }
}

function sanitizeLayout(patch: unknown, current: IslandLayout): IslandLayout {
  const raw = patch && typeof patch === 'object' ? (patch as Partial<IslandLayout>) : {}
  const anchors = ['top-center', 'bottom-center', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'custom']
  const anchor = anchors.includes(raw.anchor as string) ? (raw.anchor as IslandLayout['anchor']) : current.anchor
  const custom = anchor === 'custom'
  return {
    anchor,
    scale: clampNumber(raw.scale, 25, 100, current.scale),
    orientation: raw.orientation === 'vertical' ? 'vertical' : raw.orientation === 'horizontal' ? 'horizontal' : current.orientation,
    x: custom && Number.isFinite(Number(raw.x)) ? Math.max(0, Math.round(Number(raw.x))) : custom ? current.x : null,
    y: custom && Number.isFinite(Number(raw.y)) ? Math.max(0, Math.round(Number(raw.y))) : custom ? current.y : null,
    freeDrag: typeof raw.freeDrag === 'boolean' ? raw.freeDrag : current.freeDrag
  }
}

function sanitize(patch: Partial<Settings>, current: Settings): Settings {
  const next: Settings = { ...current }
  if (patch.renderMode === 'glass' || patch.renderMode === 'solid') next.renderMode = patch.renderMode
  if (patch.theme === 'system' || patch.theme === 'light' || patch.theme === 'dark' || patch.theme === 'custom') {
    next.theme = patch.theme
  }
  if (typeof patch.captureBackdrop === 'boolean') next.captureBackdrop = patch.captureBackdrop
  if (patch.glassCustom && typeof patch.glassCustom === 'object') {
    next.glassCustom = sanitizeGlassCustom(patch.glassCustom, current.glassCustom)
  }
  if (patch.solidTheme && typeof patch.solidTheme === 'object') {
    next.solidTheme = sanitizeSolidTheme(patch.solidTheme, current.solidTheme)
  }
  if (patch.layout && typeof patch.layout === 'object') {
    next.layout = sanitizeLayout(patch.layout, current.layout)
  }
  if (patch.tools && typeof patch.tools === 'object') {
    const raw = patch.tools as Partial<ToolSettings>
    next.tools = {
      media: typeof raw.media === 'boolean' ? raw.media : current.tools.media,
      clipboard: typeof raw.clipboard === 'boolean' ? raw.clipboard : current.tools.clipboard,
      system: typeof raw.system === 'boolean' ? raw.system : current.tools.system,
      fileShelf: typeof raw.fileShelf === 'boolean' ? raw.fileShelf : current.tools.fileShelf,
      clipboardMax: clampNumber(raw.clipboardMax, 10, 300, current.tools.clipboardMax),
      clipboardClearOnStart:
        typeof raw.clipboardClearOnStart === 'boolean'
          ? raw.clipboardClearOnStart
          : current.tools.clipboardClearOnStart,
      shelfClearOnStart:
        typeof raw.shelfClearOnStart === 'boolean' ? raw.shelfClearOnStart : current.tools.shelfClearOnStart
    }
  }
  if (typeof patch.reduceMotion === 'boolean') next.reduceMotion = patch.reduceMotion
  if (typeof patch.showSeconds === 'boolean') next.showSeconds = patch.showSeconds
  if (typeof patch.notificationsBridge === 'boolean') next.notificationsBridge = patch.notificationsBridge
  if (typeof patch.startAtLogin === 'boolean') next.startAtLogin = patch.startAtLogin
  if (typeof patch.panelWidth === 'number') next.panelWidth = clampNumber(patch.panelWidth, 760, 1120, current.panelWidth)
  if (Array.isArray(patch.searchRoots)) {
    const unique = new Set<string>()
    for (const candidate of patch.searchRoots) {
      if (typeof candidate !== 'string' || !candidate.trim()) continue
      try {
        const resolved = fs.realpathSync(candidate.trim())
        if (fs.statSync(resolved).isDirectory()) unique.add(resolved)
      } catch {
        /* skip roots that disappeared */
      }
    }
    next.searchRoots = unique.size > 0 ? Array.from(unique).slice(0, 8) : DEFAULT_ROOTS()
  }
  return next
}

class SettingsService extends EventEmitter {
  private readonly store: JsonStore<Settings>
  private settings: Settings

  constructor() {
    super()
    this.store = new JsonStore<Settings>(userDataPath('settings.json'), DEFAULT_SETTINGS)
    this.settings = sanitize(this.store.get(), DEFAULT_SETTINGS)
    nativeTheme.themeSource = this.settings.theme === 'custom' ? 'dark' : this.settings.theme
  }

  init(): void {
    nativeTheme.on('updated', () => {
      this.emit('theme', this.resolvedTheme())
    })
    this.applyStartAtLogin(this.settings.startAtLogin)
  }

  get(): Settings {
    return this.settings
  }

  flush(): void {
    this.store.flush()
  }

  resolvedTheme(): ResolvedTheme {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  }

  update(patch: Partial<Settings>): Settings {
    const before = this.settings
    this.settings = sanitize(patch, before)
    this.store.replace(this.settings)

    if (before.theme !== this.settings.theme) {
      nativeTheme.themeSource = this.settings.theme === 'custom' ? 'dark' : this.settings.theme
      this.emit('theme', this.resolvedTheme())
    }
    if (before.startAtLogin !== this.settings.startAtLogin) {
      this.applyStartAtLogin(this.settings.startAtLogin)
    }
    if (JSON.stringify(before.searchRoots) !== JSON.stringify(this.settings.searchRoots)) {
      this.emit('search-roots', this.settings.searchRoots)
    }
    this.emit('settings', this.settings)
    return this.settings
  }

  private applyStartAtLogin(enabled: boolean): void {
    try {
      // Portable builds run from a temp extraction folder. electron-builder
      // exposes the original portable exe via this env var.
      const executable = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath
      app.setLoginItemSettings({ openAtLogin: enabled, path: executable, args: [] })
    } catch {
      /* login item registration is optional */
    }
  }
}

export const settingsService = new SettingsService()
