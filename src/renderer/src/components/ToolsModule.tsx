import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import {
  AlarmClock,
  Bell,
  BellOff,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Droplets,
  Hourglass,
  MapPin,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Timer,
  Trash2,
  Wind
} from 'lucide-react'
import type { Alarm, TodoItem } from '@shared/types'
import { useIsland } from '../store'
import {
  cityLabel,
  formatDuration,
  formatMonthCN,
  formatTimerShort,
  localDateKey,
  parseLocalDate,
  weekdayCN
} from '../lib/format'
import { Switch } from './ui'
import { WeatherGlyph } from './glyphs'

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function toLocalInput(value: number): string {
  const date = new Date(value)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function CalendarCard({
  month,
  selected,
  onMonth,
  onSelect
}: {
  month: Date
  selected: string
  onMonth: (date: Date) => void
  onSelect: (key: string, date: Date) => void
}): ReactNode {
  const todos = useIsland((state) => state.todos)
  const todayKey = localDateKey(new Date())
  const todoDates = useMemo(() => {
    const set = new Set<string>()
    for (const todo of todos) if (!todo.done) set.add(todo.date)
    return set
  }, [todos])

  const cells = useMemo(() => {
    const first = startOfMonth(month)
    const offset = (first.getDay() + 6) % 7
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset)
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
      return {
        date,
        key: localDateKey(date),
        day: date.getDate(),
        inMonth: date.getMonth() === month.getMonth(),
        today: localDateKey(date) === todayKey
      }
    })
  }, [month, todayKey])

  const selectedDate = parseLocalDate(selected)

  return (
    <section className="card tool-card calendar-card" id="tool-calendar" aria-label="日历">
      <div className="tool-head">
        <div>
          <span className="tool-title">
            <CalendarDays size={14} /> 日历
          </span>
          <span className="tool-sub">
            {selectedDate.getMonth() + 1}月{selectedDate.getDate()}日 · {weekdayCN(selectedDate.getDay())}
          </span>
        </div>
        <div className="tool-actions">
          <button type="button" className="icon-btn" aria-label="上个月" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            <ChevronLeft size={14} />
          </button>
          <button type="button" className="icon-btn" aria-label="下个月" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="calendar-month">
        <span>{formatMonthCN(month)}</span>
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            const now = new Date()
            onMonth(startOfMonth(now))
            onSelect(localDateKey(now), now)
          }}
        >
          今天
        </button>
      </div>

      <div className="calendar-weekdays">
        {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="calendar-grid">
        {cells.map((cell) => (
          <button
            type="button"
            key={cell.key}
            className={`calendar-cell ${cell.inMonth ? '' : 'is-outside'} ${cell.today ? 'is-today' : ''} ${
              cell.key === selected ? 'is-selected' : ''
            }`}
            onClick={() => onSelect(cell.key, cell.date)}
            aria-label={`${cell.date.getMonth() + 1}月${cell.day}日`}
          >
            <span>{cell.day}</span>
            {todoDates.has(cell.key) ? <i className="calendar-dot" aria-hidden /> : null}
          </button>
        ))}
      </div>
    </section>
  )
}

function WeatherCard(): ReactNode {
  const weather = useIsland((state) => state.weather)
  const setWeather = useIsland((state) => state.setWeather)
  const pushToast = useIsland((state) => state.pushToast)
  const [editing, setEditing] = useState(false)
  const [city, setCity] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = async (): Promise<void> => {
    setBusy(true)
    try {
      const next = await window.island.refreshWeather()
      setWeather(next)
      if (next.status === 'error') pushToast({ id: `weather-${Date.now()}`, kind: 'error', text: next.error ?? '天气刷新失败' })
    } finally {
      setBusy(false)
    }
  }

  const applyCity = async (value: string): Promise<void> => {
    setBusy(true)
    try {
      const next = await window.island.setWeatherCity(value)
      setWeather(next)
      if (next.status === 'ready') {
        setEditing(false)
        setCity('')
        pushToast({ id: `city-${Date.now()}`, kind: 'info', text: `天气城市已设为 ${next.city}` })
      } else {
        pushToast({ id: `city-err-${Date.now()}`, kind: 'error', text: next.error ?? '城市定位失败' })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card tool-card weather-card" id="tool-weather" aria-label="天气">
      <div className="tool-head">
        <div>
          <span className="tool-title">
            <Cloud size={14} /> 天气
          </span>
          <span className="tool-sub">
            <MapPin size={11} /> {cityLabel(weather.city, weather.region)}
            {weather.region && weather.region !== weather.city ? ` · ${weather.region}` : ''}
          </span>
        </div>
        <div className="tool-actions">
          <button type="button" className="icon-btn" aria-label="刷新天气" onClick={() => void refresh()} disabled={busy}>
            <RefreshCw size={14} className={busy || weather.status === 'loading' ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {weather.status === 'error' && weather.tempC === null ? (
        <div className="weather-error">
          <span>{weather.error ?? '天气获取失败'}</span>
          <button type="button" className="link-btn" onClick={() => void refresh()}>
            重试
          </button>
        </div>
      ) : (
        <div className="weather-main">
          <div className="weather-icon">
            <WeatherGlyph icon={weather.icon} size={30} />
          </div>
          <div className="weather-temp">
            {weather.tempC === null ? '--' : Math.round(weather.tempC)}
            <span>°</span>
          </div>
          <div className="weather-desc">
            <strong>{weather.condition}</strong>
            <span>
              体感 {weather.feelsLikeC === null ? '--' : Math.round(weather.feelsLikeC)}° · {weather.highC === null ? '--' : Math.round(weather.highC)}° /{' '}
              {weather.lowC === null ? '--' : Math.round(weather.lowC)}°
            </span>
          </div>
        </div>
      )}

      <div className="weather-details">
        <span>
          <Droplets size={12} /> 湿度 {weather.humidity === null ? '--' : `${weather.humidity}%`}
        </span>
        <span>
          <Wind size={12} /> 风速 {weather.windKph === null ? '--' : `${Math.round(weather.windKph)} km/h`}
        </span>
        <span className="weather-source">{weather.source ?? 'Open-Meteo'} · IP 定位</span>
      </div>

      {editing ? (
        <div className="weather-city-edit">
          <input
            className="input"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="输入城市名，如 上海"
            onKeyDown={(event) => {
              if (event.key === 'Enter') void applyCity(city)
            }}
            autoFocus
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void applyCity(city)} disabled={busy}>
            应用
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void applyCity('')} disabled={busy}>
            自动
          </button>
        </div>
      ) : (
        <button type="button" className="weather-city-link" onClick={() => setEditing(true)}>
          城市：{cityLabel(weather.city, weather.region)} · 点击修改
        </button>
      )}
    </section>
  )
}

function TimersCard(): ReactNode {
  const timers = useIsland((state) => state.timers)
  const pushToast = useIsland((state) => state.pushToast)
  const [hours, setHours] = useState(0)
  const [minutes, setMinutes] = useState(25)
  const [seconds, setSeconds] = useState(0)
  const countdown = timers.countdown
  const stopwatch = timers.stopwatch
  const ratio = countdown.totalMs > 0 ? countdown.remainingMs / countdown.totalMs : 0
  const totalSeconds = Math.max(0, Math.min(23, hours) * 3600 + Math.min(59, minutes) * 60 + Math.min(59, seconds))
  const configure = (patch: { kind?: 'message' | 'alarm'; reminderEnabled?: boolean }): void => {
    window.island.countdown('configure', patch)
  }
  const setPreset = (value: number): void => {
    setHours(Math.floor(value / 60))
    setMinutes(value % 60)
    setSeconds(0)
  }

  return (
    <section className="card tool-card timers-card" id="tool-timers" aria-label="计时工具">
      <div className="tool-head">
        <div>
          <span className="tool-title">
            <Timer size={14} /> 计时
          </span>
          <span className="tool-sub">秒表与倒计时在主进程计时，切到后台也准确</span>
        </div>
      </div>

      <div className="timer-block">
        <div className="timer-row">
          <span className="timer-name">
            <Timer size={13} /> 秒表
          </span>
          <span className={`timer-status ${stopwatch.running ? 'is-running' : ''}`}>
            {stopwatch.running ? '运行中' : stopwatch.elapsedMs > 0 ? '已暂停' : '待开始'}
          </span>
        </div>
        <div className="timer-display">{formatDuration(stopwatch.elapsedMs, true)}</div>
        <div className="timer-buttons">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => window.island.stopwatch(stopwatch.running ? 'pause' : 'start')}
          >
            {stopwatch.running ? <Pause size={13} /> : <Play size={13} />}
            {stopwatch.running ? '暂停' : stopwatch.elapsedMs > 0 ? '继续' : '开始'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.island.stopwatch('reset')}>
            <RotateCcw size={13} /> 重置
          </button>
        </div>
      </div>

      <div className="timer-block">
        <div className="timer-row">
          <span className="timer-name">
            <Hourglass size={13} /> 倒计时 · {countdown.label}
          </span>
          <span className={`timer-status ${countdown.running ? 'is-running' : ''}`}>
            {countdown.running ? '运行中' : countdown.remainingMs === 0 ? '已结束' : '已暂停'}
          </span>
        </div>
        <div className="countdown-row">
          <div className="timer-ring-wrap">
            <svg viewBox="0 0 100 100" className="timer-ring" aria-hidden>
              <circle cx="50" cy="50" r="44" className="ring-bg" />
              <circle
                cx="50"
                cy="50"
                r="44"
                className="ring-fill"
                pathLength={100}
                strokeDasharray={`${Math.max(0, Math.min(100, ratio * 100))} 100`}
                transform="rotate(-90 50 50)"
              />
            </svg>
            <span className="timer-ring-text">{formatTimerShort(countdown.remainingMs)}</span>
          </div>
          <div className="countdown-controls">
            <div className="preset-row">
              {[5, 10, 25, 45].map((preset) => (
                <button type="button" key={preset} className="preset" onClick={() => setPreset(preset)}>
                  {preset}′
                </button>
              ))}
            </div>
            <div className="countdown-input countdown-time-inputs">
              <label>
                <input
                  className="input input-mini"
                  type="number"
                  min={0}
                  max={23}
                  value={hours}
                  onChange={(event) => setHours(Math.max(0, Math.min(23, Number(event.target.value) || 0)))}
                  aria-label="倒计时小时"
                />
                <span>时</span>
              </label>
              <label>
                <input
                  className="input input-mini"
                  type="number"
                  min={0}
                  max={59}
                  value={minutes}
                  onChange={(event) => setMinutes(Math.max(0, Math.min(59, Number(event.target.value) || 0)))}
                  aria-label="倒计时分钟"
                />
                <span>分</span>
              </label>
              <label>
                <input
                  className="input input-mini"
                  type="number"
                  min={0}
                  max={59}
                  value={seconds}
                  onChange={(event) => setSeconds(Math.max(0, Math.min(59, Number(event.target.value) || 0)))}
                  aria-label="倒计时秒"
                />
                <span>秒</span>
              </label>
            </div>
            <div className="countdown-reminder-row">
              <span>结束提醒</span>
              <Switch
                checked={countdown.reminderEnabled}
                onChange={(value) => configure({ reminderEnabled: value })}
                label="倒计时结束提醒"
              />
              <select
                className="input input-select input-mini"
                value={countdown.reminderKind}
                onChange={(event) => configure({ kind: event.target.value as 'message' | 'alarm' })}
                aria-label="倒计时提醒类型"
                disabled={!countdown.reminderEnabled}
              >
                <option value="message">消息提醒</option>
                <option value="alarm">闹钟提醒</option>
              </select>
            </div>
            <div className="timer-buttons">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  if (totalSeconds < 1) {
                    pushToast({ id: `countdown-${Date.now()}`, kind: 'error', text: '请至少设置 1 秒' })
                    return
                  }
                  const restart =
                    !countdown.running &&
                    (countdown.remainingMs <= 0 || countdown.remainingMs >= countdown.totalMs)
                  window.island.countdown(countdown.running ? 'pause' : 'start', {
                    seconds: restart ? totalSeconds : undefined,
                    kind: countdown.reminderKind,
                    reminderEnabled: countdown.reminderEnabled,
                    label: '专注'
                  })
                }}
              >
                {countdown.running ? <Pause size={13} /> : <Play size={13} />}
                {countdown.running ? '暂停' : countdown.remainingMs === 0 ? '重新开始' : '开始'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.island.countdown('reset')}>
                <RotateCcw size={13} /> 重置
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function repeatLabel(days: number[]): string {
  if (days.length === 0) return '仅一次'
  if (days.length === 7) return '每天'
  if (days.length === 5 && days.every((day) => day >= 1 && day <= 5)) return '工作日'
  if (days.length === 2 && days.includes(0) && days.includes(6)) return '周末'
  return days.map((day) => weekdayCN(day).replace('周', '')).join('、')
}

function AlarmsCard(): ReactNode {
  const timers = useIsland((state) => state.timers)
  const pushToast = useIsland((state) => state.pushToast)
  const [time, setTime] = useState('08:00')
  const [label, setLabel] = useState('起床')
  const [repeat, setRepeat] = useState<'once' | 'daily' | 'weekdays' | 'weekend'>('daily')
  const [date, setDate] = useState('')

  const daysFor = (value: typeof repeat): number[] => {
    if (value === 'once') return []
    if (value === 'weekdays') return [1, 2, 3, 4, 5]
    if (value === 'weekend') return [0, 6]
    return [0, 1, 2, 3, 4, 5, 6]
  }

  const add = (): void => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      pushToast({ id: `alarm-${Date.now()}`, kind: 'error', text: '请选择有效的时间' })
      return
    }
    window.island.alarms('add', {
      time,
      label: label.trim() || '闹钟',
      days: date ? [] : daysFor(repeat),
      date: date || null,
      enabled: true
    })
    pushToast({
      id: `alarm-ok-${Date.now()}`,
      kind: 'info',
      text: date ? `已添加 ${date} ${time} 单日闹钟` : `已添加 ${time} 闹钟`
    })
  }

  return (
    <section className="card tool-card alarms-card" id="tool-alarms" aria-label="闹钟">
      <div className="tool-head">
        <div>
          <span className="tool-title">
            <AlarmClock size={14} /> 闹钟
          </span>
          <span className="tool-sub">触发时胶囊微光提示，不弹大窗</span>
        </div>
        <span className="alarm-count">{timers.alarms.length}</span>
      </div>

      {timers.firingAlarm ? (
        <div className="alarm-firing">
          <span className="alarm-firing-pulse" />
          <AlarmClock size={16} />
          <div>
            <strong>{timers.firingAlarm.time} · {timers.firingAlarm.label}</strong>
            <span>闹钟已触发</span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => window.island.alarms('dismiss', { mode: 'close' })}
          >
            关闭闹钟
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => window.island.alarms('dismiss', { mode: 'snooze' })}
          >
            5分钟后
          </button>
        </div>
      ) : null}

      <div className="alarm-form">
        <input className="input input-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} aria-label="闹钟时间" />
        <input
          className="input"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="标签"
          maxLength={20}
          aria-label="闹钟标签"
        />
        <input
          className="input input-date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          aria-label="闹钟指定日期"
          title="指定日期；留空则按右侧周期重复"
        />
        <select className="input input-select" value={repeat} onChange={(event) => setRepeat(event.target.value as typeof repeat)} aria-label="重复">
          <option value="once">仅一次</option>
          <option value="daily">每天</option>
          <option value="weekdays">工作日</option>
          <option value="weekend">周末</option>
        </select>
        <button type="button" className="btn btn-primary btn-sm" onClick={add} aria-label="添加闹钟">
          <Plus size={13} />
        </button>
      </div>

      <div className="alarm-list">
        {timers.alarms.length === 0 ? (
          <div className="alarm-empty">还没有闹钟，添加一个每日提醒。</div>
        ) : (
          timers.alarms.map((alarm: Alarm) => (
            <div className={`alarm-row ${alarm.enabled ? '' : 'is-off'}`} key={alarm.id}>
              <span className="alarm-time">{alarm.time}</span>
              <span className="alarm-main">
                <span className="alarm-label">{alarm.label}</span>
                <span className="alarm-repeat">{alarm.date ? `${alarm.date} · 单日` : repeatLabel(alarm.days)}</span>
              </span>
              <Switch
                checked={alarm.enabled}
                onChange={() => window.island.alarms('toggle', { id: alarm.id })}
                label={`${alarm.time} 闹钟`}
              />
              <button
                type="button"
                className="icon-btn alarm-delete"
                aria-label="删除闹钟"
                onClick={() => window.island.alarms('remove', { id: alarm.id })}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>
      <p className="tool-note">应用运行时每分钟检查一次；关闭期间错过的闹钟不会补触发。</p>
    </section>
  )
}

function TodosCard({ date }: { date: string }): ReactNode {
  const todos = useIsland((state) => state.todos)
  const setTodos = useIsland((state) => state.setTodos)
  const [text, setText] = useState('')
  const dateObject = parseLocalDate(date)
  const today = localDateKey(new Date())
  const dayTodos = todos
    .filter((todo: TodoItem) => todo.date === date)
    .sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt - a.createdAt)
  const done = dayTodos.filter((todo) => todo.done).length

  const add = async (): Promise<void> => {
    if (!text.trim()) return
    const items = await window.island.todos('add', { text, date })
    setTodos(items)
    setText('')
  }

  const updateReminder = async (todo: TodoItem, patch: Partial<TodoItem>): Promise<void> => {
    const next = {
      remindAt: todo.remindAt,
      reminderEnabled: todo.reminderEnabled,
      reminderKind: todo.reminderKind,
      ...patch
    }
    const items = await window.island.todos('updateReminder', {
      id: todo.id,
      remindAt: next.remindAt,
      reminderEnabled: next.reminderEnabled,
      reminderKind: next.reminderKind
    })
    setTodos(items)
  }

  const toggleReminder = async (todo: TodoItem): Promise<void> => {
    const enabled = !todo.reminderEnabled
    await updateReminder(todo, {
      reminderEnabled: enabled,
      remindAt: todo.remindAt ?? Date.now() + 5 * 60_000
    })
  }

  return (
    <section className="card tool-card todos-card" id="tool-todos" aria-label="待办事项">
      <div className="tool-head">
        <div>
          <span className="tool-title">
            <Check size={14} /> 待办
          </span>
          <span className="tool-sub">
            {date === today ? '今天' : `${dateObject.getMonth() + 1}月${dateObject.getDate()}日`} · {done}/{dayTodos.length} 完成
          </span>
        </div>
        {dayTodos.some((todo) => todo.done) ? (
          <button
            type="button"
            className="link-btn"
            onClick={async () => setTodos(await window.island.todos('clearDone'))}
          >
            清除已完成
          </button>
        ) : null}
      </div>

      <div className="todo-add">
        <input
          className="input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void add()
          }}
          placeholder="添加待办，回车保存…"
          maxLength={200}
          aria-label="新待办"
        />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void add()} disabled={!text.trim()}>
          <Plus size={14} />
        </button>
      </div>

      <div className="todo-list">
        {dayTodos.length === 0 ? (
          <div className="todo-empty">这一天还没有待办，写一条吧。</div>
        ) : (
          dayTodos.map((todo) => (
            <div className={`todo-row ${todo.done ? 'is-done' : ''}`} key={todo.id}>
              <button
                type="button"
                className="todo-check"
                aria-label={todo.done ? '标记未完成' : '标记完成'}
                onClick={async () => setTodos(await window.island.todos('toggle', { id: todo.id }))}
              >
                {todo.done ? <Check size={12} /> : null}
              </button>
              <span className="todo-text">{todo.text}</span>
              <button
                type="button"
                className={`icon-btn todo-reminder-toggle ${todo.reminderEnabled ? 'is-on' : ''}`}
                aria-label={todo.reminderEnabled ? '关闭待办提醒' : '开启待办提醒'}
                title={todo.reminderEnabled ? '关闭这条待办的提醒' : '开启这条待办的提醒'}
                onClick={() => void toggleReminder(todo)}
              >
                {todo.reminderEnabled ? <Bell size={12} /> : <BellOff size={12} />}
              </button>
              <button
                type="button"
                className="icon-btn todo-delete"
                aria-label="删除待办"
                onClick={async () => setTodos(await window.island.todos('remove', { id: todo.id }))}
              >
                <Trash2 size={12} />
              </button>
              {todo.reminderEnabled ? (
                <div className="todo-reminder-controls">
                  <input
                    className="input input-mini"
                    type="datetime-local"
                    value={todo.remindAt ? toLocalInput(todo.remindAt) : ''}
                    onChange={(event) => {
                      const at = event.target.value ? new Date(event.target.value).getTime() : null
                      if (at === null || Number.isFinite(at)) void updateReminder(todo, { remindAt: at })
                    }}
                    aria-label="待办提醒时间"
                  />
                  <select
                    className="input input-select input-mini"
                    value={todo.reminderKind}
                    onChange={(event) =>
                      void updateReminder(todo, { reminderKind: event.target.value as 'message' | 'alarm' })
                    }
                    aria-label="待办提醒类型"
                  >
                    <option value="message">消息</option>
                    <option value="alarm">闹钟</option>
                  </select>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </section>
  )
}

const TOOL_NAV = [
  { id: 'tool-calendar', label: '日历', icon: CalendarDays },
  { id: 'tool-weather', label: '天气', icon: Cloud },
  { id: 'tool-timers', label: '计时', icon: Timer },
  { id: 'tool-alarms', label: '闹钟', icon: AlarmClock },
  { id: 'tool-todos', label: '待办', icon: Check }
]

export function ToolsModule(): ReactNode {
  const [selected, setSelected] = useState(() => localDateKey(new Date()))
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [active, setActive] = useState('tool-calendar')

  const jump = (id: string): void => {
    setActive(id)
    const element = document.getElementById(id)
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="tools-shell">
      <nav className="tools-nav" aria-label="工具快捷定位">
        {TOOL_NAV.map((item) => {
          const Icon = item.icon
          return (
            <button
              type="button"
              key={item.id}
              className={`tools-nav-item ${active === item.id ? 'is-active' : ''}`}
              onClick={() => jump(item.id)}
            >
              <Icon size={12} />
              {item.label}
            </button>
          )
        })}
        <span className="tools-nav-hint">↓ 滚动查看闹钟 · 待办</span>
      </nav>

      <div className="tools-grid">
      <CalendarCard
        month={month}
        selected={selected}
        onMonth={setMonth}
        onSelect={(key, date) => {
          setSelected(key)
          setMonth(startOfMonth(date))
        }}
      />
      <WeatherCard />
      <TimersCard />
      <AlarmsCard />
      <TodosCard date={selected} />
      </div>
    </div>
  )
}
