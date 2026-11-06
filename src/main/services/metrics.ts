import { EventEmitter } from 'node:events'
import os from 'node:os'
import si from 'systeminformation'
import type { BatteryInfo, NetworkInfo, SystemMetrics } from '@shared/types'
import { apiUsageService } from './api-usage'
import { bluetoothService } from './bluetooth'
import { log } from '../lib/logger'

const TICK_MS = 1000
const NET_MS = 3000
const BATTERY_MS = 5000

const EMPTY_BATTERY: BatteryInfo = {
  hasBattery: false,
  percent: null,
  isCharging: false,
  acConnected: true,
  isFull: false,
  low: false
}

/**
 * Aggregated system metrics.
 * Cadences are intentionally split: CPU/RAM at 1 s, network at 3 s, battery at
 * 5 s. Bluetooth is owned by its own 45 s service. Nothing polls while the
 * machine is suspended or the session is locked.
 */
class MetricsService extends EventEmitter {
  private cpu = 0
  private mem = { used: 0, total: os.totalmem(), percent: 0 }
  private net: NetworkInfo = { down: 0, up: 0, iface: null }
  private battery: BatteryInfo = { ...EMPTY_BATTERY }
  private timer: NodeJS.Timeout | null = null
  private netTimer: NodeJS.Timeout | null = null
  private batteryTimer: NodeJS.Timeout | null = null
  private suspended = false
  private running = false
  private last: SystemMetrics | null = null
  private attached = false

  start(): void {
    if (this.running) return
    this.running = true
    this.suspended = false
    if (!this.attached) {
      bluetoothService.on('changed', this.onBluetoothChanged)
      this.attached = true
    }
    this.createTimers()
    void this.refreshFast()
    void this.refreshSlow()
    void this.refreshNet()
  }

  stop(): void {
    this.running = false
    this.clearTimers()
    if (this.attached) {
      bluetoothService.off('changed', this.onBluetoothChanged)
      this.attached = false
    }
  }

  setSuspended(suspended: boolean): void {
    this.suspended = suspended
    if (suspended) {
      this.clearTimers()
    } else if (this.running) {
      this.createTimers()
      void this.refreshFast()
      void this.refreshSlow()
      void this.refreshNet()
    }
  }

  private createTimers(): void {
    this.clearTimers()
    if (this.suspended) return
    this.timer = setInterval(() => void this.refreshFast(), TICK_MS)
    this.netTimer = setInterval(() => void this.refreshNet(), NET_MS)
    this.batteryTimer = setInterval(() => void this.refreshSlow(), BATTERY_MS)
  }

  private clearTimers(): void {
    if (this.timer) clearInterval(this.timer)
    if (this.netTimer) clearInterval(this.netTimer)
    if (this.batteryTimer) clearInterval(this.batteryTimer)
    this.timer = null
    this.netTimer = null
    this.batteryTimer = null
  }

  private onBluetoothChanged = (): void => {
    this.emitSnapshot()
  }

  private refreshFast = async (): Promise<void> => {
    if (this.suspended) return
    try {
      const [load, mem] = await Promise.all([si.currentLoad(), si.mem()])
      this.cpu = Number.isFinite(load.currentLoad) ? Math.max(0, Math.min(100, load.currentLoad)) : this.cpu
      const used = Math.max(0, mem.total - mem.available)
      this.mem = {
        used,
        total: mem.total,
        percent: mem.total > 0 ? (used / mem.total) * 100 : 0
      }
    } catch (error) {
      log.warn('metrics fast refresh failed', error instanceof Error ? error.message : error)
    }
    this.emitSnapshot()
  }

  private refreshNet = async (): Promise<void> => {
    if (this.suspended) return
    try {
      const stats = await si.networkStats()
      let down = 0
      let up = 0
      for (const iface of stats) {
        if (!iface || iface.iface === 'Loopback' || iface.operstate === 'down') continue
        if (Number.isFinite(iface.rx_sec) && iface.rx_sec > 0) down += iface.rx_sec
        if (Number.isFinite(iface.tx_sec) && iface.tx_sec > 0) up += iface.tx_sec
      }
      this.net = { down, up, iface: stats.find((s) => s.operstate === 'up')?.iface ?? null }
      this.emitSnapshot()
    } catch (error) {
      log.warn('network refresh failed', error instanceof Error ? error.message : error)
    }
  }

  private refreshSlow = async (): Promise<void> => {
    if (this.suspended) return
    try {
      const battery = await si.battery()
      if (!battery.hasBattery) {
        this.battery = { ...EMPTY_BATTERY }
      } else {
        const percent =
          typeof battery.percent === 'number' ? Math.max(0, Math.min(100, Math.round(battery.percent))) : null
        const acConnected = Boolean(battery.acConnected)
        this.battery = {
          hasBattery: true,
          percent,
          isCharging: Boolean(battery.isCharging),
          acConnected,
          isFull: acConnected && percent !== null && percent >= 99,
          low: percent !== null && percent <= 20 && !battery.isCharging
        }
      }
    } catch (error) {
      log.warn('battery refresh failed', error instanceof Error ? error.message : error)
    }
    this.emitSnapshot()
  }

  private emitSnapshot(): void {
    const snapshot: SystemMetrics = {
      ts: Date.now(),
      battery: this.battery,
      bluetooth: bluetoothService.get(),
      cpu: this.cpu,
      mem: this.mem,
      net: this.net,
      apiUsage: apiUsageService.snapshot(),
      uptimeSec: os.uptime()
    }
    this.last = snapshot
    this.emit('metrics', snapshot)
  }

  latest(): SystemMetrics {
    return (
      this.last ?? {
        ts: Date.now(),
        battery: this.battery,
        bluetooth: [],
        cpu: this.cpu,
        mem: this.mem,
        net: this.net,
        apiUsage: apiUsageService.snapshot(),
        uptimeSec: os.uptime()
      }
    )
  }
}

export const metricsService = new MetricsService()
