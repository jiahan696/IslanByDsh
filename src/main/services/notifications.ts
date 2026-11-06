import { EventEmitter } from 'node:events'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import fs from 'node:fs'
import type {
  DemoNotificationInput,
  NotificationApp,
  NotificationItem,
  NotificationSourceStatus,
  NotificationState
} from '@shared/types'
import { JsonStore } from '../lib/json-store'
import { userDataPath } from '../lib/paths'
import { log } from '../lib/logger'

const APP_LABEL: Record<NotificationApp, string> = {
  wechat: '微信',
  qq: 'QQ',
  system: '系统'
}

const MAX_ITEMS = 40
const MAX_BODY = 16 * 1024

interface NotificationFile {
  items: NotificationItem[]
  acknowledgedAt: number | null
  bridgeToken: string
}

/**
 * Inbound notification aggregation.
 *
 * Windows does not expose a public unread-count API for WeChat/QQ (both are
 * closed clients with no documented IPC). The reliable path is the local bridge:
 * any local helper (e.g. a WeChat automation script) POSTs to 127.0.0.1 with a
 * per-install token. The widget also keeps a process watcher so the panel can
 * say whether WeChat/QQ is running. Toast-listener capability is reported as
 * unavailable instead of pretending it works.
 */
class NotificationService extends EventEmitter {
  private readonly store = new JsonStore<NotificationFile>(userDataPath('notifications.json'), {
    items: [],
    acknowledgedAt: null,
    bridgeToken: randomBytes(18).toString('hex')
  })
  private items: NotificationItem[] = this.store.get().items ?? []
  private acknowledgedAt: number | null = this.store.get().acknowledgedAt ?? null
  private readonly bridgeToken: string = this.store.get().bridgeToken || randomBytes(18).toString('hex')
  private unread = new Set<string>()
  private server: Server | null = null
  private port: number | null = null
  private watcherTimer: NodeJS.Timeout | null = null
  private watcherActive = false
  private lastPushAt = 0
  private timer: NodeJS.Timeout | null = null

  startBridge(enabled: boolean): void {
    if (enabled) void this.startServer()
    else this.stopServer()
    if (!this.timer) {
      // Process presence is cheap; notifications themselves are event driven.
      this.watcherTimer = setInterval(() => this.checkClients(), 20_000)
      this.timer = setInterval(() => this.emitState(), 60_000)
      void this.checkClients()
    }
  }

  stop(): void {
    this.stopServer()
    if (this.watcherTimer) clearInterval(this.watcherTimer)
    if (this.timer) clearInterval(this.timer)
    this.watcherTimer = null
    this.timer = null
    this.store.flush()
  }

  private state(): NotificationState {
    const sources: NotificationSourceStatus = {
      toast: 'unavailable',
      bridge: Boolean(this.server),
      watcher: this.watcherActive,
      bridgePort: this.port
    }
    return {
      unread: this.unread.size,
      items: [...this.items],
      sources,
      acknowledgedAt: this.acknowledgedAt
    }
  }

  get(): NotificationState {
    return this.state()
  }

  private emitState(): void {
    this.emit('notifications', this.state())
  }

  push(app: NotificationApp, title: string, body: string, confidence: 'high' | 'low' | 'demo'): NotificationItem | null {
    const cleanTitle = (title ?? '').trim().slice(0, 120)
    const cleanBody = (body ?? '').trim().slice(0, 300)
    if (!cleanTitle && !cleanBody) return null
    const now = Date.now()
    const duplicate = this.items.find(
      (item) => now - item.ts < 4000 && item.app === app && item.title === cleanTitle && item.body === cleanBody
    )
    if (duplicate) return null
    this.lastPushAt = now
    const item: NotificationItem = {
      id: randomUUID(),
      app,
      appLabel: APP_LABEL[app] ?? app,
      title: cleanTitle || APP_LABEL[app],
      body: cleanBody,
      ts: now,
      confidence
    }
    this.items = [item, ...this.items].slice(0, MAX_ITEMS)
    this.unread.add(item.id)
    this.acknowledgedAt = null
    this.persist()
    this.emitState()
    return item
  }

  private persist(): void {
    this.store.replace({ items: this.items, acknowledgedAt: this.acknowledgedAt, bridgeToken: this.bridgeToken })
  }

  clear(): NotificationState {
    this.unread.clear()
    this.acknowledgedAt = Date.now()
    this.persist()
    this.emitState()
    return this.state()
  }

  remove(id: string): NotificationState {
    this.items = this.items.filter((item) => item.id !== id)
    this.unread.delete(id)
    this.persist()
    this.emitState()
    return this.state()
  }

  demo(input: DemoNotificationInput): NotificationState {
    const app: NotificationApp = input.app === 'qq' ? 'qq' : input.app === 'system' ? 'system' : 'wechat'
    this.push(app, input.title || '新消息', input.body || '这是一条演示通知，用于验证胶囊角标与动效。', 'demo')
    return this.state()
  }

  private async checkClients(): Promise<void> {
    try {
      const { execFile } = await import('node:child_process')
      const output = await new Promise<string>((resolve) => {
        execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 8000, encoding: 'utf8' }, (error, stdout) => {
          resolve(error ? '' : stdout)
        })
      })
      const running = /wechat|weixin|^"?qq\.exe|^"?tim\.exe/i.test(output)
      if (running !== this.watcherActive) {
        this.watcherActive = running
        this.emitState()
      }
    } catch {
      this.watcherActive = false
    }
  }

  private async startServer(): Promise<void> {
    if (this.server) return
    const server = createServer((req, res) => this.handleRequest(req, res))
    server.on('error', (error) => {
      log.error('notification bridge failed', error.message)
      this.server = null
      this.port = null
      this.emitState()
    })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    this.port = typeof address === 'object' && address ? address.port : null
    this.server = server
    try {
      fs.writeFileSync(
        userDataPath('notification-bridge.json'),
        JSON.stringify(
          {
            endpoint: `http://127.0.0.1:${this.port}/notify`,
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-island-token': this.bridgeToken },
            body: { app: 'wechat', title: '张三', body: '在吗？' }
          },
          null,
          2
        ),
        'utf8'
      )
    } catch {
      /* the bridge still works; only the onboarding file is missing */
    }
    this.emitState()
    log.info(`notification bridge listening on 127.0.0.1:${this.port}`)
  }

  private stopServer(): void {
    if (!this.server) return
    this.server.close()
    this.server = null
    this.port = null
    try {
      fs.unlinkSync(userDataPath('notification-bridge.json'))
    } catch {
      /* already gone */
    }
    this.emitState()
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    if (req.method === 'GET' && req.url === '/health') {
      res.end(JSON.stringify({ ok: true, unread: this.unread.size }))
      return
    }
    if (req.method !== 'POST' || req.url !== '/notify') {
      res.statusCode = 404
      res.end(JSON.stringify({ ok: false, error: 'not-found' }))
      return
    }
    const token = String(req.headers['x-island-token'] ?? '')
    if (!this.tokenMatches(token)) {
      res.statusCode = 401
      res.end(JSON.stringify({ ok: false, error: 'invalid-token' }))
      return
    }

    let raw = ''
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString('utf8')
      if (raw.length > MAX_BODY) {
        res.statusCode = 413
        res.end(JSON.stringify({ ok: false, error: 'payload-too-large' }))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        const payload = JSON.parse(raw || '{}')
        const app: NotificationApp = payload.app === 'qq' ? 'qq' : payload.app === 'system' ? 'system' : 'wechat'
        const item = this.push(app, String(payload.title ?? ''), String(payload.body ?? ''), 'high')
        res.end(JSON.stringify({ ok: true, accepted: Boolean(item), unread: this.unread.size }))
      } catch {
        res.statusCode = 400
        res.end(JSON.stringify({ ok: false, error: 'invalid-json' }))
      }
    })
    req.on('error', () => {
      /* client vanished */
    })
  }

  private tokenMatches(candidate: string): boolean {
    try {
      const a = Buffer.from(candidate)
      const b = Buffer.from(this.bridgeToken)
      if (a.length !== b.length) return false
      return timingSafeEqual(a, b)
    } catch {
      return false
    }
  }
}

export const notificationService = new NotificationService()
