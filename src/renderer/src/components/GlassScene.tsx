import type { ReactNode } from 'react'
import { useIsland } from '../store'

/**
 * Real desktop backdrop for a single glass surface.
 *
 * The captured frame is a full-screen image positioned at (-x, -y) relative to
 * the glass element, then clipped by its rounded parent. This is what CSS
 * backdrop-filter alone cannot do in a transparent Electron window: it gives the
 * panel genuine refracted desktop pixels without blurring the rest of the screen.
 */
export function GlassScene({ x, y }: { x: number; y: number }): ReactNode {
  const backdrop = useIsland((state) => state.backdrop)
  if (!backdrop) return <span className="glass-scene-fallback" aria-hidden />
  return (
    <img
      className="glass-scene"
      src={backdrop.url}
      alt=""
      draggable={false}
      style={{ left: `${-x}px`, top: `${-y}px` }}
    />
  )
}
