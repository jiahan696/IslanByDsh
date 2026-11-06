import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

// Establish a stable, product-named data directory before any store is
// constructed. Without this, running `electron out/main/index.js` during
// development would write into %APPDATA%\Electron.
try {
  app.setName('Liquid Island')
  app.setPath('userData', path.join(app.getPath('appData'), 'LiquidIsland'))
} catch {
  /* paths are best effort; Electron still provides defaults */
}

let cachedResourceBase: string | null = null

/** Resolve a bundled resource in dev (repo root) and inside the packaged exe. */
export function resourcePath(...segments: string[]): string {
  if (!cachedResourceBase) {
    const candidates = app.isPackaged
      ? [path.join(process.resourcesPath, 'resources')]
      : [
          path.join(app.getAppPath(), 'resources'),
          path.join(__dirname, '../../resources'),
          path.join(process.cwd(), 'resources')
        ]
    cachedResourceBase = candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[candidates.length - 1]
  }
  return path.join(cachedResourceBase, ...segments)
}

export function userDataPath(...segments: string[]): string {
  return path.join(app.getPath('userData'), ...segments)
}

export function ensureDir(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    /* directory already exists or cannot be created; callers degrade */
  }
}
