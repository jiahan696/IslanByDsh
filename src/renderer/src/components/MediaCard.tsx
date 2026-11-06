import type { ReactNode } from 'react'
import { useState } from 'react'
import { Music2, Pause, Play, SkipBack, SkipForward, Volume2 } from 'lucide-react'
import { useIsland } from '../store'
import { formatDuration } from '../lib/format'
import { usePlaybackPosition } from '../lib/hooks'
import { activeLineIndex, lyricWindow } from '../lib/lyrics'
import { EmptyState } from './ui'

const PALETTES: Array<[string, string, string]> = [
  ['#6D8BFF', '#B894FF', '#FFB7D5'],
  ['#4FD1C5', '#6C8CFF', '#B794F4'],
  ['#FFB86B', '#FF7EB3', '#9C6BFF'],
  ['#7DD3FC', '#818CF8', '#F0ABFC'],
  ['#FCA5A5', '#F9A8D4', '#A5B4FC']
]

function paletteFor(title: string): [string, string, string] {
  let hash = 0
  for (let index = 0; index < title.length; index += 1) hash = (hash * 31 + title.charCodeAt(index)) | 0
  return PALETTES[Math.abs(hash) % PALETTES.length]
}

function Equalizer({ running }: { running: boolean }): ReactNode {
  return (
    <span className={`eq-mini ${running ? 'is-running' : ''}`} aria-hidden>
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}

export function MediaCard(): ReactNode {
  const media = useIsland((state) => state.media)
  const pushToast = useIsland((state) => state.pushToast)
  const position = usePlaybackPosition(media, 250)
  const [drag, setDrag] = useState<number | null>(null)

  const hasMedia = media.hasSession && Boolean(media.title)
  const shown = drag ?? position
  const duration = Math.max(0, media.durationMs)
  const lyricIndex = activeLineIndex(media.lyrics.lines, shown)
  const lines = media.lyrics.lines.length
    ? lyricWindow(media.lyrics.lines, shown, 1, 1)
    : []

  const command = async (name: 'playpause' | 'next' | 'previous' | 'seek', value?: number): Promise<void> => {
    const result = await window.island.mediaCommand(name, value)
    if (!result.ok) pushToast({ id: `media-${Date.now()}`, kind: 'error', text: result.message })
  }

  if (!hasMedia) {
    return (
      <section className="card media-card" aria-label="媒体控制">
        <div className="card-head">
          <span className="card-title">
            <Volume2 size={14} /> 媒体
          </span>
          <span className="card-hint">SMTC</span>
        </div>
        <EmptyState
          icon={<Music2 size={22} />}
          title="未检测到正在播放的媒体"
          description="打开支持 Windows 系统媒体控制的应用（如浏览器、音乐播放器）后会自动出现。"
        />
      </section>
    )
  }

  const [c1, c2, c3] = paletteFor(media.title ?? '')
  return (
    <section className="card media-card" aria-label="媒体控制">
      <div className="card-head">
        <span className="card-title">
          <Equalizer running={media.playing} /> 正在播放
        </span>
        <span className="card-hint">{media.appName ?? '系统媒体'}</span>
      </div>

      <div className="media-main">
        <div
          className="media-cover"
          style={{ background: `radial-gradient(circle at 28% 18%, ${c3}cc, transparent 55%), linear-gradient(145deg, ${c1}, ${c2})` }}
          aria-hidden
        >
          <span>{media.title?.slice(0, 1) ?? '♪'}</span>
          <div className="media-cover-gloss" />
        </div>
        <div className="media-info">
          <div className="media-title" title={media.title ?? ''}>
            {media.title}
          </div>
          <div className="media-artist" title={media.artist ?? ''}>
            {media.artist || '未知艺术家'}
            {media.album ? <span className="media-album"> · {media.album}</span> : null}
          </div>
          <div className="media-badge">
            <span className={`status-dot ${media.playing ? 'playing' : ''}`} />
            {media.playing ? '播放中' : '已暂停'}
            {duration > 0 ? <span className="media-time">{formatDuration(shown)} / {formatDuration(duration)}</span> : null}
          </div>
        </div>
      </div>

      {duration > 0 ? (
        <input
          className="seek"
          type="range"
          min={0}
          max={duration}
          step={1000}
          value={Math.min(shown, duration)}
          aria-label="播放进度"
          onChange={(event) => setDrag(Number(event.target.value))}
          onPointerUp={(event) => {
            const value = Number((event.currentTarget as HTMLInputElement).value)
            setDrag(null)
            void command('seek', value)
          }}
          onKeyUp={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            const value = Number((event.currentTarget as HTMLInputElement).value)
            setDrag(null)
            void command('seek', value)
          }}
        />
      ) : null}

      <div className="media-controls">
        <button
          type="button"
          className="round-btn"
          onClick={() => void command('previous')}
          disabled={!media.canPrev}
          aria-label="上一首"
        >
          <SkipBack size={17} />
        </button>
        <button
          type="button"
          className="round-btn is-primary"
          onClick={() => void command('playpause')}
          aria-label={media.playing ? '暂停' : '播放'}
          disabled={!media.canPause && !media.hasSession}
        >
          {media.playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button
          type="button"
          className="round-btn"
          onClick={() => void command('next')}
          disabled={!media.canNext}
          aria-label="下一首"
        >
          <SkipForward size={17} />
        </button>
      </div>

      <div className="lyric-box" aria-label="滚动歌词">
        {media.lyrics.status === 'found' && lines.length > 0 ? (
          lines.map((line) => (
            <div
              key={`${line.time}-${line.text}`}
              className={`lyric-line ${media.lyrics.lines[lyricIndex] === line ? 'is-active' : ''}`}
            >
              {line.text}
            </div>
          ))
        ) : (
          <div className="lyric-placeholder">
            {media.lyrics.status === 'loading'
              ? '正在匹配歌词…'
              : media.lyrics.status === 'error'
                ? '歌词服务暂不可用'
                : '暂无同步歌词 · 显示曲目信息'}
          </div>
        )}
        <span className="lyric-source">{media.lyrics.status === 'found' ? 'LRCLIB · 同步歌词' : '歌词占位'}</span>
      </div>
    </section>
  )
}
