import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Single-line text that only starts scrolling when it actually overflows.
 * Keeps the capsule calm for short titles and pauses with the rest of the
 * collapsed-state animation when the panel is open.
 */
export function ScrollingText({
  text,
  className = '',
  paused = false
}: {
  text: string
  className?: string
  paused?: boolean
}): ReactNode {
  const boxRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState(0)

  useLayoutEffect(() => {
    const box = boxRef.current
    const inner = innerRef.current
    if (!box || !inner) return
    const measure = (): void => {
      setShift(Math.max(0, inner.scrollWidth - box.clientWidth))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return () => observer.disconnect()
  }, [text])

  const scrolling = shift > 10 && !paused
  return (
    <div ref={boxRef} className={`scroller ${className} ${scrolling ? 'is-scrolling' : ''}`}>
      <span
        ref={innerRef}
        style={
          scrolling
            ? ({
                '--shift': `-${shift}px`,
                animationDuration: `${Math.max(9, Math.min(28, shift / 18 + 7))}s`
              } as React.CSSProperties)
            : undefined
        }
      >
        {text}
      </span>
    </div>
  )
}
