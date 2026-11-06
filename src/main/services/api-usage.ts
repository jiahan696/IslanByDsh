import { EventEmitter } from 'node:events'
import type { ApiUsage } from '@shared/types'
import { JsonStore } from '../lib/json-store'
import { userDataPath } from '../lib/paths'

interface UsageFile {
  date: string
  today: number
  byService: Record<string, number>
}

function localDateKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * "Today's API usage" is deliberately local and auditable: it counts every
 * outbound request this widget makes (weather, geolocation, lyrics). There is no
 * third-party account involved, so the number cannot silently drift from a
 * remote billing dashboard.
 */
class ApiUsageService extends EventEmitter {
  private readonly store: JsonStore<UsageFile>
  private data: UsageFile

  constructor() {
    super()
    const today = localDateKey()
    this.store = new JsonStore<UsageFile>(userDataPath('api-usage.json'), { date: today, today: 0, byService: {} })
    this.data = this.store.get()
    this.rollIfNeeded()
  }

  private rollIfNeeded(): void {
    const today = localDateKey()
    if (this.data.date !== today) {
      this.data = { date: today, today: 0, byService: {} }
      this.store.replace(this.data)
    }
  }

  increment(service: string, count = 1): void {
    this.rollIfNeeded()
    this.data.today += count
    this.data.byService[service] = (this.data.byService[service] ?? 0) + count
    this.store.replace(this.data)
    this.emit('changed', this.snapshot())
  }

  snapshot(): ApiUsage {
    this.rollIfNeeded()
    return { today: this.data.today, byService: { ...this.data.byService }, date: this.data.date }
  }
}

export const apiUsageService = new ApiUsageService()
