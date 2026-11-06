import fs from 'node:fs'
import path from 'node:path'
import { userDataPath } from './paths'

const LOG_FILE = () => userDataPath('liquid-island.log')
const MAX_BYTES = 1.5 * 1024 * 1024

function rotateIfNeeded(): void {
  try {
    const stat = fs.statSync(LOG_FILE())
    if (stat.size > MAX_BYTES) fs.renameSync(LOG_FILE(), `${LOG_FILE()}.old`)
  } catch {
    /* no log yet */
  }
}

function write(level: string, args: unknown[]): void {
  const line = `${new Date().toISOString()} [${level}] ${args
    .map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.stack ?? a.message : JSON.stringify(a)))
    .join(' ')}\n`
  try {
    fs.mkdirSync(path.dirname(LOG_FILE()), { recursive: true })
    fs.appendFileSync(LOG_FILE(), line, 'utf8')
  } catch {
    /* logging is best effort */
  }
  if (level === 'ERROR') console.error(line.trimEnd())
  else console.log(line.trimEnd())
}

export const log = {
  info: (...args: unknown[]) => write('INFO', args),
  warn: (...args: unknown[]) => write('WARN', args),
  error: (...args: unknown[]) => write('ERROR', args),
  rotate: rotateIfNeeded
}
