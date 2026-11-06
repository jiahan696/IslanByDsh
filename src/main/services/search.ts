import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { SearchResponse, SearchResult, SearchStatus } from '@shared/types'
import { log } from '../lib/logger'

const MAX_ENTRIES = 80_000
const MAX_DEPTH = 7
const MAX_DIRS = 25_000
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '.cache',
  'appdata',
  '$recycle.bin',
  'system volume information',
  'windows',
  'program files',
  'program files (x86)',
  'programdata',
  'recovery',
  'perflogs'
])

interface IndexEntry {
  name: string
  lname: string
  lpath: string
  path: string
  dir: string
  ext: string
  kind: 'file' | 'folder'
}

interface PendingDir {
  dir: string
  depth: number
}

interface StatInfo {
  size: number | null
  mtime: number
  cachedAt: number
}

function scoreEntry(entry: IndexEntry, tokens: string[], rawQuery: string): number {
  let score = 0
  const q = rawQuery.toLowerCase()
  if (entry.lname === q) score += 1200
  else if (entry.lname.startsWith(q)) score += 800
  else if (entry.lname.includes(q)) score += 450

  for (const token of tokens) {
    if (!entry.lname.includes(token)) {
      if (!entry.lpath.includes(token)) return -1
      score += 60
      continue
    }
    if (entry.lname === token) score += 300
    else if (entry.lname.startsWith(token)) score += 220
    else score += 90
  }

  if (entry.kind === 'folder') score -= 20
  score -= Math.min(40, entry.lname.length / 4)
  return score
}

/**
 * fsearch-inspired file index.
 *
 * Strategy: an in-memory filename index built by a bounded breadth-first walk of
 * user-selected roots. The walk stores names/paths only — no per-entry stat —
 * which keeps cold indexing to a fraction of a second for tens of thousands of
 * files. The top candidates are stat'ed lazily to display size/date and to apply
 * a recency boost. Invalidation is event-driven through recursive fs.watch with
 * a 5 s debounce and a 20 s minimum rebuild interval, not a polling timer.
 *
 * Trade-off: memory is proportional to the index (80k entry cap), deep/system
 * trees are skipped, and results are "fast and predictable" rather than
 * exhaustive. See README for the full rationale.
 */
class SearchService extends EventEmitter {
  private entries: IndexEntry[] = []
  private status: SearchStatus = {
    state: 'idle',
    indexed: 0,
    roots: [],
    updatedAt: 0,
    scannedDirs: 0,
    error: null,
    truncated: false
  }
  private roots: string[] = []
  private buildToken = 0
  private building = false
  private watchers: fs.FSWatcher[] = []
  private watchTimer: NodeJS.Timeout | null = null
  private lastBuild = 0
  private dirty = false
  private statCache = new Map<string, StatInfo>()

  start(roots: string[]): void {
    this.roots = roots
    this.setupWatchers()
    void this.build('startup')
  }

  stop(): void {
    this.buildToken += 1
    if (this.watchTimer) clearTimeout(this.watchTimer)
    this.watchTimer = null
    this.teardownWatchers()
  }

  getStatus(): SearchStatus {
    return { ...this.status }
  }

  async setRoots(roots: string[]): Promise<SearchStatus> {
    this.roots = roots
    this.teardownWatchers()
    this.setupWatchers()
    return this.build('roots')
  }

  rebuild(): Promise<SearchStatus> {
    return this.build('manual')
  }

  private teardownWatchers(): void {
    for (const watcher of this.watchers) {
      try {
        watcher.close()
      } catch {
        /* ignore */
      }
    }
    this.watchers = []
  }

  private setupWatchers(): void {
    this.teardownWatchers()
    for (const root of this.roots) {
      try {
        const watcher = fs.watch(root, { recursive: true, persistent: false }, (_event, filename) => {
          if (!filename) return
          this.dirty = true
          if (this.watchTimer) clearTimeout(this.watchTimer)
          this.watchTimer = setTimeout(() => {
            const now = Date.now()
            if (this.building || now - this.lastBuild < 20_000) {
              this.watchTimer = setTimeout(() => void this.build('watch', true), 10_000)
              return
            }
            void this.build('watch', true)
          }, 5000)
        })
        watcher.on('error', () => {
          /* a root can become unavailable; indexing still works on demand */
        })
        this.watchers.push(watcher)
      } catch (error) {
        log.warn(`cannot watch ${root}: ${error instanceof Error ? error.message : error}`)
      }
    }
  }

  private async build(reason: string, quiet = false): Promise<SearchStatus> {
    if (this.building) return this.getStatus()
    const token = ++this.buildToken
    this.building = true
    this.dirty = false
    const started = Date.now()
    if (!quiet) {
      this.status = { ...this.status, state: 'indexing', error: null, roots: [...this.roots] }
      this.emit('status', this.getStatus())
    }

    const nextEntries: IndexEntry[] = []
    const queue: PendingDir[] = this.roots.filter((root) => fs.existsSync(root)).map((dir) => ({ dir, depth: 0 }))
    let scannedDirs = 0
    let truncated = false
    let lastProgress = Date.now()

    try {
      while (queue.length > 0) {
        if (token !== this.buildToken) return this.getStatus()
        const batch = queue.splice(0, 8)
        const results = await Promise.all(
          batch.map(async (item) => {
            try {
              return { item, dirents: await fsp.readdir(item.dir, { withFileTypes: true }) }
            } catch {
              return { item, dirents: [] as fs.Dirent[] }
            }
          })
        )

        for (const { item, dirents } of results) {
          scannedDirs += 1
          if (scannedDirs > MAX_DIRS) {
            truncated = true
            break
          }
          for (const dirent of dirents) {
            if (nextEntries.length >= MAX_ENTRIES) {
              truncated = true
              break
            }
            const name = dirent.name
            if (!name || name.length > 180) continue
            const lower = name.toLowerCase()
            const fullPath = path.join(item.dir, name)
            const isFolder = dirent.isDirectory()
            if (dirent.isSymbolicLink()) continue
            if (isFolder && (SKIP_DIRS.has(lower) || lower.startsWith('.'))) continue
            nextEntries.push({
              name,
              lname: lower,
              lpath: fullPath.toLowerCase(),
              path: fullPath,
              dir: item.dir,
              ext: isFolder ? '' : path.extname(name).slice(1).toLowerCase(),
              kind: isFolder ? 'folder' : 'file'
            })
            if (isFolder && item.depth < MAX_DEPTH) {
              queue.push({ dir: fullPath, depth: item.depth + 1 })
            }
          }
          if (truncated) break
        }

        if (!quiet && Date.now() - lastProgress > 350) {
          lastProgress = Date.now()
          this.status = {
            ...this.status,
            state: 'indexing',
            indexed: nextEntries.length,
            scannedDirs,
            updatedAt: Date.now()
          }
          this.emit('status', this.getStatus())
        }
        await new Promise((resolve) => setImmediate(resolve))
        if (truncated) break
      }

      if (token !== this.buildToken) return this.getStatus()
      this.entries = nextEntries
      this.statCache.clear()
      this.lastBuild = Date.now()
      this.status = {
        state: 'ready',
        indexed: nextEntries.length,
        roots: [...this.roots],
        updatedAt: this.lastBuild,
        scannedDirs,
        error: null,
        truncated
      }
      log.info(
        `file index ready (${reason}): ${nextEntries.length} entries in ${scannedDirs} dirs, ${Date.now() - started} ms${
          truncated ? ' [truncated]' : ''
        }`
      )
      this.emit('status', this.getStatus())
      return this.getStatus()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.status = { ...this.status, state: 'error', error: message }
      this.emit('status', this.getStatus())
      log.error('file index failed', message)
      return this.getStatus()
    } finally {
      this.building = false
      if (this.dirty) {
        if (this.watchTimer) clearTimeout(this.watchTimer)
        this.watchTimer = setTimeout(() => void this.build('watch', true), 8000)
      }
    }
  }

  private async statOf(entryPath: string): Promise<StatInfo> {
    const cached = this.statCache.get(entryPath)
    if (cached && Date.now() - cached.cachedAt < 60_000) return cached
    try {
      const stat = await fsp.lstat(entryPath)
      const info: StatInfo = {
        size: stat.isDirectory() ? null : stat.size,
        mtime: stat.mtimeMs,
        cachedAt: Date.now()
      }
      this.statCache.set(entryPath, info)
      return info
    } catch {
      return { size: null, mtime: 0, cachedAt: Date.now() }
    }
  }

  async query(rawQuery: string): Promise<SearchResponse> {
    const started = performance.now()
    const query = rawQuery.trim()
    if (!query) return { query, results: [], tookMs: 0, totalMatched: 0 }
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
    const matches: Array<{ entry: IndexEntry; score: number }> = []

    for (const entry of this.entries) {
      const score = scoreEntry(entry, tokens, query)
      if (score < 0) continue
      matches.push({ entry, score })
    }

    matches.sort((a, b) => b.score - a.score)
    const candidates = matches.slice(0, 220)
    const enriched = await Promise.all(
      candidates.map(async (match) => {
        const info = await this.statOf(match.entry.path)
        const ageDays = info.mtime > 0 ? (Date.now() - info.mtime) / 86_400_000 : 999
        const recency = ageDays < 1 ? 45 : ageDays < 7 ? 25 : ageDays < 30 ? 10 : 0
        return { ...match, info, score: match.score + recency }
      })
    )
    enriched.sort((a, b) => b.score - a.score || b.info.mtime - a.info.mtime)
    const results: SearchResult[] = enriched.slice(0, 80).map(({ entry, info, score }) => ({
      path: entry.path,
      name: entry.name,
      dir: entry.dir,
      ext: entry.ext,
      kind: entry.kind,
      size: info.size,
      mtime: info.mtime,
      score
    }))

    if (this.statCache.size > 2500) this.statCache.clear()

    return {
      query,
      results,
      tookMs: Math.round((performance.now() - started) * 10) / 10,
      totalMatched: matches.length
    }
  }
}

export const searchService = new SearchService()
