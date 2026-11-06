import type { ReactNode } from 'react'
import { useState } from 'react'
import { Bell, MessageCircle, Radio, Sparkles, X } from 'lucide-react'
import { useIsland } from '../store'
import { timeAgo } from '../lib/format'
import { useNow } from '../lib/hooks'
import { EmptyState } from './ui'

const APP_CLASS: Record<string, string> = { wechat: 'wechat', qq: 'qq', system: 'system' }
const APP_GLYPH: Record<string, string> = { wechat: '微', qq: 'Q', system: '系' }

export function NotificationsCard(): ReactNode {
  const notifications = useIsland((state) => state.notifications)
  const now = useNow(15_000)
  const [busy, setBusy] = useState(false)

  const clear = async (): Promise<void> => {
    const state = await window.island.notifications('clear')
    useIsland.getState().setNotifications(state)
  }

  const remove = async (id: string): Promise<void> => {
    const state = await window.island.notifications('remove', { id })
    useIsland.getState().setNotifications(state)
  }

  const demo = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const state = await window.island.notifications('demo', {
        app: 'wechat',
        title: '新的微信消息',
        body: '来自「产品讨论组」的演示通知，用于验证角标和动效。'
      })
      useIsland.getState().setNotifications(state)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card notifications-card" aria-label="消息提醒">
      <div className="card-head">
        <span className="card-title">
          <Bell size={14} /> 提醒
          {notifications.unread > 0 ? <span className="count-pill">{notifications.unread}</span> : null}
        </span>
        {notifications.items.length > 0 ? (
          <button type="button" className="link-btn" onClick={() => void clear()}>
            全部已读
          </button>
        ) : null}
      </div>

      {notifications.items.length === 0 ? (
        <EmptyState
          icon={<MessageCircle size={22} />}
          title="暂无新提醒"
          description="微信 / QQ 的新消息角标会在这里汇总。"
          action={
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void demo()} disabled={busy}>
              <Sparkles size={13} /> 注入测试提醒
            </button>
          }
        />
      ) : (
        <div className="notice-list">
          {notifications.items.slice(0, 10).map((item) => (
            <div className="notice-item" key={item.id}>
              <span className={`notice-app ${APP_CLASS[item.app] ?? 'system'}`} aria-hidden>
                {APP_GLYPH[item.app] ?? '·'}
              </span>
              <div className="notice-main">
                <div className="notice-title">
                  {item.title}
                  {item.confidence === 'demo' ? <span className="demo-tag">演示</span> : null}
                  {item.confidence === 'low' ? <span className="demo-tag">低置信</span> : null}
                </div>
                {item.body ? <div className="notice-body">{item.body}</div> : null}
                <div className="notice-meta">
                  {item.appLabel} · {timeAgo(item.ts, now.getTime())}
                </div>
              </div>
              <button
                type="button"
                className="notice-dismiss"
                aria-label="移除提醒"
                title="移除提醒"
                onClick={() => void remove(item.id)}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="notice-sources">
        <span className={`source ${notifications.sources.bridge ? 'is-on' : ''}`} title="本地 HTTP 接入：写入微信/QQ 自动化脚本的提醒">
          <Radio size={11} />
          {notifications.sources.bridge ? `桥接 :${notifications.sources.bridgePort ?? '—'}` : '桥接未启用'}
        </span>
        <span className={`source ${notifications.sources.watcher ? 'is-on' : ''}`} title="每 20 秒检查微信/QQ 进程是否在运行">
          {notifications.sources.watcher ? '客户端运行中' : '客户端未运行'}
        </span>
        <span className="source is-muted" title="微信/QQ 未开放系统通知读取接口，精确未读需通过本地桥接接入">
          系统通知不可用
        </span>
      </div>

    </section>
  )
}
