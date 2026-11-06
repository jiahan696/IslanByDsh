import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Box,
  Check,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  X
} from 'lucide-react'
import type { AppEntry, UninstallPreview } from '@shared/types'
import { useIsland } from '../store'
import { formatBytes } from '../lib/format'
import { EmptyState, Modal, Spinner } from './ui'

const iconCache = new Map<string, string | null>()

function AppIcon({ app }: { app: AppEntry }): ReactNode {
  const [src, setSrc] = useState<string | null>(() => iconCache.get(app.id) ?? null)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element || src) return
    if (iconCache.has(app.id)) {
      setSrc(iconCache.get(app.id) ?? null)
      return
    }
    let disposed = false
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        void window.island.getAppIcon(app.id).then((icon) => {
          iconCache.set(app.id, icon)
          if (!disposed) setSrc(icon)
        })
      },
      { threshold: 0.05 }
    )
    observer.observe(element)
    return () => {
      disposed = true
      observer.disconnect()
    }
  }, [app.id, src])

  return (
    <span className={`app-icon ${src ? 'has-image' : ''}`} ref={ref} aria-hidden>
      {src ? <img src={src} alt="" draggable={false} /> : <span>{app.name.slice(0, 1).toUpperCase()}</span>}
    </span>
  )
}

function UninstallDialog({ appId, onClose }: { appId: string | null; onClose: () => void }): ReactNode {
  const pushToast = useIsland((state) => state.pushToast)
  const [preview, setPreview] = useState<UninstallPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    if (!appId) {
      setPreview(null)
      setAcknowledged(false)
      setResult(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setAcknowledged(false)
    setResult(null)
    window.island
      .previewUninstall(appId)
      .then((data) => {
        if (!cancelled) setPreview(data)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [appId])

  const confirm = async (): Promise<void> => {
    if (!appId || !acknowledged || busy) return
    setBusy(true)
    const outcome = await window.island.uninstall(appId)
    setResult(outcome)
    setBusy(false)
    if (outcome.ok) {
      pushToast({ id: `uninstall-${Date.now()}`, kind: 'info', text: outcome.message })
      setTimeout(onClose, 700)
    }
  }

  const app = preview?.app

  return (
    <Modal
      open={Boolean(appId)}
      onClose={() => {
        if (!busy) onClose()
      }}
      title="确认卸载应用"
      subtitle="二次确认 · 命令来自系统登记信息"
      width={560}
    >
      {loading ? (
        <div className="modal-loading">
          <Spinner label="正在读取卸载信息…" />
        </div>
      ) : !app ? (
        <div className="inline-error">该应用已不在清单中，请刷新后重试。</div>
      ) : (
        <>
          <div className="uninstall-app">
            <AppIcon app={app} />
            <div className="uninstall-app-main">
              <strong>{app.name}</strong>
              <span>
                版本 {app.version || '未知'} · {app.publisher || '未知发布者'}
              </span>
              <span className="uninstall-tags">
                <span className={`tag ${app.source === 'store' ? 'tag-store' : ''}`}>
                  {app.source === 'store' ? 'Microsoft Store' : app.hive === 'user' ? '当前用户' : '本机安装'}
                </span>
                {preview?.needsElevation ? <span className="tag tag-warn">可能需要管理员权限</span> : null}
                {app.estimatedSizeKb ? <span className="tag">{formatBytes(app.estimatedSizeKb * 1024)}</span> : null}
              </span>
            </div>
          </div>

          <dl className="detail-grid">
            <div>
              <dt>安装位置</dt>
              <dd title={app.installLocation}>{app.installLocation || '未登记'}</dd>
            </div>
            <div>
              <dt>发布者</dt>
              <dd title={app.publisher}>{app.publisher || '未登记'}</dd>
            </div>
            <div>
              <dt>应用类型</dt>
              <dd>{app.source === 'store' ? 'AppX / 当前用户' : 'Win32 / 注册表卸载项'}</dd>
            </div>
            <div>
              <dt>系统组件</dt>
              <dd>{app.systemComponent ? '是' : '否'}</dd>
            </div>
          </dl>

          <div className="command-box">
            <div className="command-label">
              <ShieldAlert size={13} /> 将要执行的命令（只读展示）
            </div>
            <code>{preview?.command || '该应用没有登记卸载命令'}</code>
          </div>

          <ul className="risk-list">
            <li>
              <AlertTriangle size={13} /> 卸载由应用自带卸载程序完成，用户数据可能保留或一并删除。
            </li>
            <li>
              <AlertTriangle size={13} /> 需要管理员权限时，Windows 会弹出 UAC；本应用不会静默提权，也不保存凭据。
            </li>
            <li>
              <AlertTriangle size={13} /> 命令仅来自注册表或 AppX 包登记信息，不接受来自界面的任意命令。
            </li>
          </ul>

          {result && !result.ok ? <div className="inline-error">{result.message}</div> : null}

          <label className="check-row">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              disabled={busy || !preview?.command}
            />
            <span>
              <Check size={13} /> 我已确认要卸载 <strong>{app.name}</strong>，理解此操作不可撤销
            </span>
          </label>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => void confirm()}
              disabled={!acknowledged || busy || !preview?.command}
            >
              {busy ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
              {busy ? '正在启动卸载…' : '确认卸载'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

export function AppsModule(): ReactNode {
  const appsState = useIsland((state) => state.apps)
  const [filter, setFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase()
    if (!term) return appsState.apps
    return appsState.apps.filter(
      (app) =>
        app.name.toLowerCase().includes(term) ||
        app.publisher.toLowerCase().includes(term) ||
        app.version.toLowerCase().includes(term)
    )
  }, [appsState.apps, filter])

  useEffect(() => {
    if (selectedId && !filtered.some((app) => app.id === selectedId)) setSelectedId(null)
  }, [filtered, selectedId])

  const selected = appsState.apps.find((app) => app.id === selectedId) ?? null

  const refresh = async (): Promise<void> => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await window.island.refreshApps()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="apps-module">
      <div className="apps-toolbar">
        <div className="search-box compact">
          <Search size={15} className="search-icon" />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="过滤应用名称、发布者或版本…"
            aria-label="过滤已安装应用"
          />
          {filter ? (
            <button type="button" className="search-clear" aria-label="清空过滤" onClick={() => setFilter('')}>
              <X size={13} />
            </button>
          ) : null}
        </div>
        <span className="apps-count">
          {filtered.length} / {appsState.apps.length}
        </span>
        <button
          type="button"
          className="icon-btn"
          onClick={() => void refresh()}
          title="刷新应用清单"
          aria-label="刷新应用清单"
          disabled={refreshing}
        >
          <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
        </button>
      </div>

      <div className="apps-list-wrap">
        {appsState.state === 'loading' && appsState.apps.length === 0 ? (
          <div className="result-skeleton">
            {Array.from({ length: 6 }).map((_, index) => (
              <div className="result-sk-row" key={index}>
                <span className="skeleton sk-icon" />
                <span className="sk-lines">
                  <span className="skeleton sk-line" />
                  <span className="skeleton sk-line short" />
                </span>
              </div>
            ))}
          </div>
        ) : appsState.state === 'error' && appsState.apps.length === 0 ? (
          <EmptyState
            icon={<AlertTriangle size={22} />}
            title="应用清单读取失败"
            description={appsState.error ?? '请稍后重试'}
            action={
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void refresh()}>
                重试
              </button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Box size={22} />}
            title={appsState.apps.length ? '没有匹配的应用' : '未读取到已安装应用'}
            description={appsState.apps.length ? '调整过滤关键词，或刷新应用清单。' : '注册表与 AppX 清单为空。'}
          />
        ) : (
          <div className="apps-list" role="listbox" aria-label="已安装应用">
            {filtered.map((app) => (
              <div
                key={app.id}
                role="option"
                aria-selected={selectedId === app.id}
                tabIndex={0}
                className={`app-row ${selectedId === app.id ? 'is-selected' : ''}`}
                onClick={() => setSelectedId(app.id)}
                onDoubleClick={() => {
                  setSelectedId(app.id)
                  setConfirmId(app.id)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setSelectedId(app.id)
                    setConfirmId(app.id)
                  }
                }}
              >
                <AppIcon app={app} />
                <span className="app-row-main">
                  <span className="app-row-name">{app.name}</span>
                  <span className="app-row-sub">
                    {app.publisher || '未知发布者'}
                    {app.version ? ` · ${app.version}` : ''}
                  </span>
                </span>
                <span className="app-row-meta">
                  <span className={`tag ${app.source === 'store' ? 'tag-store' : ''}`}>
                    {app.source === 'store' ? 'Store' : app.hive === 'user' ? '用户' : '本机'}
                  </span>
                  <span className="app-row-size">{app.estimatedSizeKb ? formatBytes(app.estimatedSizeKb * 1024) : '—'}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="apps-foot">
        <div className="apps-selected">
          {selected ? (
            <>
              <span className="apps-selected-name" title={selected.name}>
                {selected.name}
              </span>
              <span className="apps-selected-hint">选中 1 项</span>
            </>
          ) : (
            <span className="apps-selected-hint">选择应用后可执行卸载</span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          disabled={!selected}
          onClick={() => selected && setConfirmId(selected.id)}
        >
          <Trash2 size={13} /> 卸载
        </button>
      </div>

      <div className="apps-note">
        清单来自 HKLM/HKCU Uninstall 与当前用户 AppX 包（BCU 同源思路）。卸载前展示命令与权限边界；不做静默提权，不执行界面传入的任意命令。
      </div>

      <UninstallDialog appId={confirmId} onClose={() => setConfirmId(null)} />
    </div>
  )
}
