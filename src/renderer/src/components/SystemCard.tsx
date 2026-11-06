import type { ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  BatteryCharging,
  BatteryFull,
  BatteryLow,
  Bluetooth,
  Cpu,
  MemoryStick,
  Sparkles,
  Zap
} from 'lucide-react'
import { useIsland } from '../store'
import { formatBytes, formatSpeed, percent } from '../lib/format'
import { Meter } from './ui'

export function SystemCard(): ReactNode {
  const metrics = useIsland((state) => state.metrics)
  const battery = metrics.battery
  const BatteryIcon = battery.isCharging
    ? BatteryCharging
    : battery.isFull
      ? BatteryFull
      : battery.low
        ? BatteryLow
        : Zap

  return (
    <section className="card system-card" aria-label="系统状态">
      <div className="card-head">
        <span className="card-title">
          <Cpu size={14} /> 系统状态
        </span>
        <span className="card-hint">1s · 3s · 5s</span>
      </div>

      <div className="sys-vitals">
        <div className="sys-vital">
          <span className={`vital-icon ${battery.low ? 'is-bad' : battery.isCharging || battery.isFull ? 'is-good' : ''}`}>
            <BatteryIcon size={15} />
          </span>
          <div>
            <div className="vital-value">
              {battery.hasBattery ? percent(battery.percent) : 'AC'}
              {battery.isCharging ? <span className="vital-tag">充电中</span> : battery.isFull ? <span className="vital-tag">已充满</span> : null}
            </div>
            <div className="vital-label">
              {battery.hasBattery
                ? battery.low
                  ? '电量偏低'
                  : battery.acConnected
                    ? '已连接电源'
                    : '电池供电'
                : '未检测到电池'}
            </div>
          </div>
        </div>
        <div className="sys-vital">
          <span className="vital-icon">
            <Bluetooth size={15} />
          </span>
          <div>
            <div className="vital-value">
              {metrics.bluetooth.length ? metrics.bluetooth[0].name : '—'}
            </div>
            <div className="vital-label">
              {metrics.bluetooth.length
                ? metrics.bluetooth[0].battery !== null
                  ? `设备电量 ${metrics.bluetooth[0].battery}%`
                  : '驱动未上报设备电量'
                : '无已连接蓝牙设备'}
            </div>
          </div>
        </div>
      </div>

      <div className="meter-grid">
        <Meter
          label="CPU"
          icon={<Cpu size={12} />}
          value={metrics.cpu}
          display={`${Math.round(metrics.cpu)}%`}
          tone={metrics.cpu >= 90 ? 'bad' : metrics.cpu >= 75 ? 'warn' : 'accent'}
        />
        <Meter
          label="内存"
          icon={<MemoryStick size={12} />}
          value={metrics.mem.percent}
          display={`${Math.round(metrics.mem.percent)}%`}
          tone={metrics.mem.percent >= 90 ? 'bad' : metrics.mem.percent >= 75 ? 'warn' : 'accent'}
        />
      </div>

      <div className="sys-net">
        <span className="sys-net-item">
          <ArrowDown size={12} />
          {formatSpeed(metrics.net.down)}/s
        </span>
        <span className="sys-net-item">
          <ArrowUp size={12} />
          {formatSpeed(metrics.net.up)}/s
        </span>
        <span className="sys-net-used">
          可用 {formatBytes(metrics.mem.total - metrics.mem.used)} / {formatBytes(metrics.mem.total)}
        </span>
      </div>

      <div className="sys-api">
        <Sparkles size={12} />
        <span>今日 API</span>
        <strong>{metrics.apiUsage.today}</strong>
        <span className="sys-api-detail">
          {Object.entries(metrics.apiUsage.byService).length
            ? Object.entries(metrics.apiUsage.byService)
                .map(([name, count]) => `${name} ${count}`)
                .join(' · ')
            : '尚未发起外部请求'}
        </span>
      </div>
    </section>
  )
}
