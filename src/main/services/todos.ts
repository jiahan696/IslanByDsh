import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import type { TodoItem } from '@shared/types'
import { JsonStore } from '../lib/json-store'
import { userDataPath } from '../lib/paths'

interface TodoFile {
  items: TodoItem[]
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const MAX_ITEMS = 500

class TodoService extends EventEmitter {
  private readonly store = new JsonStore<TodoFile>(userDataPath('todos.json'), { items: [] })
  private items: TodoItem[] = (this.store.get().items ?? []).map((item) => ({
    ...item,
    remindAt: typeof item.remindAt === 'number' ? item.remindAt : null,
    reminderEnabled: Boolean(item.reminderEnabled),
    reminderKind: item.reminderKind === 'alarm' ? 'alarm' : 'message',
    reminderDone: Boolean(item.reminderDone),
    snoozeUntil: typeof item.snoozeUntil === 'number' ? item.snoozeUntil : null
  }))

  list(): TodoItem[] {
    return [...this.items].sort((a, b) => a.date.localeCompare(b.date) || b.createdAt - a.createdAt)
  }

  private persist(): void {
    this.store.replace({ items: this.items })
    this.emit('todos', this.list())
  }

  flush(): void {
    this.store.flush()
  }

  add(
    text: string,
    date?: string,
    remindAt?: number | null,
    reminderEnabled?: boolean,
    reminderKind?: 'message' | 'alarm'
  ): TodoItem[] {
    const clean = text.trim().slice(0, 200)
    if (!clean) return this.list()
    if (this.items.length >= MAX_ITEMS) return this.list()
    const day = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayKey()
    const at = typeof remindAt === 'number' && Number.isFinite(remindAt) ? remindAt : null
    this.items.push({
      id: randomUUID(),
      text: clean,
      done: false,
      date: day,
      createdAt: Date.now(),
      remindAt: at,
      reminderEnabled: Boolean(reminderEnabled && at !== null),
      reminderKind: reminderKind === 'alarm' ? 'alarm' : 'message',
      reminderDone: false,
      snoozeUntil: null
    })
    this.persist()
    return this.list()
  }

  updateReminder(
    id: string,
    payload: {
      remindAt?: number | null
      reminderEnabled?: boolean
      reminderKind?: 'message' | 'alarm'
    }
  ): TodoItem[] {
    const item = this.items.find((entry) => entry.id === id)
    if (item) {
      if (payload.remindAt !== undefined) {
        item.remindAt = typeof payload.remindAt === 'number' && Number.isFinite(payload.remindAt) ? payload.remindAt : null
      }
      if (payload.reminderEnabled !== undefined) item.reminderEnabled = Boolean(payload.reminderEnabled)
      if (payload.reminderKind !== undefined) item.reminderKind = payload.reminderKind === 'alarm' ? 'alarm' : 'message'
      if (!item.remindAt) item.reminderEnabled = false
      item.reminderDone = false
      item.snoozeUntil = null
    }
    this.persist()
    return this.list()
  }

  consumeDue(now: number): TodoItem[] {
    const due: TodoItem[] = []
    let changed = false
    for (const item of this.items) {
      if (item.done || item.reminderDone || !item.reminderEnabled) continue
      const normal = item.snoozeUntil === null && item.remindAt !== null && item.remindAt <= now
      const snoozed = item.snoozeUntil !== null && item.snoozeUntil <= now
      if (!normal && !snoozed) continue
      item.snoozeUntil = null
      item.reminderDone = true
      due.push({ ...item })
      changed = true
    }
    if (changed) this.persist()
    return due
  }

  dismissReminder(id: string, mode: 'close' | 'snooze'): TodoItem[] {
    const item = this.items.find((entry) => entry.id === id)
    if (item) {
      item.snoozeUntil = mode === 'snooze' ? Date.now() + 5 * 60_000 : null
      item.reminderDone = mode === 'snooze' ? false : true
    }
    this.persist()
    return this.list()
  }

  toggle(id: string): TodoItem[] {
    const item = this.items.find((entry) => entry.id === id)
    if (item) item.done = !item.done
    this.persist()
    return this.list()
  }

  remove(id: string): TodoItem[] {
    this.items = this.items.filter((entry) => entry.id !== id)
    this.persist()
    return this.list()
  }

  clearDone(): TodoItem[] {
    this.items = this.items.filter((entry) => !entry.done)
    this.persist()
    return this.list()
  }
}

export const todoService = new TodoService()
