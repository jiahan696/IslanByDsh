import { useEffect, useRef, useState } from 'react'
import type { MediaState } from '@shared/types'

/** Local clock that re-renders at a fixed cadence. */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

/**
 * Playback position without extra system calls: anchor on the last SMTC sample
 * and advance with the local clock while playing. The main process resamples
 * every ~900-1000 ms; `cadence` only controls how often React repaints.
 */
export function usePlaybackPosition(media: MediaState, cadence = 400): number {
  const [position, setPosition] = useState(media.positionMs)
  const anchor = useRef({ base: media.positionMs, at: media.updatedAt, playing: media.playing })

  useEffect(() => {
    anchor.current = { base: media.positionMs, at: media.updatedAt, playing: media.playing }
    setPosition(media.positionMs)
  }, [media.positionMs, media.updatedAt, media.playing])

  useEffect(() => {
    if (!media.playing) return
    const timer = setInterval(() => {
      const { base, at, playing } = anchor.current
      const next = playing ? base + (Date.now() - at) : base
      setPosition(Math.min(next, media.durationMs > 0 ? media.durationMs : next))
    }, cadence)
    return () => clearInterval(timer)
  }, [media.playing, media.durationMs, cadence])

  return position
}

/** Persist a value with a debounce; used for search input. */
export function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width)
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}
