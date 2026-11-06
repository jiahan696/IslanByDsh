import type { LyricLine } from './types'

/**
 * Parse an LRC file into a sorted, de-duplicated list of timed lines.
 * Supports [mm:ss], [mm:ss.xx], [mm:ss.xxx], multiple timestamps per line and
 * the global [offset:...] tag. Metadata-only lines are ignored.
 */
export function parseLrc(text: string): LyricLine[] {
  if (!text) return []
  const lines: LyricLine[] = []
  let offsetMs = 0
  const offsetMatch = text.match(/\[offset:\s*(-?\d+)\]/i)
  if (offsetMatch) offsetMs = Number(offsetMatch[1]) || 0

  for (const rawLine of text.split(/\r?\n/)) {
    const tags = [...rawLine.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
    if (tags.length === 0) continue
    const content = rawLine.replace(/\[[^\]]*\]/g, '').trim()
    if (!content) continue
    for (const tag of tags) {
      const minutes = Number(tag[1])
      const seconds = Number(tag[2])
      const fractionRaw = tag[3] ?? '0'
      const fraction = Number(fractionRaw.padEnd(3, '0').slice(0, 3))
      const time = (minutes * 60 + seconds + fraction / 1000) * 1000 + offsetMs
      if (Number.isFinite(time) && time >= 0) lines.push({ time: Math.max(0, time), text: content })
    }
  }

  lines.sort((a, b) => a.time - b.time)
  const deduped: LyricLine[] = []
  for (const line of lines) {
    const prev = deduped[deduped.length - 1]
    if (prev && prev.time === line.time && prev.text === line.text) continue
    deduped.push(line)
  }
  return deduped.slice(0, 800)
}
