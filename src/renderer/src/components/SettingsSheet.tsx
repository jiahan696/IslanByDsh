import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import {
  Clipboard as ClipboardIcon,
  Database,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Info,
  Move,
  Palette,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Wifi,
  Wrench
} from 'lucide-react'
import type {
  GlassCustom,
  IslandLayout,
  LayoutAnchor,
  LayoutOrientation,
  RenderMode,
  Settings,
  SolidTheme,
  ThemeMode
} from '@shared/types'
import { useIsland } from '../store'
import { Modal, Segmented, Switch } from './ui'

const DEFAULT_GLASS_CUSTOM: GlassCustom = {
  glassOpacity: 58,
  blur: 18,
  radius: 32,
  contrast: 82,
  borderWidth: 1,
  borderOpacity: 35,
  accent: '#7c8cff'
}

const DEFAULT_SOLID_THEME: SolidTheme = {
  preset: 'black',
  background: '#000000',
  backgroundOpacity: 100,
  textColor: '#ffffff',
  textOpacity: 100,
  textContrast: 100
}

function ColorField({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (value: string) => void
}): ReactNode {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  const commit = (): void => {
    const normalized = draft.trim().startsWith('#') ? draft.trim() : `#${draft.trim()}`
    if (/^#[0-9a-f]{6}$/i.test(normalized)) onChange(normalized.toLowerCase())
    else setDraft(value)
  }

  return (
    <label className="theme-custom-field">
      <span>
        <span>{label}</span>
        <b>{value}</b>
      </span>
      <span className="theme-color-row">
        <input
          type="color"
          value={value}
          onChange={(event) => {
            setDraft(event.target.value)
            onChange(event.target.value)
          }}
          aria-label={label}
        />
        <input
          className="input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            }
          }}
          aria-label={`${label} HEX`}
          spellCheck={false}
        />
      </span>
    </label>
  )
}

export function SettingsSheet(): ReactNode {
  const open = useIsland((state) => state.settingsOpen)
  const setOpen = useIsland((state) => state.setSettingsOpen)
  const settings = useIsland((state) => state.settings)
  const setSettings = useIsland((state) => state.setSettings)
  const notifications = useIsland((state) => state.notifications)
  const metrics = useIsland((state) => state.metrics)
  const searchStatus = useIsland((state) => state.searchStatus)
  const version = useIsland((state) => state.version)
  const pushToast = useIsland((state) => state.pushToast)
  const [width, setWidth] = useState(settings.panelWidth)

  useEffect(() => {
    setWidth(settings.panelWidth)
  }, [settings.panelWidth])

  const update = async (patch: Partial<Settings>): Promise<void> => {
    try {
      const next = await window.island.updateSettings(patch)
      if (next) setSettings(next)
    } catch (error) {
      // A mode switch must never take down the renderer. Keep the previous
      // settings and surface the failure instead.
      pushToast({
        id: `settings-${Date.now()}`,
        kind: 'error',
        text: error instanceof Error ? error.message : '设置保存失败'
      })
    }
  }

  const addRoot = async (): Promise<void> => {
    const picked = await window.island.pickSearchRoot()
    if (!picked || settings.searchRoots.includes(picked)) return
    const next = await window.island.updateSettings({ searchRoots: [...settings.searchRoots, picked] })
    setSettings(next)
    pushToast({ id: `root-${Date.now()}`, kind: 'info', text: '索引目录已更新，正在重建索引' })
  }

  const removeRoot = async (root: string): Promise<void> => {
    const next = await window.island.updateSettings({ searchRoots: settings.searchRoots.filter((item) => item !== root) })
    setSettings(next)
  }

  const updateGlass = (patch: Partial<GlassCustom>): void => {
    void update({ glassCustom: { ...settings.glassCustom, ...patch } })
  }

  const updateSolid = (patch: Partial<SolidTheme>): void => {
    void update({ solidTheme: { ...settings.solidTheme, ...patch, preset: 'custom' } })
  }

  const applySolidPreset = (preset: 'black' | 'white'): void => {
    void update({
      solidTheme:
        preset === 'black'
          ? { ...DEFAULT_SOLID_THEME, preset: 'black' }
          : {
              preset: 'white',
              background: '#ffffff',
              backgroundOpacity: 100,
              textColor: '#000000',
              textOpacity: 100,
              textContrast: 100
            }
    })
  }

  const resetAppearance = (): void => {
    void update({
      renderMode: 'glass',
      theme: 'system',
      captureBackdrop: true,
      glassCustom: DEFAULT_GLASS_CUSTOM,
      solidTheme: DEFAULT_SOLID_THEME
    })
  }

  const updateLayout = (patch: Partial<IslandLayout>): void => {
    void update({ layout: { ...settings.layout, ...patch } })
  }

  const setAnchor = (anchor: LayoutAnchor): void => {
    updateLayout(anchor === 'custom' ? { anchor } : { anchor, x: null, y: null })
  }

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="设置" subtitle="所有设置保存在本机，不上传云端" width={600}>
      <div className="settings-scroll">
        <section className="settings-section">
          <h3>
            <Palette size={14} /> 外观
          </h3>
          <div className="setting-row render-mode-row">
            <div>
              <strong>渲染模式</strong>
              <span>液态玻璃与纯色背景完全独立，切换立即生效</span>
            </div>
            <Segmented<RenderMode>
              size="sm"
              value={settings.renderMode}
              onChange={(value) => void update({ renderMode: value })}
              options={[
                { value: 'glass', label: '液态玻璃' },
                { value: 'solid', label: '纯色背景' }
              ]}
            />
          </div>
          <div className="render-mode-note">
            {settings.renderMode === 'glass'
              ? '玻璃参数只影响液态玻璃；桌面采样、透明度、模糊等不会写入纯色模式。'
              : '纯色模式禁用 backdrop-filter 与桌面采样，只填充下方纯色参数。'}
          </div>

          {settings.renderMode === 'glass' ? (
            <>
              <div className="setting-row">
                <div>
                  <strong>主题</strong>
                  <span>跟随系统、固定浅 / 深色，或使用独立的自定义玻璃参数</span>
                </div>
                <Segmented<ThemeMode>
                  size="sm"
                  value={settings.theme}
                  onChange={(value) => void update({ theme: value })}
                  options={[
                    { value: 'system', label: '跟随系统' },
                    { value: 'light', label: '浅色' },
                    { value: 'dark', label: '深色' },
                    { value: 'custom', label: '自定义' }
                  ]}
                />
              </div>

              {settings.theme === 'custom' ? (
                <div className="theme-custom-grid">
                  {[
                    { label: '玻璃透明度', key: 'glassOpacity' as const, min: 0, max: 100, step: 1, suffix: '%' },
                    { label: '背景模糊', key: 'blur' as const, min: 0, max: 60, step: 1, suffix: 'px' },
                    { label: '圆角大小', key: 'radius' as const, min: 12, max: 60, step: 1, suffix: 'px' },
                    { label: '文字对比度', key: 'contrast' as const, min: 30, max: 100, step: 1, suffix: '%' },
                    { label: '边框粗细', key: 'borderWidth' as const, min: 0, max: 4, step: 0.5, suffix: 'px' },
                    { label: '边框透明度', key: 'borderOpacity' as const, min: 0, max: 100, step: 1, suffix: '%' }
                  ].map((item) => (
                    <label className="theme-custom-field" key={item.key}>
                      <span>
                        <span>{item.label}</span>
                        <b>
                          {settings.glassCustom[item.key]}
                          {item.suffix}
                        </b>
                      </span>
                      <input
                        className="range"
                        type="range"
                        min={item.min}
                        max={item.max}
                        step={item.step}
                        value={settings.glassCustom[item.key]}
                        onChange={(event) => updateGlass({ [item.key]: Number(event.target.value) })}
                        aria-label={item.label}
                      />
                    </label>
                  ))}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <ColorField label="主色调" value={settings.glassCustom.accent} onChange={(value) => updateGlass({ accent: value })} />
                  </div>
                </div>
              ) : null}

              <div className="setting-row">
                <div>
                  <strong>桌面背景采样</strong>
                  <span>以约 1.6 秒节流采样屏幕，生成真实折射玻璃；关闭后使用柔和渐变</span>
                </div>
                <Switch
                  checked={settings.captureBackdrop}
                  onChange={(value) => void update({ captureBackdrop: value })}
                  label="桌面背景采样"
                />
              </div>
            </>
          ) : (
            <>
              <div className="setting-row">
                <div>
                  <strong>纯色预设</strong>
                  <span>纯黑 / 纯白一键切换；修改任一参数后自动归为自定义</span>
                </div>
                <div className="theme-preset-row">
                  <button
                    type="button"
                    className={`theme-preset ${settings.solidTheme.preset === 'black' ? 'is-active' : ''}`}
                    onClick={() => applySolidPreset('black')}
                  >
                    <span className="theme-preset-dot" style={{ background: '#000000' }} />
                    纯黑
                  </button>
                  <button
                    type="button"
                    className={`theme-preset ${settings.solidTheme.preset === 'white' ? 'is-active' : ''}`}
                    onClick={() => applySolidPreset('white')}
                  >
                    <span className="theme-preset-dot" style={{ background: '#ffffff' }} />
                    纯白
                  </button>
                </div>
              </div>

              <div className="theme-custom-grid solid-controls">
                <div style={{ gridColumn: '1 / -1' }}>
                  <ColorField
                    label="背景颜色"
                    value={settings.solidTheme.background}
                    onChange={(value) => updateSolid({ background: value })}
                  />
                </div>
                <label className="theme-custom-field">
                  <span>
                    <span>背景透明度</span>
                    <b>{settings.solidTheme.backgroundOpacity}%</b>
                  </span>
                  <input
                    className="range"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={settings.solidTheme.backgroundOpacity}
                    onChange={(event) => updateSolid({ backgroundOpacity: Number(event.target.value) })}
                    aria-label="背景透明度"
                  />
                </label>
                <div style={{ gridColumn: '1 / -1' }}>
                  <ColorField
                    label="文字颜色"
                    value={settings.solidTheme.textColor}
                    onChange={(value) => updateSolid({ textColor: value })}
                  />
                </div>
                <label className="theme-custom-field">
                  <span>
                    <span>文字透明度</span>
                    <b>{settings.solidTheme.textOpacity}%</b>
                  </span>
                  <input
                    className="range"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={settings.solidTheme.textOpacity}
                    onChange={(event) => updateSolid({ textOpacity: Number(event.target.value) })}
                    aria-label="文字透明度"
                  />
                </label>
                <label className="theme-custom-field">
                  <span>
                    <span>文字对比度</span>
                    <b>{settings.solidTheme.textContrast}%</b>
                  </span>
                  <input
                    className="range"
                    type="range"
                    min={30}
                    max={100}
                    step={1}
                    value={settings.solidTheme.textContrast}
                    onChange={(event) => updateSolid({ textContrast: Number(event.target.value) })}
                    aria-label="文字对比度"
                  />
                </label>
              </div>
            </>
          )}
          <div className="setting-row">
            <div>
              <strong>减少动态效果</strong>
              <span>关闭歌词滚动、等化器与大部分过渡动画</span>
            </div>
            <Switch
              checked={settings.reduceMotion}
              onChange={(value) => void update({ reduceMotion: value })}
              label="减少动态效果"
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>胶囊显示秒数</strong>
              <span>时间默认精确到分钟，开启后显示秒</span>
            </div>
            <Switch
              checked={settings.showSeconds}
              onChange={(value) => void update({ showSeconds: value })}
              label="显示秒数"
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>面板宽度</strong>
              <span>{width}px · 适配 1080p 与更窄的屏幕</span>
            </div>
            <input
              className="range"
              type="range"
              min={820}
              max={1120}
              step={20}
              value={width}
              onChange={(event) => setWidth(Number(event.target.value))}
              onPointerUp={() => void update({ panelWidth: width })}
              onKeyUp={() => void update({ panelWidth: width })}
              aria-label="面板宽度"
            />
          </div>
          <div className="settings-appearance-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetAppearance}>
              恢复默认外观
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h3>
            <Move size={14} /> 灵动岛布局
          </h3>
          <div className="setting-row">
            <div>
              <strong>自由拖拽</strong>
              <span>开启后可按住胶囊拖动；松手位置自动保存</span>
            </div>
            <Switch
              checked={settings.layout.freeDrag}
              onChange={(value) => updateLayout({ freeDrag: value })}
              label="自由拖拽"
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>位置</strong>
              <span>预设位置或拖动后保存的自定义位置</span>
            </div>
            <div className="layout-preset-grid">
              {[
                ['top-center', '顶部居中'],
                ['bottom-center', '底部居中'],
                ['top-left', '左上'],
                ['top-right', '右上'],
                ['bottom-left', '左下'],
                ['bottom-right', '右下']
              ].map(([anchor, label]) => (
                <button
                  key={anchor}
                  type="button"
                  className={`layout-preset ${settings.layout.anchor === anchor ? 'is-active' : ''}`}
                  onClick={() => setAnchor(anchor as LayoutAnchor)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <div>
              <strong>缩放</strong>
              <span>{settings.layout.scale}% · 25%–100%</span>
            </div>
            <input
              className="range"
              type="range"
              min={25}
              max={100}
              step={5}
              value={settings.layout.scale}
              onChange={(event) => updateLayout({ scale: Number(event.target.value) })}
              aria-label="胶囊缩放"
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>胶囊方向</strong>
              <span>横向或竖向排列，窗口与 mask 会同步跟随</span>
            </div>
            <Segmented<LayoutOrientation>
              size="sm"
              value={settings.layout.orientation}
              onChange={(value) => updateLayout({ orientation: value })}
              options={[
                { value: 'horizontal', label: '横向' },
                { value: 'vertical', label: '竖向' }
              ]}
            />
          </div>
          <div className="settings-note">
            <Info size={13} />
            布局设置属于两种渲染模式共用，不会随玻璃 / 纯色切换而隐藏或清空。
          </div>
        </section>

        <section className="settings-section">
          <h3>
            <Wrench size={14} /> 工具模块
          </h3>
          <div className="setting-row">
            <div>
              <strong>媒体控制</strong>
              <span>检测系统播放源，胶囊中显示曲名与播放状态</span>
            </div>
            <Switch
              checked={settings.tools.media}
              onChange={(checked) => void update({ tools: { ...settings.tools, media: checked } })}
              label="启用媒体控制工具"
            />
          </div>
          <div className="setting-row">
            <div>
              <strong><ClipboardIcon size={12} /> 剪贴板历史</strong>
              <span>低功耗监听复制记录；固定条目永久保留</span>
            </div>
            <Switch
              checked={settings.tools.clipboard}
              onChange={(checked) => void update({ tools: { ...settings.tools, clipboard: checked } })}
              label="启用剪贴板工具"
            />
          </div>
          <div className="setting-row">
            <div>
              <strong><SlidersHorizontal size={12} /> 系统控制</strong>
              <span>亮度、音量、锁定键、电量与截图录屏</span>
            </div>
            <Switch
              checked={settings.tools.system}
              onChange={(checked) => void update({ tools: { ...settings.tools, system: checked } })}
              label="启用系统控制工具"
            />
          </div>
          <div className="setting-row">
            <div>
              <strong><FolderOpen size={12} /> 文件暂存架</strong>
              <span>拖入文件暂存，再拖回任意文件夹或应用</span>
            </div>
            <Switch
              checked={settings.tools.fileShelf}
              onChange={(checked) => void update({ tools: { ...settings.tools, fileShelf: checked } })}
              label="启用文件暂存架"
            />
          </div>
          <div className="settings-note">
            <Info size={13} />
            停用的工具不会渲染、不监听、不占用胶囊宽度；开启后按独立宽度追加。
          </div>
        </section>

        <section className="settings-section">
          <h3>
            <Wifi size={14} /> 通知与启动
          </h3>
          <div className="setting-row">
            <div>
              <strong>本地通知桥接</strong>
              <span>
                监听 127.0.0.1:{notifications.sources.bridgePort ?? '—'}，需要 notification-bridge.json 中的令牌
              </span>
            </div>
            <Switch
              checked={settings.notificationsBridge}
              onChange={(value) => void update({ notificationsBridge: value })}
              label="本地通知桥接"
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>开机自启</strong>
              <span>通过 Windows 登录项启动；便携版指向原始 exe</span>
            </div>
            <Switch
              checked={settings.startAtLogin}
              onChange={(value) => void update({ startAtLogin: value })}
              label="开机自启"
            />
          </div>
          <div className="settings-note">
            <ShieldCheck size={13} />
            微信 / QQ 没有公开的系统通知读取接口。精确未读通过本地桥接接入；应用只监听本机回环地址，不接受远程连接，也不会上传消息内容。
          </div>
        </section>

        <section className="settings-section">
          <h3>
            <Database size={14} /> 文件索引
          </h3>
          <div className="settings-roots">
            {settings.searchRoots.map((root) => (
              <span className="settings-root" key={root} title={root}>
                <HardDrive size={12} />
                <span>{root}</span>
                <button type="button" aria-label="移除目录" onClick={() => void removeRoot(root)}>
                  <Trash2 size={12} />
                </button>
              </span>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void addRoot()}>
              <FolderPlus size={13} /> 添加索引目录
            </button>
          </div>
          <div className="settings-note">
            <Info size={13} />
            索引只保存文件名与路径，最多 80,000 条、递归 7 层；目录变化通过文件监控触发重建，不使用定时全盘扫描。
          </div>
        </section>

        <section className="settings-section">
          <h3>
            <Settings2 size={14} /> 运行信息
          </h3>
          <dl className="settings-meta">
            <div>
              <dt>版本</dt>
              <dd>v{version}</dd>
            </div>
            <div>
              <dt>今日 API 调用</dt>
              <dd>{metrics.apiUsage.today} 次</dd>
            </div>
            <div>
              <dt>索引文件数</dt>
              <dd>{searchStatus.indexed.toLocaleString()}</dd>
            </div>
            <div>
              <dt>数据位置</dt>
              <dd>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    window.island.openSettingsFile()
                    pushToast({ id: `data-${Date.now()}`, kind: 'info', text: '已在资源管理器中定位数据文件' })
                  }}
                >
                  打开数据目录
                </button>
              </dd>
            </div>
          </dl>
          <div className="settings-note">
            系统指标 1s / 3s / 5s 分级采样；媒体 900ms 采样并合并到 1s 事件；蓝牙 45s；文件索引事件驱动；窗口隐藏时暂停桌面采样。
          </div>
        </section>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>
          完成
        </button>
      </div>
    </Modal>
  )
}
