import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { app, nativeImage } from 'electron'
import type { ShelfItem } from '@shared/types'
import { JsonStore } from '../lib/json-store'
import { userDataPath } from '../lib/paths'
import { islandWindow } from '../window'

interface ShelfFile {
  items: ShelfItem[]
}

class FileShelfService extends EventEmitter {
  private readonly store = new JsonStore<ShelfFile>(userDataPath('file-shelf.json'), { items: [] })
  private items: ShelfItem[] = (this.store.get().items ?? []).filter((item) => fs.existsSync(item.path))

  list(): ShelfItem[] {
    return [...this.items]
  }

  start(clearOnStart: boolean): void {
    if (clearOnStart) {
      this.items = []
      this.persist()
    }
  }

  async add(paths: string[]): Promise<ShelfItem[]> {
    for (const raw of paths.slice(0, 40)) {
      const file = path.resolve(raw)
      if (!fs.existsSync(file) || this.items.some((item) => item.path === file)) continue
      let isDir = false
      try {
        isDir = fs.statSync(file).isDirectory()
      } catch {
        continue
      }
      let icon: string | null = null
      try {
        const image = await app.getFileIcon(file, { size: 'normal' })
        if (!image.isEmpty()) icon = image.toDataURL()
      } catch {
        /* icon is optional */
      }
      this.items.push({ id: randomUUID(), path: file, name: path.basename(file) || file, isDir, icon })
    }
    this.persist()
    return this.list()
  }

  remove(id: string): ShelfItem[] {
    this.items = this.items.filter((item) => item.id !== id)
    this.persist()
    return this.list()
  }

  clear(): ShelfItem[] {
    this.items = []
    this.persist()
    return this.list()
  }

  dragOut(id: string): void {
    const item = this.items.find((entry) => entry.id === id)
    const win = islandWindow.browserWindow
    if (!item || !win || !fs.existsSync(item.path)) return
    let icon = nativeImage.createEmpty()
    if (item.icon) {
      try {
        icon = nativeImage.createFromDataURL(item.icon)
      } catch {
        /* use empty fallback */
      }
    }
    try {
      win.webContents.startDrag({ file: item.path, icon })
    } catch {
      /* a file may disappear between listing and drag */
    }
  }

  private persist(): void {
    this.store.replace({ items: this.items })
    this.emit('files', this.list())
  }

  flush(): void {
    this.store.flush()
  }
}

export const fileShelfService = new FileShelfService()
