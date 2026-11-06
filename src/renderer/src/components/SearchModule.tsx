import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  CornerDownLeft,
  FolderSearch,
  FolderPlus,
  HardDrive,
  Info,
  RefreshCw,
  Search,
  X
} from 'lucide-react'
import type { SearchResponse } from '@shared/types'
import { useIsland } from '../store'
import { useDebounced } from '../lib/hooks'
import { formatBytes, timeAgo } from '../lib/format'
import { FileGlyph } from './glyphs'
import { EmptyState, Spinner } from './ui'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function Highlight({ text, tokens }: { text: string; tokens: string[] }): ReactNode {
  const parts = useMemo(() => {
    const cleaned = tokens.filter(Boolean).slice(0, 6)
    if (!cleaned.length) return [text]
    const regex = new RegExp(`(${cleaned.map(escapeRegExp).join('|')})`, 'gi')
    return text.split(regex)
  }, [text, tokens])
  if (parts.length === 1) return <>{text}</>
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? <mark key={`${part}-${index}`}>{part}</mark> : <span key={`${part}-${index}`}>{part}</span>
      )}
    </>
  )
}

function shortRoot(root: string): string {
  const parts = root.split('\\').filter(Boolean)
  if (parts.length <= 2) return root
  return `…\\${parts.slice(-2).join('\\')}`
}

export function SearchModule(): ReactNode {
  const searchStatus = useIsland((state) => state.searchStatus)
  const settings = useIsland((state) => state.settings)
  const setSettings = useIsland((state) => state.setSettings)
  const focusNonce = useIsland((state) => state.searchFocusNonce)
  const pushToast = useIsland((state) => state.pushToast)

  const [query, setQuery] = useState('')
  const [response, setResponse] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState(0)
  const [indexOpen, setIndexOpen] = useState(false)
  const [retry, setRetry] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounced = useDebounced(query, 140)

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 160)
    return () => clearTimeout(timer)
  }, [focusNonce])

  useEffect(() => {
    const text = debounced.trim()
    if (!text) {
      setResponse(null)
      setLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    window.island
      .search(text)
      .then((result) => {
        if (cancelled) return
        setResponse(result)
        setSelected(0)
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '搜索失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debounced, retry])

  const open = async (path: string): Promise<void> => {
    const message = await window.island.openPath(path)
    if (message) pushToast({ id: `open-${Date.now()}`, kind: 'error', text: message })
  }

  const rebuild = async (): Promise<void> => {
    pushToast({ id: `rebuild-${Date.now()}`, kind: 'info', text: '正在重建文件索引…' })
    const status = await window.island.rebuildIndex()
    pushToast({
      id: `rebuild-done-${Date.now()}`,
      kind: status.state === 'ready' ? 'info' : 'error',
      text: status.state === 'ready' ? `索引完成：${status.indexed} 项` : status.error ?? '索引失败'
    })
  }

  const addRoot = async (): Promise<void> => {
    const picked = await window.island.pickSearchRoot()
    if (!picked || settings.searchRoots.includes(picked)) return
    const next = await window.island.updateSettings({ searchRoots: [...settings.searchRoots, picked] })
    setSettings(next)
  }

  const removeRoot = async (root: string): Promise<void> => {
    const next = await window.island.updateSettings({ searchRoots: settings.searchRoots.filter((item) => item !== root) })
    setSettings(next)
  }

  const results = response?.results ?? []
  const tokens = debounced.trim().split(/\s+/).filter(Boolean)

  return (
    <div className="search-module">
      <div className={`search-box ${loading ? 'is-loading' : ''}`}>
        <Search size={17} className="search-icon" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && results.length) {
              event.preventDefault()
              setSelected((index) => Math.min(results.length - 1, index + 1))
            } else if (event.key === 'ArrowUp' && results.length) {
              event.preventDefault()
              setSelected((index) => Math.max(0, index - 1))
            } else if (event.key === 'Enter' && results[selected]) {
              event.preventDefault()
              void open(results[selected].path)
            }
          }}
          placeholder="按文件名或路径片段搜索本机文件…"
          aria-label="本地文件搜索"
          spellCheck={false}
        />
        {loading ? <Spinner /> : null}
        {query ? (
          <button type="button" className="search-clear" aria-label="清空搜索" onClick={() => setQuery('')}>
            <X size={14} />
          </button>
        ) : (
          <kbd className="search-kbd">Ctrl K</kbd>
        )}
      </div>

      <div className="index-bar">
        <span className={`index-state state-${searchStatus.state}`}>
          <span className="status-dot" />
          {searchStatus.state === 'indexing'
            ? `索引中 · ${searchStatus.indexed.toLocaleString()} 项`
            : searchStatus.state === 'ready'
              ? `${searchStatus.indexed.toLocaleString()} 项 · ${timeAgo(searchStatus.updatedAt)}`
              : searchStatus.state === 'error'
                ? '索引异常'
                : '索引未开始'}
        </span>
        <span className="index-roots">{searchStatus.roots.length} 个目录</span>
        <div className="index-actions">
          <button type="button" className="icon-btn" title="重建索引" aria-label="重建索引" onClick={() => void rebuild()}>
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            className={`icon-btn ${indexOpen ? 'is-active' : ''}`}
            title="索引目录设置"
            aria-label="索引目录设置"
            onClick={() => setIndexOpen((open) => !open)}
          >
            <FolderSearch size={14} />
          </button>
        </div>
      </div>

      {indexOpen ? (
        <div className="index-panel">
          <div className="index-panel-head">
            <div>
              <strong>索引目录</strong>
              <p>只读遍历 · 文件名实时检索 · 最多 80,000 条 · 递归 7 层</p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void addRoot()}>
              <FolderPlus size={13} /> 添加
            </button>
          </div>
          <div className="root-list">
            {settings.searchRoots.length === 0 ? <span className="muted">尚未设置目录</span> : null}
            {settings.searchRoots.map((root) => (
              <span className="root-chip" key={root} title={root}>
                <HardDrive size={12} />
                {shortRoot(root)}
                <button type="button" aria-label={`移除 ${root}`} onClick={() => void removeRoot(root)}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          <div className="index-note">
            <Info size={12} />
            采用 fsearch 思路：启动时构建内存文件名索引，查询不访问磁盘；目录变化由文件监控触发去抖重建，而不是定时轮询。
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="inline-error">
          <span>{error}</span>
          <button type="button" className="link-btn" onClick={() => setRetry((value) => value + 1)}>
            重试
          </button>
        </div>
      ) : null}

      <div className="search-body">
        {!query.trim() ? (
          <div className="search-idle">
            <div className="search-idle-orb">
              <Search size={25} />
            </div>
            <h3>快速搜索本地文件</h3>
            <p>输入文件名、扩展名或路径片段；中文与英文均按小写分词匹配，查询只读内存索引。</p>
            <div className="search-stats">
              <div>
                <strong>{searchStatus.indexed.toLocaleString()}</strong>
                <span>已索引条目</span>
              </div>
              <div>
                <strong>{searchStatus.scannedDirs.toLocaleString()}</strong>
                <span>已扫描目录</span>
              </div>
              <div>
                <strong>{searchStatus.roots.length}</strong>
                <span>索引根目录</span>
              </div>
              <div>
                <strong>{searchStatus.updatedAt ? timeAgo(searchStatus.updatedAt) : '—'}</strong>
                <span>最近更新</span>
              </div>
            </div>
            <div className="search-root-preview">
              {searchStatus.roots.slice(0, 4).map((root) => (
                <span className="root-chip" key={root} title={root}>
                  <HardDrive size={11} />
                  {shortRoot(root)}
                </span>
              ))}
              {searchStatus.roots.length === 0 ? <span className="muted">尚未设置索引目录</span> : null}
            </div>
            <div className="search-tips">
              <span>
                <CornerDownLeft size={11} /> 回车打开
              </span>
              <span>↑ ↓ 选择</span>
              <span>结果可定位到文件夹</span>
              <span>输入即搜 · 140ms 去抖</span>
            </div>
            <div className="search-idle-note">
              索引仅保存文件名与路径；目录变化由文件监控事件触发去抖重建，不做定时全盘扫描。
            </div>
          </div>
        ) : loading && !response ? (
          <div className="result-skeleton">
            {Array.from({ length: 5 }).map((_, index) => (
              <div className="result-sk-row" key={index}>
                <span className="skeleton sk-icon" />
                <span className="sk-lines">
                  <span className="skeleton sk-line" />
                  <span className="skeleton sk-line short" />
                </span>
              </div>
            ))}
          </div>
        ) : results.length === 0 ? (
          <EmptyState
            icon={<FolderSearch size={24} />}
            title={loading ? '正在搜索…' : '没有匹配的文件'}
            description={
              loading
                ? '查询内存索引中'
                : '试试更短的关键词、扩展名，或在索引设置中添加更多目录。'
            }
          />
        ) : (
          <div className="result-list" role="listbox" aria-label="搜索结果">
            {results.map((result, index) => (
              <div
                key={result.path}
                role="option"
                aria-selected={index === selected}
                tabIndex={0}
                className={`result-row ${index === selected ? 'is-selected' : ''}`}
                onClick={() => void open(result.path)}
                onMouseEnter={() => setSelected(index)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void open(result.path)
                }}
              >
                <span className={`result-icon kind-${result.kind}`}>
                  <FileGlyph kind={result.kind} ext={result.ext} size={19} />
                </span>
                <span className="result-main">
                  <span className="result-name">
                    <Highlight text={result.name} tokens={tokens} />
                  </span>
                  <span className="result-dir" title={result.dir}>
                    {result.dir}
                  </span>
                </span>
                <span className="result-meta">
                  <span className="result-type">{result.kind === 'folder' ? '文件夹' : result.ext ? result.ext.toUpperCase() : '文件'}</span>
                  <span className="result-size">{result.kind === 'folder' ? '—' : formatBytes(result.size)}</span>
                  <button
                    type="button"
                    className="icon-btn result-reveal"
                    title="在资源管理器中显示"
                    aria-label="在资源管理器中显示"
                    onClick={(event) => {
                      event.stopPropagation()
                      window.island.revealPath(result.path)
                    }}
                  >
                    <ChevronRight size={14} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="search-foot">
        <span>
          {response
            ? `${response.totalMatched.toLocaleString()} 个匹配 · ${response.tookMs} ms`
            : '内存索引 · 零磁盘查询'}
        </span>
        <span className="search-foot-hint">
          <CornerDownLeft size={12} /> 打开
          <ChevronDown size={12} /> 浏览
        </span>
      </div>
    </div>
  )
}
