import type { ReactNode } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  AlarmClock,
  ArrowDown,
  ArrowUp,
  Battery,
  BatteryCharging,
  BatteryFull,
  BatteryLow,
  Bluetooth,
  ChevronDown,
  ChevronUp,
  Cpu,
  Hourglass,
  MemoryStick,
  Sparkles,
  Timer,
  Zap
} from 'lucide-react'
import { useIsland } from '../store'
import { useNow, usePlaybackPosition } from '../lib/hooks'
import { currentLyric } from '../lib/lyrics'
import { formatClock, formatSpeed, formatTimerShort } from '../lib/format'
import { ScrollingText } from './ScrollingText'
import { GlassScene } from './GlassScene'
import { WeatherGlyph } from './glyphs'
import { Chip } from './ui'

function metricTone(value: number): 'default' | 'warn' | 'bad' {
  if (value >= 90) return 'bad'
  if (value >= 75) return 'warn'
  return 'default'
}

function BatteryChip(): ReactNode {
  const battery = useIsland((state) => state.metrics.battery)
  if (!battery.hasBattery) {
    return (
      <Chip icon={<Zap size={13} />} tone="good" title="已连接电源，设备未报告电池">
        AC
      </Chip>
    )
  }
  const percent = battery.percent ?? 0
  const tone = battery.low ? 'bad' : battery.isCharging || battery.isFull ? 'good' : 'default'
  const Icon = battery.isCharging ? BatteryCharging : battery.isFull ? BatteryFull : battery.low ? BatteryLow : Battery
  return (
    <Chip
      icon={<Icon size={14} />}
      tone={tone}
      title={battery.isCharging ? '正在充电' : battery.isFull ? '已充满' : battery.acConnected ? '已接电源' : '电池供电'}
      className={battery.low ? 'pulse-soft' : ''}
    >
      {Math.round(percent)}%
    </Chip>
  )
}

function BluetoothChip(): ReactNode {
  const devices = useIsland((state) => state.metrics.bluetooth)
  if (!devices.length) return null
  const device = devices.find((item) => item.kind === 'audio') ?? devices[0]
  const known = device.battery !== null
  return (
    <Chip
      icon={<Bluetooth size={13} />}
      tone={known && device.battery !== null && device.battery <= 20 ? 'warn' : 'default'}
      title={`${device.name}${known ? ` · 电量 ${device.battery}%` : ' · 驱动未上报电量'}`}
      className="chip-bt"
    >
      {known ? `${device.battery}%` : '—'}
    </Chip>
  )
}

function MediaPeek({ paused }: { paused: boolean }): ReactNode {
  const media = useIsland((state) => state.media)
  const position = usePlaybackPosition(media, 450)
  if (!media.hasSession || !media.title) return null
  const lyric = currentLyric(media.lyrics.lines, position)
  const subtitle =
    media.lyrics.status === 'found'
      ? lyric || '· · ·'
      : media.lyrics.status === 'loading'
        ? '正在匹配歌词…'
        : media.artist || '暂无歌词'
  return (
    <div className="media-peek">
      <div className={`eq ${media.playing && !paused ? 'is-running' : ''}`} aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="media-peek-text">
        <ScrollingText text={media.title} className="media-peek-title" paused={paused} />
        <ScrollingText
          text={`${media.playing ? '' : '已暂停 · '}${subtitle}`}
          className={`media-peek-sub ${media.lyrics.status === 'found' ? 'is-lyric' : ''}`}
          paused={paused}
        />
      </div>
    </div>
  )
}

function CenterStatus(): ReactNode {
  const weather = useIsland((state) => state.weather)
  return (
    <div className="weather-peek">
      <WeatherGlyph icon={weather.icon} size={16} />
      <span className="weather-peek-temp">{weather.tempC === null ? '--' : Math.round(weather.tempC)}°</span>
      <span className="weather-peek-city">{weather.city}</span>
      <span className="weather-peek-cond">{weather.condition}</span>
    </div>
  )
}

function ActiveTools(): ReactNode {
  const media = useIsland((state) => state.media)
  const timers = useIsland((state) => state.timers)
  const countdownActive =
    !timers.firingCountdown &&
    (timers.countdown.running || timers.countdown.remainingMs !== timers.countdown.totalMs)
  const stopwatchActive = timers.stopwatch.running || timers.stopwatch.elapsedMs > 0
  return (
    <div className="cap-tools">
      {timers.firingAlarm ? (
        <div className="cap-tool tool-alarm">
          <AlarmClock size={15} />
          <div className="cap-tool-text">
            <b>闹钟 · {timers.firingAlarm.time}</b>
            <small>{timers.firingAlarm.label || '时间到了'}</small>
          </div>
          <div className="cap-tool-actions">
            <button
              type="button"
              className="alarm-action"
              onClick={(event) => {
                event.stopPropagation()
                window.island.alarms('dismiss', { mode: 'close' })
              }}
            >
              关闭闹钟
            </button>
            <button
              type="button"
              className="alarm-action is-primary"
              onClick={(event) => {
                event.stopPropagation()
                window.island.alarms('dismiss', { mode: 'snooze' })
              }}
            >
              5分钟后再次提醒
            </button>
          </div>
        </div>
      ) : null}

      {timers.firingTodo ? (
        <div className="cap-tool tool-todo">
          <div className="cap-tool-text">
            <b>待办 · {timers.firingTodo.text}</b>
            <small>{timers.firingTodo.reminderKind === 'alarm' ? '闹钟提醒' : '消息提醒'}</small>
          </div>
          <div className="cap-tool-actions">
            <button
              type="button"
              className="alarm-action"
              onClick={(event) => {
                event.stopPropagation()
                void window.island.todos('dismissReminder', { mode: 'close' })
              }}
            >
              关闭
            </button>
            <button
              type="button"
              className="alarm-action is-primary"
              onClick={(event) => {
                event.stopPropagation()
                void window.island.todos('dismissReminder', { mode: 'snooze' })
              }}
            >
              5分钟后
            </button>
          </div>
        </div>
      ) : null}

      {timers.firingCountdown ? (
        <div className="cap-tool tool-countdown">
          <Hourglass size={15} />
          <div className="cap-tool-text">
            <b>倒计时 · {timers.firingCountdown.label}</b>
            <small>{timers.firingCountdown.reminderKind === 'alarm' ? '闹钟提醒' : '消息提醒'}</small>
          </div>
          <div className="cap-tool-actions">
            <button
              type="button"
              className="alarm-action"
              onClick={(event) => {
                event.stopPropagation()
                window.island.countdown('reset')
              }}
            >
              关闭
            </button>
          </div>
        </div>
      ) : null}

      {countdownActive ? (
        <div className="cap-tool tool-countdown">
          <Hourglass size={15} />
          <span className="cap-tool-time">{formatTimerShort(timers.countdown.remainingMs)}</span>
          <span className="cap-tool-label">{timers.countdown.label}</span>
        </div>
      ) : null}

      {stopwatchActive ? (
        <div className="cap-tool tool-stopwatch">
          <Timer size={15} />
          <span className="cap-tool-time">{formatTimerShort(timers.stopwatch.elapsedMs)}</span>
          <span className="cap-tool-label">秒表</span>
        </div>
      ) : null}

      {media.hasSession && media.title ? (
        <div className="cap-tool tool-media">
          <MediaPeek paused={false} />
        </div>
      ) : null}
    </div>
  )
}
export function Capsule(): ReactNode {
  const mode = useIsland((state) => state.mode)
  const settings = useIsland((state) => state.settings)
  const solidMode = settings.renderMode === 'solid'
  const metrics = useIsland((state) => state.metrics)
  const media = useIsland((state) => state.media)
  const notifications = useIsland((state) => state.notifications)
  const timers = useIsland((state) => state.timers)
  const weather = useIsland((state) => state.weather)
  // When expanded the capsule only shows minutes, so stop the 1 s clock tick.
  const now = useNow(mode === 'expanded' && !settings.showSeconds ? 30_000 : 1000)
  const wrapRef = useRef<HTMLDivElement>(null)
  const capsuleRef = useRef<HTMLDivElement>(null)
  const [origin, setOrigin] = useState({ x: 0, y: 0 })
  const [capsuleWidth, setCapsuleWidth] = useState(940)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null)
  const dragPosRef = useRef<{ x: number; y: number } | null>(null)
  const draggedRef = useRef(false)
  const lastWidthRef = useRef(0)
  const expanded = mode === 'expanded'
  const layout = settings.layout
  const isVertical = layout.orientation === 'vertical'
  const scale = Math.min(2, Math.max(0.5, layout.scale / 50))

  const measureCapsule = (): void => {
    const element = capsuleRef.current
    if (!element) return
    if (isVertical) {
      if (lastWidthRef.current !== 260) {
        lastWidthRef.current = 260
        setCapsuleWidth(260)
      }
      return
    }
    const left = element.querySelector<HTMLElement>('.cap-left')
    const center = element.querySelector<HTMLElement>('.cap-center')
    const right = element.querySelector<HTMLElement>('.cap-right')
    if (!left || !center || !right) return
    const centerContent = (center.firstElementChild as HTMLElement | null) ?? center
    const style = getComputedStyle(element)
    const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
    const border = (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0)
    const gap = parseFloat(style.columnGap || '12') || 12
    const measured =
      left.offsetWidth + right.offsetWidth + centerContent.scrollWidth + gap * 2 + padding + border + 4
    // Each active tool gets its own fixed-width slot in `.cap-tools`; the total
    // width is the base capsule plus exactly those slot widths. No tool can
    // replace or overlap another tool.
    const toolWidths = [
      timers.firingAlarm ? 300 : 0,
      timers.firingTodo ? 270 : 0,
      timers.firingCountdown ? 250 : 0,
      !timers.firingCountdown &&
      (timers.countdown.running || timers.countdown.remainingMs !== timers.countdown.totalMs)
        ? 150
        : 0,
      timers.stopwatch.running || timers.stopwatch.elapsedMs > 0 ? 140 : 0,
      media.hasSession && media.title ? 230 : 0
    ].filter((width) => width > 0)
    const base = Math.max(560, Math.ceil(measured))
    const toolWidth = toolWidths.reduce((sum, width) => sum + width, 0)
    const next =
      toolWidths.length === 0
        ? base
        : Math.min(1500, Math.max(560, Math.ceil(base + toolWidth + gap + 8 * (toolWidths.length - 1))))
    if (Math.abs(next - lastWidthRef.current) < 2) return
    lastWidthRef.current = next
    setCapsuleWidth(next)
  }

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(measureCapsule)
    return () => cancelAnimationFrame(frame)
  }, [
    isVertical,
    expanded,
    settings.showSeconds,
    settings.renderMode,
    settings.theme,
    media.hasSession,
    media.title,
    media.artist,
    media.playing,
    timers.firingAlarm?.id,
    timers.firingTodo?.id,
    timers.firingCountdown?.finishedAt,
    timers.countdown.running,
    timers.countdown.finishedAt,
    timers.countdown.label,
    timers.stopwatch.running,
    timers.stopwatch.elapsedMs > 0,
    weather.tempC,
    weather.city,
    weather.condition,
    notifications.unread
  ])

  useEffect(() => {
    dragPosRef.current = null
    setDragPos(null)
  }, [layout.anchor, layout.orientation, layout.scale])

  useEffect(() => {
    if (!dragPos) return
    const element = wrapRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    window.island.setCapsuleBounds({ x: rect.x - 12, y: rect.y - 12, w: rect.width + 24, h: rect.height + 24 })
  }, [dragPos])

  useEffect(() => {
    const element = wrapRef.current
    if (!element) return
    let raf = 0
    const report = (): void => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect()
        setOrigin((previous) =>
          Math.abs(previous.x - rect.x) < 0.5 && Math.abs(previous.y - rect.y) < 0.5
            ? previous
            : { x: rect.x, y: rect.y }
        )
        // Include the floating unread badge and the soft glow in the hit area so
        // they stay clickable while the window is click-through.
        const pad = 12
        window.island.setCapsuleBounds({
          x: rect.x - pad,
          y: rect.y - pad,
          w: rect.width + pad * 2,
          h: rect.height + pad * 2
        })
      })
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(element)
    window.addEventListener('resize', report)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', report)
      cancelAnimationFrame(raf)
    }
  }, [])

  const clearBadge = async (event: React.MouseEvent): Promise<void> => {
    event.stopPropagation()
    const state = await window.island.notifications('clear')
    useIsland.getState().setNotifications(state)
  }

  const toggle = (): void => {
    if (expanded) void window.island.collapse()
    else void window.island.expand()
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!layout.freeDrag || expanded || event.button !== 0) return
    if ((event.target as HTMLElement).closest('.cap-badge')) return
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    // Layout coordinates are pre-zoom CSS pixels; convert the rendered rect so
    // dragging at 75% / 100% does not jump when zoom is applied.
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      x: rect.left / scale,
      y: rect.top / scale
    }
    draggedRef.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag) return
    const dx = (event.clientX - drag.startX) / scale
    const dy = (event.clientY - drag.startY) / scale
    if (!draggedRef.current && Math.hypot(dx * scale, dy * scale) < 4) return
    draggedRef.current = true
    const next = { x: drag.x + dx, y: drag.y + dy }
    dragPosRef.current = next
    setDragPos(next)
  }

  const handlePointerUp = (): void => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    const final = dragPosRef.current
    dragPosRef.current = null
    if (draggedRef.current && final) {
      const next = window.island
        .updateSettings({
          layout: { ...layout, anchor: 'custom', x: Math.max(0, Math.round(final.x)), y: Math.max(0, Math.round(final.y)) }
        })
        .then((value) => {
          useIsland.getState().setSettings(value)
          return value
        })
      void next.catch(() => undefined)
      window.setTimeout(() => {
        draggedRef.current = false
      }, 220)
    }
  }

  const handlePointerCancel = (): void => {
    dragRef.current = null
    dragPosRef.current = null
    setDragPos(null)
  }

  useLayoutEffect(() => {
    const report = (): void => {
      const element = wrapRef.current
      if (!element) return
      const rect = element.getBoundingClientRect()
      window.island.setCapsuleBounds({ x: rect.x - 12, y: rect.y - 12, w: rect.width + 24, h: rect.height + 24 })
    }
    report()
    // Layout effects can race the post-drag state commit; one deferred report
    // keeps the native mask on the final capsule rectangle.
    const timer = window.setTimeout(report, 80)
    return () => window.clearTimeout(timer)
  }, [layout.anchor, layout.x, layout.y, layout.scale, layout.orientation])

  const positionStyle: React.CSSProperties & Record<string, string> = {
    ['--capsule-width']: `${capsuleWidth}px`,
    ['--capsule-scale']: String(scale),
    zoom: String(scale),
    transformOrigin: layout.anchor.includes('bottom') ? 'bottom center' : 'top center'
  }
  const anchoredPosition = dragPos !== null || ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'custom'].includes(layout.anchor)
  if (dragPos) {
    positionStyle.transform = 'none'
    positionStyle.left = `${dragPos.x}px`
    positionStyle.top = `${dragPos.y}px`
    positionStyle.right = 'auto'
    positionStyle.bottom = 'auto'
  } else if (layout.anchor === 'custom') {
    positionStyle.transform = 'none'
    positionStyle.left = `${layout.x ?? 24}px`
    positionStyle.top = `${layout.y ?? 10}px`
    positionStyle.right = 'auto'
    positionStyle.bottom = 'auto'
  } else if (layout.anchor === 'bottom-center') {
    positionStyle.left = '50%'
    positionStyle.right = 'auto'
    positionStyle.bottom = '24px'
    positionStyle.top = 'auto'
    positionStyle.transform = 'translateX(-50%)'
  } else if (layout.anchor === 'top-center') {
    positionStyle.left = '50%'
    positionStyle.right = 'auto'
    positionStyle.top = '10px'
    positionStyle.bottom = 'auto'
    positionStyle.transform = 'translateX(-50%)'
  } else {
    const bottom = layout.anchor.startsWith('bottom')
    const right = layout.anchor.endsWith('right')
    positionStyle.transform = 'none'
    positionStyle.left = right ? 'auto' : '24px'
    positionStyle.right = right ? '24px' : 'auto'
    positionStyle.top = bottom ? 'auto' : '10px'
    positionStyle.bottom = bottom ? '24px' : 'auto'
  }

  return (
    <div
      className={`capsule-wrap ${isVertical ? 'is-vertical' : ''} ${anchoredPosition ? 'is-anchored' : ''}`}
      ref={wrapRef}
      style={positionStyle}
    >
      <div
        ref={capsuleRef}
        className={`capsule ${solidMode ? 'solid' : 'glass'} ${expanded ? 'is-expanded' : ''} ${timers.firingAlarm ? 'has-alarm' : ''}`}
        data-glass="capsule"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={expanded ? '收起灵动岛面板' : '展开灵动岛面板'}
        onClick={() => {
          if (draggedRef.current) {
            draggedRef.current = false
            return
          }
          toggle()
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            toggle()
          }
        }}
      >
        {solidMode ? null : (
          <span className="glass-clip" aria-hidden>
            <GlassScene x={origin.x} y={origin.y} />
            <span className="glass-tint" />
          </span>
        )}
        {solidMode ? null : <span className="capsule-sheen" aria-hidden />}
        <div className="cap-left">
          <div className="cap-clock" aria-label="当前时间">
            <span className="cap-clock-main">{formatClock(now, settings.showSeconds)}</span>
          </div>
          <BatteryChip />
          <BluetoothChip />
        </div>

        <div className="cap-center">
          {expanded ? (
            <div className="cap-expanded-hint">
              <span className="live-dot" />
              面板已展开 · 点击胶囊收起
            </div>
          ) : (
            <CenterStatus />
          )}
        </div>

        <ActiveTools />

        <div className="cap-right">
          <Chip icon={<Cpu size={13} />} tone={metricTone(metrics.cpu)} title={`CPU ${metrics.cpu.toFixed(0)}%`} className="chip-metric">
            {Math.round(metrics.cpu)}%
          </Chip>
          <Chip
            icon={<MemoryStick size={13} />}
            tone={metricTone(metrics.mem.percent)}
            title={`内存 ${Math.round(metrics.mem.percent)}%`}
            className="chip-metric"
          >
            {Math.round(metrics.mem.percent)}%
          </Chip>
          <Chip
            icon={
              <span className="net-pair">
                <ArrowDown size={11} />
                <ArrowUp size={11} />
              </span>
            }
            title={`实时网络 ↓${formatSpeed(metrics.net.down)}/s ↑${formatSpeed(metrics.net.up)}/s`}
            className="chip-net"
          >
            <span className="net-values">
              <span>{formatSpeed(metrics.net.down)}</span>
              <span className="net-up">{formatSpeed(metrics.net.up)}</span>
            </span>
          </Chip>
          <Chip icon={<Sparkles size={13} />} title={`今日 API 调用 ${metrics.apiUsage.today} 次`} className="chip-api">
            {metrics.apiUsage.today}
          </Chip>
          <span className="cap-chevron" aria-hidden>
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </span>
        </div>

        {notifications.unread > 0 ? (
          <button
            type="button"
            className="cap-badge"
            onClick={(event) => void clearBadge(event)}
            title={`${notifications.unread} 条未读提醒，点击标记已读`}
            aria-label={`${notifications.unread} 条未读提醒，点击标记已读`}
          >
            <span
              className={`cap-badge-dot ${notifications.items[0]?.app ?? 'system'}`}
              aria-hidden
            />
            {notifications.unread > 99 ? '99+' : notifications.unread}
          </button>
        ) : null}
      </div>
    </div>
  )
}
