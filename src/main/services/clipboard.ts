import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { clipboard } from 'electron'
import type { ClipboardEntry } from '@shared/types'
import { JsonStore } from '../lib/json-store'
import { userDataPath } from '../lib/paths'

interface ClipboardFile {
  items: ClipboardEntry[]
}

const MAX_TEXT = 12_000

class ClipboardService extends EventEmitter {
  private readonly store = new JsonStore<ClipboardFile>(userDataPath('clipboard.json'), { items: [] })
  private items: ClipboardEntry[] = (this.store.get().items ?? []).slice(0, 300)
  private timer: NodeJS.Timeout | null = null
  private enabled = false
  private lastText = ''
  private max = 80
  private tickBusy = false

  list(): ClipboardEntry[] {
    return [...this.items].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt)
  }

  start(enabled: boolean, clearOnStart: boolean, max: number): void {
    this.max = Math.max(10, Math.min(300, max))
    if (clearOnStart) {
      this.items = this.items.filter((item) => item.pinned)
      this.persist()
    }
    this.enabled = enabled
    this.syncBaseline()
    if (!enabled) return
    if (this.timer) clearInterval(this.timer)
    this.timer = setInterval(() => void this.tick(), 650)
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return
    this.enabled = enabled
    if (!enabled) {
      if (this.timer) clearInterval(this.timer)
      this.timer = null
      return
    }
    this.syncBaseline()
    if (this.timer) clearInterval(this.timer)
    this.timer = setInterval(() => void this.tick(), 650)
  }

  setMax(max: number): void {
    this.max = Math.max(10, Math.min(300, Math.round(max)))
    this.trim()
    this.persist()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.store.flush()
  }

  private syncBaseline(): void {
    void clipboard.readText().then((text) => {
      this.lastText = text
    })
  }

  private async tick(): Promise<void> {
    if (!this.enabled || this.tickBusy) return
    this.tickBusy = true
    try {
      const text = await clipboard.readText()
      if (!text || text === this.lastText) return
      this.lastText = text
      if (text.length > MAX_TEXT) return
      const recent = this.items[0]
      if (recent && recent.text === text && !recent.pinned) return
      this.items.unshift({ id: randomUUID(), text, pinned: false, createdAt: Date.now() })
      this.trim()
      this.persist()
    } finally {
      this.tickBusy = false
    }
  }

  async copy(id: string): Promise<ClipboardEntry[]> {
    const item = this.items.find((entry) => entry.id === id)
    if (item) {
      await clipboard.writeText(item.text)
      this.lastText = item.text
    }
    return this.list()
  }

  pin(id: string): ClipboardEntry[] {
    const item = this.items.find((entry) => entry.id === id)
    if (item) item.pinned = !item.pinned
    this.trim()
    this.persist()
    return this.list()
  }

  remove(id: string): ClipboardEntry[] {
    this.items = this.items.filter((entry) => entry.id !== id)
    this.persist()
    return this.list()
  }

  clear(): ClipboardEntry[] {
    // Pinned entries are intentionally permanent until explicitly deleted.
    this.items = this.items.filter((entry) => entry.pinned)
    this.persist()
    return this.list()
  }

  private trim(): void {
    const pinned = this.items.filter((item) => item.pinned)
    const rest = this.items.filter((item) => !item.pinned).slice(0, Math.max(0, this.max - pinned.length))
    this.items = [...pinned, ...rest].sort((a, b) => b.createdAt - a.createdAt)
  }

  private persist(): void {
    this.store.replace({ items: this.items })
    this.emit('clipboard', this.list())
  }

  flush(): void {
    this.store.flush()
  }
}

export const clipboardService = new ClipboardService()
