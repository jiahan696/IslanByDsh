import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react'
import {
  Bell,
  BellOff,
  Check,
  Clipboard as ClipboardIcon,
  Copy,
  File,
  Folder,
  FolderOpen,
  Image,
  Monitor,
  Pin,
  Search,
  SlidersHorizontal,
  Trash2,
  Video,
  Volume2,
  VolumeX,
  X
} from 'lucide-react'
import { useIsland } from '../store'
import { useNow } from '../lib/hooks'
import { formatDuration } from '../lib/format'
import { startRecording, stopRecording } from '../lib/recorder'
import { Switch } from './ui'

function CardHead({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }): ReactNode {
  return (
    <div className="tool-head">
      <div>
        <span className="tool-title">
          {icon} {title}
        </span>
        {hint ? <span className="tool-sub">{hint}</span> : null}
      </div>
    </div>
  )
}

export function ClipboardCard(): ReactNode {
  const items = useIsland((state) => state.clipboard)
  const setClipboard = useIsland((state) => state.setClipboard)
  const settings = useIsland((state) => state.settings)
  const pushToast = useIsland((state) => state.pushToast)
  const [query, setQuery] = useState('')

  const visible = items.filter((item) => !query.trim() || item.text.toLowerCase().includes(query.toLowerCase()))

  const copy = async (id: string): Promise<void> => {
    setClipboard(await window.island.clipboard('copy', { id }))
    pushToast({ id: `clip-${Date.now()}`, kind: 'info', text: '已复制到剪贴板' })
  }

  return (
    <section className="tool-card productivity-card">
      <CardHead icon={<ClipboardIcon size={14} />} title="剪贴板" hint={`${items.length} 条 · 固定内容永久保留`} />
      <div className="clipboard-search">
        <Search size={12} />
        <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选剪贴内容…" aria-label="筛选剪贴板" />
      </div>
      <div className="clipboard-list">
        {visible.length === 0 ? (
          <div className="productivity-empty">复制文字后会自动出现在这里</div>
        ) : (
          visible.slice(0, 12).map((item) => (
            <div key={item.id} className={`clipboard-row ${item.pinned ? 'is-pinned' : ''}`}>
              <button type="button" className="clipboard-text" onClick={() => void copy(item.id)} title={item.text}>
                {item.text.replace(/\s+/g, ' ')}
              </button>
              <button
                type="button"
                className={`icon-mini ${item.pinned ? 'is-active' : ''}`}
                onClick={async () => setClipboard(await window.island.clipboard('pin', { id: item.id }))}
                aria-label={item.pinned ? '取消固定' : '固定'}
              >
                <Pin size={12} />
              </button>
              <button
                type="button"
                className="icon-mini"
                onClick={async () => setClipboard(await window.island.clipboard('remove', { id: item.id }))}
                aria-label="删除"
              >
                <X size={12} />
              </button>
            </div>
          ))
        )}
      </div>
      <div className="productivity-foot">
        <label className="inline-field">
          最多
          <select
            className="input input-mini"
            value={settings.tools.clipboardMax}
            onChange={(event) => void window.island.updateSettings({ tools: { ...settings.tools, clipboardMax: Number(event.target.value) } })}
            aria-label="剪贴板最大条数"
          >
            {[30, 50, 80, 120, 200].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          条
        </label>
        <label className="inline-field">
          启动清空
          <Switch
            checked={settings.tools.clipboardClearOnStart}
            onChange={(checked) => void window.island.updateSettings({ tools: { ...settings.tools, clipboardClearOnStart: checked } })}
            label="启动时清空临时剪贴"
          />
        </label>
        <button type="button" className="btn btn-sm" onClick={async () => setClipboard(await window.island.clipboard('clear'))}>
          <Trash2 size={12} /> 清空
        </button>
      </div>
    </section>
  )
}

export function SystemCard(): ReactNode {
  const system = useIsland((state) => state.system)
  const metrics = useIsland((state) => state.metrics)
  const recording = useIsland((state) => state.recording)
  const pushToast = useIsland((state) => state.pushToast)
  const [brightness, setBrightness] = useState(system.brightness ?? 50)
  const [volume, setVolume] = useState(system.volume)
  const [preview, setPreview] = useState<{ url: string; path?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const now = useNow(recording.active ? 1000 : 60_000)

  useEffect(() => setBrightness(system.brightness ?? 50), [system.brightness])
  useEffect(() => setVolume(system.volume), [system.volume])

  const screenshot = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await window.island.systemScreenshot()
      if (!result.ok || !result.dataUrl) {
        pushToast({ id: `shot-${Date.now()}`, kind: 'error', text: result.message })
        return
      }
      setPreview({ url: result.dataUrl, path: result.path })
      pushToast({ id: `shot-${Date.now()}`, kind: 'info', text: '截图已保存到图片目录' })
    } finally {
      setBusy(false)
    }
  }

  const toggleRecording = async (): Promise<void> => {
    if (recording.active) {
      stopRecording()
      return
    }
    const error = await startRecording()
    if (error) pushToast({ id: `rec-${Date.now()}`, kind: 'error', text: `无法开始录屏：${error}` })
  }

  const toggleRegionRecording = async (): Promise<void> => {
    if (recording.active) return
    const region = await window.island.systemSelectRegion()
    if (!region) return
    const error = await startRecording(region)
    if (error) pushToast({ id: `rec-${Date.now()}`, kind: 'error', text: `无法开始录屏：${error}` })
  }

  return (
    <section className="tool-card productivity-card">
      <CardHead
        icon={<SlidersHorizontal size={14} />}
        title="系统控制"
        hint={`${metrics.battery.isCharging ? '充电中' : '电池'} ${Math.round(metrics.battery.percent ?? 0)}%`}
      />
      <div className="system-slider-row">
        <span className="system-label"><Monitor size={12} /> 亮度</span>
        <input
          className="seek"
          type="range"
          min={0}
          max={100}
          value={brightness}
          onChange={(event) => setBrightness(Number(event.target.value))}
          onPointerUp={() => void window.island.systemSetBrightness(brightness)}
          onKeyUp={() => void window.island.systemSetBrightness(brightness)}
          aria-label="屏幕亮度"
        />
        <span className="system-value">{brightness}%</span>
      </div>
      <div className="system-slider-row">
        <span className="system-label"><Volume2 size={12} /> 音量</span>
        <input
          className="seek"
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(event) => setVolume(Number(event.target.value))}
          onPointerUp={() => void window.island.systemSetVolume(volume)}
          onKeyUp={() => void window.island.systemSetVolume(volume)}
          aria-label="系统音量"
        />
        <button type="button" className={`icon-mini ${system.muted ? 'is-active' : ''}`} onClick={() => void window.island.systemToggleMute()} aria-label="静音">
          {system.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>
        <span className="system-value">{volume}%</span>
      </div>
      <div className="lock-row">
        <span className={`lock-chip ${system.capsLock ? 'is-on' : ''}`}>Caps {system.capsLock ? 'ON' : 'OFF'}</span>
        <span className={`lock-chip ${system.numLock ? 'is-on' : ''}`}>Num {system.numLock ? 'ON' : 'OFF'}</span>
        <span className="lock-chip battery-chip">电量 {Math.round(metrics.battery.percent ?? 0)}%</span>
      </div>
      <div className="capture-row">
        <button type="button" className="btn btn-sm" onClick={() => void screenshot()} disabled={busy}>
          <Image size={12} /> {busy ? '选择区域…' : '选区截图'}
        </button>
        <button type="button" className={`btn btn-sm ${recording.active ? 'is-danger' : ''}`} onClick={() => void toggleRecording()}>
          <Video size={12} /> {recording.active ? '停止录屏' : '全屏录屏'}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => void toggleRegionRecording()} disabled={recording.active}>
          <Video size={12} /> 选区录屏
        </button>
        {recording.active && recording.startedAt ? (
          <span className="recording-pill">
            <span className="rec-dot" /> REC {formatDuration(now.getTime() - (recording.startedAt ?? now.getTime()))}
          </span>
        ) : null}
      </div>
      {preview ? (
        <div className="shot-preview">
          <img src={preview.url} alt="截图预览" />
          <div className="shot-preview-foot">
            <span title={preview.path}>{preview.path ?? '截图预览'}</span>
            <button
              type="button"
              className="icon-mini"
              onClick={async () => {
                const result = await window.island.systemCopyScreenshot(preview.url)
                pushToast({ id: `copy-shot-${Date.now()}`, kind: result.ok ? 'info' : 'error', text: result.message })
              }}
              aria-label="复制截图"
              title="复制截图"
            >
              <Copy size={12} />
            </button>
            {preview.path ? (
              <button type="button" className="icon-mini" onClick={() => window.island.revealPath(preview.path!)} aria-label="打开截图位置" title="打开位置">
                <FolderOpen size={12} />
              </button>
            ) : null}
            <button type="button" className="icon-mini" onClick={() => setPreview(null)} aria-label="关闭预览">
              <X size={12} />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export function FilesCard(): ReactNode {
  const files = useIsland((state) => state.files)
  const setFiles = useIsland((state) => state.setFiles)
  const settings = useIsland((state) => state.settings)
  const pushToast = useIsland((state) => state.pushToast)
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addPaths = async (paths: string[]): Promise<void> => {
    const unique = paths.filter(Boolean)
    if (!unique.length) return
    setFiles(await window.island.filesAdd(unique))
  }

  const onDrop = (event: DragEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    setOver(false)
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => window.island.getPathForFile(file))
      .filter(Boolean)
    void addPaths(paths)
  }

  const onPick = (event: ChangeEvent<HTMLInputElement>): void => {
    const paths = Array.from(event.target.files ?? [])
      .map((file) => window.island.getPathForFile(file))
      .filter(Boolean)
    void addPaths(paths)
    event.target.value = ''
  }

  return (
    <section className="tool-card productivity-card">
      <CardHead icon={<FolderOpen size={14} />} title="文件暂存架" hint={`${files.length} 项 · 可拖回任意窗口`} />
      <div
        className={`shelf-drop ${over ? 'is-over' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <FolderOpen size={18} />
        <span>把文件或文件夹拖到这里</span>
        <button type="button" className="btn btn-sm" onClick={() => inputRef.current?.click()}>
          选择文件
        </button>
        <input ref={inputRef} type="file" multiple hidden onChange={onPick} />
      </div>
      <div className="shelf-list">
        {files.length === 0 ? <div className="productivity-empty">暂存文件会保留到下次启动</div> : null}
        {files.slice(0, 10).map((item) => (
          <div key={item.id} className="shelf-row">
            <span className="shelf-icon" aria-hidden>
              {item.icon ? <img src={item.icon} alt="" /> : item.isDir ? <Folder size={13} /> : <File size={13} />}
            </span>
            <span className="shelf-name" title={item.path}>{item.name}</span>
            <button
              type="button"
              className="icon-mini"
              draggable
              onDragStart={(event) => {
                event.preventDefault()
                window.island.filesDragOut(item.id)
              }}
              title="拖到文件夹或其他应用"
              aria-label={`拖出 ${item.name}`}
            >
              <FolderOpen size={12} />
            </button>
            <button type="button" className="icon-mini" onClick={async () => setFiles(await window.island.filesRemove(item.id))} aria-label="移除">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      <div className="productivity-foot">
        <label className="inline-field">
          启动清空
          <Switch
            checked={settings.tools.shelfClearOnStart}
            onChange={(checked) => void window.island.updateSettings({ tools: { ...settings.tools, shelfClearOnStart: checked } })}
            label="启动时清空文件暂存架"
          />
        </label>
        <button type="button" className="btn btn-sm" onClick={async () => setFiles(await window.island.filesClear())}>
          <Trash2 size={12} /> 清空
        </button>
      </div>
    </section>
  )
}

/** Kept for future per-item toggles; currently the tool is either on or off. */
export function ToolToggle({ enabled, onChange, label }: { enabled: boolean; onChange: (value: boolean) => void; label: string }): ReactNode {
  return <Switch checked={enabled} onChange={onChange} label={label} />
}
