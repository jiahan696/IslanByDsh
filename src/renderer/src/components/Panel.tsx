import type { ReactNode } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Boxes,
  ChevronUp,
  HardDrive,
  Moon,
  Radio,
  Search,
  Settings2,
  Sparkles,
  Sun,
  Wrench
} from 'lucide-react'
import { useIsland, type PanelTab } from '../store'
import { useNow } from '../lib/hooks'
import { formatDateCN } from '../lib/format'
import { WeatherGlyph } from './glyphs'
import { GlassScene } from './GlassScene'
import { IconButton, Segmented } from './ui'
import { MediaCard } from './MediaCard'
import { NotificationsCard } from './NotificationsCard'
import { SystemCard } from './SystemCard'
import { SearchModule } from './SearchModule'
import { AppsModule } from './AppsModule'
import { ToolsModule } from './ToolsModule'
import { SettingsSheet } from './SettingsSheet'

export function Panel({ closing }: { closing: boolean }): ReactNode {
  const settings = useIsland((state) => state.settings)
  const mediaEnabled = settings.tools.media
  const solidMode = settings.renderMode === 'solid'
  const theme = useIsland((state) => state.theme)
  const weather = useIsland((state) => state.weather)
  const tab = useIsland((state) => state.tab)
  const setTab = useIsland((state) => state.setTab)
  const settingsOpen = useIsland((state) => state.settingsOpen)
  const setSettingsOpen = useIsland((state) => state.setSettingsOpen)
  const setSettings = useIsland((state) => state.setSettings)
  const setTheme = useIsland((state) => state.setTheme)
  const now = useNow(30_000)
  const panelRef = useRef<HTMLElement>(null)
  const [origin, setOrigin] = useState({ x: 0, y: 80 })
  const [visited, setVisited] = useState<Set<PanelTab>>(() => new Set<PanelTab>(['search']))

  useEffect(() => {
    setVisited((previous) => {
      if (previous.has(tab)) return previous
      const next = new Set(previous)
      next.add(tab)
      return next
    })
  }, [tab])

  useLayoutEffect(() => {
    const element = panelRef.current
    if (!element) return
    const update = (): void => {
      const width = element.offsetWidth
      const x = Math.max(0, (window.innerWidth - width) / 2)
      setOrigin((previous) => (Math.abs(previous.x - x) < 0.5 ? previous : { x, y: 80 }))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [settings.panelWidth])

  const toggleTheme = async (): Promise<void> => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    const updated = await window.island.updateSettings({ theme: next })
    setSettings(updated)
  }

  return (
    <div className="panel-wrap" style={{ ['--panel-w' as string]: `${settings.panelWidth}px` }}>
      <section
        ref={panelRef}
        className={`panel ${solidMode ? 'solid' : 'glass'} ${closing ? 'is-closing' : ''}`}
        data-glass="panel"
        aria-label="灵动岛面板"
      >
        {solidMode ? null : (
          <span className="glass-clip" aria-hidden>
            <GlassScene x={origin.x} y={origin.y} />
            <span className="glass-tint" />
          </span>
        )}
        {solidMode ? null : <span className="panel-sheen" aria-hidden />}
        <header className="panel-head">
          <div className="panel-brand">
            <span className="brand-mark" aria-hidden>
              <span />
            </span>
            <div className="brand-text">
              <h1>灵动岛</h1>
              <p>
                {formatDateCN(now)} · Liquid Island
              </p>
            </div>
          </div>
          <div className="head-actions">
            <button
              type="button"
              className="weather-pill"
              onClick={() => setTab('tools')}
              title={`${weather.city} · ${weather.condition} · ${weather.source ?? ''}`}
            >
              <WeatherGlyph icon={weather.icon} size={14} />
              <span>{weather.tempC === null ? '--' : Math.round(weather.tempC)}°</span>
              <span className="weather-pill-city">{weather.city}</span>
            </button>
            {solidMode ? null : (
              <IconButton label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'} onClick={() => void toggleTheme()}>
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </IconButton>
            )}
            <IconButton label="设置" onClick={() => setSettingsOpen(true)}>
              <Settings2 size={16} />
            </IconButton>
            <IconButton label="收起面板" onClick={() => void window.island.collapse()}>
              <ChevronUp size={17} />
            </IconButton>
          </div>
        </header>

        <div className="panel-body">
          <aside className="rail">
            {mediaEnabled ? <MediaCard /> : null}
            <NotificationsCard />
            <SystemCard />
          </aside>

          <main className="workspace">
            <div className="workspace-head">
              <Segmented<PanelTab>
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'search', label: '搜索', icon: <Search size={13} /> },
                  { value: 'apps', label: '应用', icon: <Boxes size={13} /> },
                  { value: 'tools', label: '工具', icon: <Wrench size={13} /> }
                ]}
              />
              <span className="workspace-hint">
                {tab === 'search'
                  ? '内存文件名索引 · 即时过滤'
                  : tab === 'apps'
                    ? '注册表 + AppX · 卸载二次确认'
                    : '日历 / 天气 / 计时 / 闹钟 / 待办'}
              </span>
            </div>

            <div className="workspace-body">
              <div className={`workspace-pane ${tab === 'search' ? 'is-active' : ''}`} aria-hidden={tab !== 'search'}>
                {visited.has('search') ? <SearchModule /> : null}
              </div>
              <div className={`workspace-pane ${tab === 'apps' ? 'is-active' : ''}`} aria-hidden={tab !== 'apps'}>
                {visited.has('apps') ? <AppsModule /> : null}
              </div>
              <div className={`workspace-pane ${tab === 'tools' ? 'is-active' : ''}`} aria-hidden={tab !== 'tools'}>
                {visited.has('tools') ? <ToolsModule /> : null}
              </div>
            </div>
          </main>
        </div>

        <PanelFooter />
      </section>

      {settingsOpen ? <SettingsSheet /> : null}
    </div>
  )
}

/**
 * The footer is the only part of the panel that needs the 1 Hz metric stream.
 * Keeping it in its own component prevents the whole panel (and the app list)
 * from re-rendering on every metrics tick.
 */
function PanelFooter(): ReactNode {
  const metrics = useIsland((state) => state.metrics)
  const searchStatus = useIsland((state) => state.searchStatus)
  const notifications = useIsland((state) => state.notifications)
  const version = useIsland((state) => state.version)
  return (
    <footer className="panel-foot">
      <span className="foot-item">
        <span className={`status-dot ${searchStatus.state === 'ready' ? 'is-ok' : ''}`} />
        {searchStatus.state === 'indexing'
          ? `索引中 ${searchStatus.indexed.toLocaleString()}`
          : `索引 ${searchStatus.indexed.toLocaleString()}`}
      </span>
      <span className="foot-item">
        <Radio size={11} />
        {notifications.sources.bridge ? `桥接 :${notifications.sources.bridgePort}` : '桥接关闭'}
      </span>
      <span className="foot-item">
        <Sparkles size={11} />
        API {metrics.apiUsage.today}
      </span>
      <span className="foot-item foot-dim">
        <HardDrive size={11} />
        {searchStatus.roots.length} 目录
      </span>
      <span className="foot-spacer" />
      <span className="foot-shortcut">
        <kbd>Ctrl</kbd>
        <kbd>Alt</kbd>
        <kbd>Space</kbd>
        展开/收起
      </span>
      <span className="foot-version">v{version}</span>
    </footer>
  )
}
