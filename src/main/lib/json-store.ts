import fs from 'node:fs'
import path from 'node:path'
import { ensureDir } from './paths'

/**
 * Small, dependency-free JSON store.
 * Writes are debounced (250 ms) and atomic (tmp file + rename) so a crash or a
 * stuck uninstaller cannot leave a half-written settings file behind.
 */
export class JsonStore<T extends object> {
  private data: T
  private timer: NodeJS.Timeout | null = null
  private readonly file: string
  private readonly defaults: T

  constructor(file: string, defaults: T) {
    this.file = file
    this.defaults = defaults
    this.data = this.load()
  }

  private load(): T {
    try {
      ensureDir(path.dirname(this.file))
      if (!fs.existsSync(this.file)) return { ...this.defaults }
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Record<string, unknown>
      return { ...this.defaults, ...raw } as T
    } catch {
      return { ...this.defaults }
    }
  }

  get(): T {
    return this.data
  }

  set(patch: Partial<T>): T {
    this.data = { ...this.data, ...patch }
    this.schedule()
    return this.data
  }

  replace(next: T): T {
    this.data = next
    this.schedule()
    return this.data
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 250)
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    try {
      ensureDir(path.dirname(this.file))
      const tmp = `${this.file}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8')
      fs.renameSync(tmp, this.file)
    } catch {
      /* a failing cache write must never take the widget down */
    }
  }
}
