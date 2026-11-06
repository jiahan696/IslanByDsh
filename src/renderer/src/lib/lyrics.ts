import type { LyricLine } from '@shared/types'

/** Return the index of the lyric line active at `positionMs`, or -1. */
export function activeLineIndex(lines: LyricLine[], positionMs: number): number {
  if (!lines.length) return -1
  let low = 0
  let high = lines.length - 1
  let result = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (lines[mid].time <= positionMs) {
      result = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return result
}

export function currentLyric(lines: LyricLine[], positionMs: number): string {
  const index = activeLineIndex(lines, positionMs)
  return index >= 0 ? lines[index].text : ''
}

export function lyricWindow(lines: LyricLine[], positionMs: number, before = 2, after = 3): LyricLine[] {
  const index = activeLineIndex(lines, positionMs)
  const start = Math.max(0, index - before)
  return lines.slice(start, index + after + 1)
}
