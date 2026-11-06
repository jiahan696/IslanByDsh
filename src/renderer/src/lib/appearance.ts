import type { Settings } from '@shared/types'

type RGB = [number, number, number]

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

function hexToRgb(value: string, fallback: RGB): RGB {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim())
  if (!match) return fallback
  const n = Number.parseInt(match[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgba([r, g, b]: RGB, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`
}

function mix(a: RGB, b: RGB, t: number): RGB {
  const amount = clamp(t, 0, 1)
  return [
    Math.round(a[0] + (b[0] - a[0]) * amount),
    Math.round(a[1] + (b[1] - a[1]) * amount),
    Math.round(a[2] + (b[2] - a[2]) * amount)
  ]
}

/**
 * Applies only the variables owned by the active render mode. The liquid-glass
 * stylesheet is never rewritten; custom-glass values are scoped by
 * `data-custom`, and solid values by `data-render-mode="solid"`.
 */
export function applyAppearance(settings: Settings): void {
  if (!settings || !settings.solidTheme || !settings.glassCustom) return
  const root = document.documentElement
  root.dataset.renderMode = settings.renderMode

  const customGlass = settings.renderMode === 'glass' && settings.theme === 'custom'
  root.dataset.custom = customGlass ? '1' : '0'

  if (customGlass) {
    const custom = settings.glassCustom
    const level = (clamp(custom.contrast, 30, 100) - 30) / 70
    root.style.setProperty('--glass-custom-alpha', String(0.02 + 0.96 * clamp(custom.glassOpacity, 0, 100) / 100))
    root.style.setProperty('--glass-custom-blur', `${clamp(custom.blur, 0, 60)}px`)
    root.style.setProperty('--glass-custom-radius', `${clamp(custom.radius, 12, 60)}px`)
    root.style.setProperty('--glass-custom-border-width', `${clamp(custom.borderWidth, 0, 4)}px`)
    root.style.setProperty('--glass-custom-border-alpha', String(clamp(custom.borderOpacity, 0, 100) / 100))
    root.style.setProperty('--glass-custom-text-1', `rgba(255, 255, 255, ${0.54 + 0.46 * level})`)
    root.style.setProperty('--glass-custom-text-2', `rgba(255, 255, 255, ${0.44 + 0.42 * level})`)
    root.style.setProperty('--glass-custom-text-3', `rgba(255, 255, 255, ${0.36 + 0.36 * level})`)
    root.style.setProperty('--glass-custom-text-4', `rgba(255, 255, 255, ${0.28 + 0.3 * level})`)
    root.style.setProperty('--accent', custom.accent)
    root.style.setProperty('--accent-2', custom.accent)
  } else {
    for (const name of [
      '--glass-custom-alpha',
      '--glass-custom-blur',
      '--glass-custom-radius',
      '--glass-custom-border-width',
      '--glass-custom-border-alpha',
      '--glass-custom-text-1',
      '--glass-custom-text-2',
      '--glass-custom-text-3',
      '--glass-custom-text-4',
      '--accent',
      '--accent-2'
    ]) {
      root.style.removeProperty(name)
    }
  }

  if (settings.renderMode === 'solid') {
    const solid = settings.solidTheme
    const background = hexToRgb(solid.background, [0, 0, 0])
    const textBase = hexToRgb(solid.textColor, [255, 255, 255])
    const contrast = clamp(solid.textContrast, 30, 100) / 100
    // Lower contrast mixes the text toward the selected background; higher
    // contrast keeps the picked text colour. This only feeds solid variables.
    const text = mix(textBase, background, 1 - contrast)
    const alpha = clamp(solid.textOpacity, 0, 100) / 100
    root.style.setProperty('--solid-bg', rgba(background, clamp(solid.backgroundOpacity, 0, 100) / 100))
    root.style.setProperty('--solid-text', rgba(text, alpha))
    root.style.setProperty('--solid-text-2', rgba(text, alpha * 0.72))
    root.style.setProperty('--solid-text-3', rgba(text, alpha * 0.52))
    root.style.setProperty('--solid-text-4', rgba(text, alpha * 0.3))
    root.style.setProperty('--solid-border', rgba(text, Math.max(0.12, alpha * 0.2)))
  } else {
    for (const name of ['--solid-bg', '--solid-text', '--solid-text-2', '--solid-text-3', '--solid-text-4', '--solid-border']) {
      root.style.removeProperty(name)
    }
  }
}
