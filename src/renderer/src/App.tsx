import { useEffect, useState, type ReactNode } from 'react'
import { useIsland } from './store'
import { Capsule } from './components/Capsule'
import { Panel } from './components/Panel'
import { GlassFilters } from './components/GlassFilters'
import { Toasts } from './components/Toasts'
import { applyAppearance } from './lib/appearance'

export default function App(): ReactNode {
  const mode = useIsland((state) => state.mode)
  const theme = useIsland((state) => state.theme)
  const settings = useIsland((state) => state.settings)
  const timers = useIsland((state) => state.timers)
  const reduceMotion = useIsland((state) => state.settings.reduceMotion)
  const [panelVisible, setPanelVisible] = useState(false)

  useEffect(() => {
    const onDragOver = (event: DragEvent): void => {
      if (!event.dataTransfer?.types.includes('Files')) return
      if (!useIsland.getState().settings.tools.fileShelf) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (event: DragEvent): void => {
      if (!event.dataTransfer?.files.length) return
      if (!useIsland.getState().settings.tools.fileShelf) return
      event.preventDefault()
      const paths = Array.from(event.dataTransfer.files)
        .map((file) => window.island.getPathForFile(file))
        .filter(Boolean)
      if (!paths.length) return
      void window.island.filesAdd(paths).then((items) => useIsland.getState().setFiles(items))
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  useEffect(() => {
    const api = window.island
    const store = useIsland.getState()
    let disposed = false

    const unsubscribers = [
      api.onMode((next) => store.setMode(next)),
      api.onMetrics((metrics) => store.setMetrics(metrics)),
      api.onMedia((media) => store.setMedia(media)),
      api.onNotifications((state) => store.setNotifications(state)),
      api.onTimers((state) => store.setTimers(state)),
      api.onSearchStatus((state) => store.setSearchStatus(state)),
      api.onApps((state) => store.setApps(state)),
      api.onWeather((state) => store.setWeather(state)),
      api.onClipboard((items) => store.setClipboard(items)),
      api.onSystem((state) => store.setSystem(state)),
      api.onFiles((items) => store.setFiles(items)),
      api.onTheme((next) => store.setTheme(next)),
      api.onSettings((settings) => store.setSettings(settings)),
      api.onPanelClose(() => setPanelVisible(false)),
      api.onBackdrop((frame) => store.setBackdrop(frame)),
      api.onToast((toast) => store.pushToast(toast))
    ]

    void api
      .bootstrap()
      .then((bootstrap) => {
        if (!disposed) store.hydrate(bootstrap)
      })
      .catch((error: unknown) => {
        store.pushToast({
          id: 'bootstrap-error',
          kind: 'error',
          text: error instanceof Error ? error.message : '初始化失败'
        })
      })

    return () => {
      disposed = true
      for (const unsubscribe of unsubscribers) unsubscribe()
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.motion = reduceMotion ? 'reduced' : 'full'
    document.documentElement.style.colorScheme = theme
  }, [theme, reduceMotion])

  useEffect(() => {
    try {
      applyAppearance(settings)
    } catch (error) {
      // Appearance is a visual layer; a bad theme value must never tear down
      // the whole island or close the window.
      console.error('appearance update failed', error)
    }
  }, [settings])

  const alertSound =
    Boolean(timers.firingAlarm) ||
    timers.firingTodo?.reminderKind === 'alarm' ||
    timers.firingCountdown?.reminderKind === 'alarm'

  useEffect(() => {
    if (!alertSound) return
    let context: AudioContext | null = null
    let disposed = false
    let interval = 0
    const beep = (): void => {
      if (disposed) return
      try {
        if (!context) {
          const Ctor =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
          if (!Ctor) return
          context = new Ctor()
        }
        void context.resume().catch(() => undefined)
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.value = 880
        gain.gain.setValueAtTime(0.0001, context.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.4)
        oscillator.connect(gain)
        gain.connect(context.destination)
        oscillator.start()
        oscillator.stop(context.currentTime + 0.42)
      } catch {
        /* audio output can be unavailable (RDP / muted device) */
      }
    }
    beep()
    interval = window.setInterval(beep, 1400)
    return () => {
      disposed = true
      window.clearInterval(interval)
      void context?.close().catch(() => undefined)
    }
  }, [alertSound])

  useEffect(() => {
    if (mode === 'expanded') setPanelVisible(true)
  }, [mode])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && document.querySelector('.modal-backdrop')) return
      if (event.key === 'Escape' && useIsland.getState().mode === 'expanded') {
        event.preventDefault()
        void window.island.collapse()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && useIsland.getState().mode === 'expanded') {
        event.preventDefault()
        useIsland.getState().requestSearchFocus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div
      className="stage"
      onPointerDown={(event) => {
        const target = event.target as HTMLElement
        if (
          target.closest('[data-glass]') ||
          target.closest('.modal-backdrop') ||
          target.closest('.modal') ||
          target.closest('.toast-stack')
        ) {
          return
        }
        if (useIsland.getState().mode === 'expanded') void window.island.collapse()
      }}
    >
      <GlassFilters />
      <Capsule />
      {panelVisible ? <Panel closing={mode !== 'expanded'} /> : null}
      <Toasts />
    </div>
  )
}
