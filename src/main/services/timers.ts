import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import type { Alarm, CountdownState, ReminderKind, TimerState } from '@shared/types'
import { JsonStore } from '../lib/json-store'
import { userDataPath } from '../lib/paths'
import { log } from '../lib/logger'
import { todoService } from './todos'

interface PersistedTimers {
  stopwatch: { running: boolean; accumulatedMs: number; startedAt: number | null }
  countdown: {
    running: boolean
    endAt: number | null
    remainingMs: number
    totalMs: number
    label: string
    finishedAt: number | null
    reminderEnabled: boolean
    reminderKind: ReminderKind
    snoozeUntil: number | null
  }
  alarms: Alarm[]
}

const DEFAULT_TIMERS: PersistedTimers = {
  stopwatch: { running: false, accumulatedMs: 0, startedAt: null },
  countdown: {
    running: false,
    endAt: null,
    remainingMs: 25 * 60_000,
    totalMs: 25 * 60_000,
    label: '专注',
    finishedAt: null,
    reminderEnabled: true,
    reminderKind: 'message',
    snoozeUntil: null
  },
  alarms: []
}

function dateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function timeKey(date = new Date()): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function sanitizeAlarm(input: Partial<Alarm>, base?: Alarm): Alarm | null {
  const time = typeof input.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.time) ? input.time : base?.time
  if (!time) return null
  const days = Array.isArray(input.days)
    ? Array.from(new Set(input.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))).sort()
    : base?.days ?? []
  return {
    id: typeof input.id === 'string' && input.id ? input.id : base?.id ?? randomUUID(),
    time,
    label: (typeof input.label === 'string' ? input.label : base?.label ?? '闹钟').slice(0, 40),
    enabled: typeof input.enabled === 'boolean' ? input.enabled : base?.enabled ?? true,
    days,
    date:
      typeof input.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date)
        ? input.date
        : input.date === null
          ? null
          : base?.date ?? null,
    lastTriggeredDate: typeof input.lastTriggeredDate === 'string' ? input.lastTriggeredDate : base?.lastTriggeredDate ?? null,
    snoozeUntil: typeof input.snoozeUntil === 'number' ? input.snoozeUntil : base?.snoozeUntil ?? null
  }
}

/**
 * Stopwatch / countdown / alarm engine.
 *
 * Timers live in the main process so they keep accurate time when the renderer is
 * hidden or throttled. The tick runs at 100 ms, but renderer emissions are
 * throttled to 1 Hz while collapsed and 10 Hz only when the panel is open AND a
 * stopwatch is running. Every mutation is persisted (debounced by JsonStore).
 */
class TimerService extends EventEmitter {
  private readonly store = new JsonStore<PersistedTimers>(userDataPath('timers.json'), DEFAULT_TIMERS)
  private persisted = this.store.get()
  private timer: NodeJS.Timeout | null = null
  private expanded = false
  private lastEmit = 0
  private lastSecond = -1
  private firingAlarm: Alarm | null = null
  private firingTodo: import('@shared/types').TodoItem | null = null
  private firingCountdown: CountdownState | null = null
  private lastFiringKey: string | null = null

  start(): void {
    this.restore()
    this.timer = setInterval(() => this.tick(), 100)
    this.tick(true)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.store.flush()
  }

  setExpanded(expanded: boolean): void {
    this.expanded = expanded
    if (expanded) this.tick(true)
  }

  private restore(): void {
    const now = Date.now()
    // Older timers.json files do not contain the reminder fields.
    const cd = this.persisted.countdown as Partial<PersistedTimers['countdown']>
    cd.reminderEnabled = typeof cd.reminderEnabled === 'boolean' ? cd.reminderEnabled : true
    cd.reminderKind = cd.reminderKind === 'alarm' ? 'alarm' : 'message'
    cd.snoozeUntil = typeof cd.snoozeUntil === 'number' ? cd.snoozeUntil : null
    if (this.persisted.stopwatch.running && this.persisted.stopwatch.startedAt === null) {
      this.persisted.stopwatch.running = false
    }
    if (this.persisted.countdown.running) {
      if (this.persisted.countdown.endAt === null) {
        this.persisted.countdown.running = false
      } else if (this.persisted.countdown.endAt <= now) {
        this.persisted.countdown.running = false
        this.persisted.countdown.remainingMs = 0
        this.persisted.countdown.finishedAt = this.persisted.countdown.endAt
      }
    }
    this.persisted.alarms = (this.persisted.alarms ?? []).map((alarm) => sanitizeAlarm(alarm)).filter((a): a is Alarm => Boolean(a))
    this.persist()
  }

  private persist(): void {
    this.store.replace(this.persisted)
  }

  private stopwatchElapsed(): number {
    const sw = this.persisted.stopwatch
    if (sw.running && sw.startedAt !== null) return sw.accumulatedMs + Math.max(0, Date.now() - sw.startedAt)
    return sw.accumulatedMs
  }

  private countdownRemaining(): number {
    const cd = this.persisted.countdown
    if (cd.running && cd.endAt !== null) return Math.max(0, cd.endAt - Date.now())
    return Math.max(0, cd.remainingMs)
  }

  private snapshotCountdown(): CountdownState {
    const cd = this.persisted.countdown
    return {
      running: cd.running,
      remainingMs: this.countdownRemaining(),
      totalMs: cd.totalMs,
      label: cd.label,
      finishedAt: cd.finishedAt,
      reminderEnabled: cd.reminderEnabled,
      reminderKind: cd.reminderKind,
      snoozeUntil: cd.snoozeUntil
    }
  }

  private tick(force = false): void {
    const now = Date.now()
    let dirty = false

    const cd = this.persisted.countdown
    if (cd.running && cd.endAt !== null && now >= cd.endAt) {
      cd.running = false
      cd.remainingMs = 0
      cd.endAt = null
      cd.finishedAt = now
      if (cd.reminderEnabled && this.firingAlarm === null && this.firingTodo === null && this.firingCountdown === null) {
        this.firingCountdown = this.snapshotCountdown()
      }
      dirty = true
      this.emitNow()
    }

    if (
      !cd.running &&
      cd.reminderEnabled &&
      this.firingCountdown === null &&
      cd.snoozeUntil !== null &&
      cd.snoozeUntil <= now
    ) {
      cd.snoozeUntil = null
      this.firingCountdown = this.snapshotCountdown()
      dirty = true
      this.emitNow(true)
    }

    if (this.firingTodo === null) {
      const due = todoService.consumeDue(now)
      if (due.length > 0) {
        this.firingTodo = due[0]
        dirty = true
        this.emitNow(true)
      }
    }

    const currentTime = timeKey(new Date(now))
    const currentDate = dateKey(new Date(now))
    const weekday = new Date(now).getDay()
    if (!this.firingAlarm) {
      const snoozed = this.persisted.alarms.find(
        (alarm) => alarm.enabled && alarm.snoozeUntil !== null && alarm.snoozeUntil <= now
      )
      if (snoozed) {
        snoozed.snoozeUntil = null
        this.firingAlarm = { ...snoozed }
        dirty = true
        this.emitNow(true)
      }
    }
    if (!this.firingAlarm) {
      for (const alarm of this.persisted.alarms) {
        if (!alarm.enabled) continue
        if (alarm.time !== currentTime) continue
        if (alarm.date) {
          if (alarm.date !== currentDate || alarm.lastTriggeredDate === currentDate) continue
        } else if (alarm.days.length === 0) {
          if (alarm.lastTriggeredDate === currentDate) continue
        } else if (!alarm.days.includes(weekday)) {
          continue
        }
        const firingKey = `${alarm.id}:${currentDate}:${currentTime}`
        if (this.lastFiringKey === firingKey) continue
        this.lastFiringKey = firingKey
        alarm.lastTriggeredDate = currentDate
        if (alarm.days.length === 0 || alarm.date) alarm.enabled = false
        this.firingAlarm = alarm
        dirty = true
        this.emitNow(true)
        log.info('alarm fired', alarm.time, alarm.label)
        break
      }
    }

    if (dirty) this.persist()

    const elapsed = this.stopwatchElapsed()
    const remaining = this.countdownRemaining()
    const second = Math.floor((this.persisted.stopwatch.running ? elapsed : remaining) / 1000)
    const shouldEmit =
      force ||
      dirty ||
      second !== this.lastSecond ||
      (this.expanded && this.persisted.stopwatch.running && now - this.lastEmit >= 100)
    if (shouldEmit) {
      this.lastSecond = second
      this.emitNow()
    }
  }

  private snapshot(): TimerState {
    const stopwatch = this.persisted.stopwatch
    const stopwatchState = { running: stopwatch.running, elapsedMs: this.stopwatchElapsed(), laps: [] as number[] }
    const countdown = this.snapshotCountdown()
    return {
      stopwatch: stopwatchState,
      countdown,
      alarms: this.persisted.alarms.map((alarm) => ({ ...alarm })),
      firingAlarm: this.firingAlarm ? { ...this.firingAlarm } : null,
      firingTodo: this.firingTodo ? { ...this.firingTodo } : null,
      firingCountdown: this.firingCountdown ? { ...this.firingCountdown } : null,
      now: Date.now()
    }
  }

  private emitNow(force = false): void {
    const now = Date.now()
    if (!force && now - this.lastEmit < 80) return
    this.lastEmit = now
    this.emit('timers', this.snapshot())
  }

  get(): TimerState {
    return this.snapshot()
  }

  stopwatch(action: 'start' | 'pause' | 'reset' | 'lap'): void {
    const sw = this.persisted.stopwatch
    const now = Date.now()
    if (action === 'start' && !sw.running) {
      sw.running = true
      sw.startedAt = now
    } else if (action === 'pause' && sw.running) {
      sw.accumulatedMs = this.stopwatchElapsed()
      sw.running = false
      sw.startedAt = null
    } else if (action === 'reset') {
      sw.running = false
      sw.startedAt = null
      sw.accumulatedMs = 0
    } else if (action === 'lap') {
      const elapsed = this.stopwatchElapsed()
      const laps = this.snapshot().stopwatch.laps
      laps.push(elapsed)
      this.emitNow(true)
      return
    }
    this.persist()
    this.emitNow(true)
  }

  countdown(
    action: 'start' | 'pause' | 'reset' | 'configure',
    payload?: { minutes?: number; seconds?: number; label?: string; kind?: ReminderKind; reminderEnabled?: boolean }
  ): void {
    const cd = this.persisted.countdown
    const now = Date.now()
    if (action === 'configure') {
      if (typeof payload?.kind === 'string') cd.reminderKind = payload.kind === 'alarm' ? 'alarm' : 'message'
      if (typeof payload?.reminderEnabled === 'boolean') cd.reminderEnabled = payload.reminderEnabled
      this.persist()
      this.emitNow(true)
      return
    }
    if (action === 'start') {
      const seconds =
        typeof payload?.seconds === 'number' && Number.isFinite(payload.seconds)
          ? payload.seconds
          : typeof payload?.minutes === 'number' && Number.isFinite(payload.minutes)
            ? payload.minutes * 60
            : null
      if (seconds !== null && seconds >= 1) {
        cd.totalMs = Math.max(1000, Math.min(7 * 86_400_000, Math.round(seconds * 1000)))
        cd.remainingMs = cd.totalMs
        cd.finishedAt = null
      }
      if (typeof payload?.kind === 'string') cd.reminderKind = payload.kind === 'alarm' ? 'alarm' : 'message'
      if (typeof payload?.reminderEnabled === 'boolean') cd.reminderEnabled = payload.reminderEnabled
      if (typeof payload?.label === 'string') cd.label = payload.label.slice(0, 24) || '倒计时'
      if (cd.remainingMs <= 0) cd.remainingMs = cd.totalMs
      cd.running = true
      cd.endAt = now + cd.remainingMs
      cd.finishedAt = null
      cd.snoozeUntil = null
      this.firingCountdown = null
    } else if (action === 'pause' && cd.running) {
      cd.remainingMs = Math.max(0, (cd.endAt ?? now) - now)
      cd.running = false
      cd.endAt = null
    } else if (action === 'reset') {
      cd.running = false
      cd.endAt = null
      cd.remainingMs = cd.totalMs
      cd.finishedAt = null
      cd.snoozeUntil = null
      this.firingCountdown = null
    }
    this.persist()
    this.emitNow(true)
  }

  dismissCountdown(mode: 'close' | 'snooze'): void {
    if (!this.firingCountdown) return
    if (mode === 'snooze') {
      this.persisted.countdown.snoozeUntil = Date.now() + 5 * 60_000
    }
    this.firingCountdown = null
    this.persist()
    this.emitNow(true)
  }

  dismissTodo(mode: 'close' | 'snooze'): void {
    if (!this.firingTodo) return
    todoService.dismissReminder(this.firingTodo.id, mode)
    this.firingTodo = null
    this.persist()
    this.emitNow(true)
  }

  alarms(
    action: 'add' | 'update' | 'remove' | 'toggle' | 'dismiss',
    payload?: Partial<Alarm> & { id?: string; mode?: 'close' | 'snooze' }
  ): void {
    const alarms = this.persisted.alarms
    if (action === 'add') {
      const alarm = sanitizeAlarm({ ...payload, enabled: payload?.enabled ?? true })
      if (alarm) alarms.push(alarm)
    } else if (action === 'update' && payload?.id) {
      const index = alarms.findIndex((alarm) => alarm.id === payload.id)
      if (index >= 0) {
        const next = sanitizeAlarm(payload, alarms[index])
        if (next) alarms[index] = next
      }
    } else if (action === 'remove' && payload?.id) {
      this.persisted.alarms = alarms.filter((alarm) => alarm.id !== payload.id)
      if (this.firingAlarm?.id === payload.id) this.firingAlarm = null
    } else if (action === 'toggle' && payload?.id) {
      const alarm = alarms.find((item) => item.id === payload.id)
      if (alarm) alarm.enabled = !alarm.enabled
    } else if (action === 'dismiss') {
      const current = this.firingAlarm
      if (current) {
        if (payload?.mode === 'snooze') {
          const alarm = alarms.find((item) => item.id === current.id)
          if (alarm) {
            alarm.enabled = true
            alarm.snoozeUntil = Date.now() + 5 * 60_000
          }
        } else {
          const alarm = alarms.find((item) => item.id === current.id)
          if (alarm) alarm.snoozeUntil = null
        }
      }
      this.firingAlarm = null
    }
    this.persist()
    this.emitNow(true)
  }
}

export const timerService = new TimerService()
