import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { BluetoothDevice } from '@shared/types'
import { resourcePath } from '../lib/paths'
import { runPowerShell } from '../lib/ps'
import { log } from '../lib/logger'

const POLL_MS = 45_000

function normalizeDevice(raw: any): BluetoothDevice | null {
  if (!raw || typeof raw.name !== 'string' || !raw.name.trim()) return null
  const batteryRaw = Number(raw.battery)
  const battery = Number.isFinite(batteryRaw) && batteryRaw >= 0 && batteryRaw <= 100 ? Math.round(batteryRaw) : null
  const kind = ['audio', 'input', 'phone', 'other'].includes(raw.kind) ? raw.kind : 'other'
  return {
    id: String(raw.id ?? raw.name),
    name: raw.name.trim(),
    kind,
    battery,
    connected: true
  }
}

/**
 * Bluetooth battery is driver-dependent on Windows. This service polls PnP
 * every 45 s and returns `battery: null` when the peripheral/driver does not
 * publish a level; the UI renders that as "电量未上报" instead of inventing one.
 */
class BluetoothService extends EventEmitter {
  private devices: BluetoothDevice[] = []
  private timer: NodeJS.Timeout | null = null
  private inFlight = false

  start(): void {
    void this.refresh()
    this.timer = setInterval(() => void this.refresh(), POLL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  get(): BluetoothDevice[] {
    return this.devices
  }

  async refresh(): Promise<BluetoothDevice[]> {
    if (this.inFlight) return this.devices
    this.inFlight = true
    const outFile = path.join(os.tmpdir(), `liquid-island-bt-${process.pid}.json`)
    try {
      const result = await runPowerShell(
        resourcePath('ps', 'bluetooth.ps1'),
        ['-OutFile', outFile],
        { timeoutMs: 25000 }
      )
      if (!result.ok) throw new Error(result.stderr || 'bluetooth query failed')
      const payload = JSON.parse(fs.readFileSync(outFile, 'utf8')) as { devices?: unknown[] }
      const next = (payload.devices ?? []).map(normalizeDevice).filter((d): d is BluetoothDevice => Boolean(d))
      const changed = JSON.stringify(next) !== JSON.stringify(this.devices)
      this.devices = next
      if (changed) this.emit('changed', next)
      return next
    } catch (error) {
      log.warn('bluetooth refresh failed', error instanceof Error ? error.message : error)
      if (this.devices.length > 0) {
        this.devices = []
        this.emit('changed', this.devices)
      }
      return this.devices
    } finally {
      this.inFlight = false
      try {
        fs.unlinkSync(outFile)
      } catch {
        /* nothing to clean */
      }
    }
  }
}

export const bluetoothService = new BluetoothService()
