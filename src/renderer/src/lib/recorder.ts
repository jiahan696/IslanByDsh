import { useIsland } from '../store'

interface Region {
  x: number
  y: number
  w: number
  h: number
}

let stream: MediaStream | null = null
let outputStream: MediaStream | null = null
let recorder: MediaRecorder | null = null
let chunks: Blob[] = []
let frameTimer: number | null = null
let videoEl: HTMLVideoElement | null = null

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function startRecording(region?: Region): Promise<string | null> {
  if (recorder) return null
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: true
    })
    let recordStream: MediaStream = stream
    if (region) {
      videoEl = document.createElement('video')
      videoEl.muted = true
      videoEl.playsInline = true
      videoEl.srcObject = stream
      await videoEl.play()
      if (!videoEl.videoWidth) {
        await new Promise<void>((resolve) => {
          videoEl!.onloadedmetadata = () => resolve()
        })
      }
      const scaleX = videoEl.videoWidth / Math.max(1, window.screen.width)
      const scaleY = videoEl.videoHeight / Math.max(1, window.screen.height)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(2, Math.round(region.w * scaleX))
      canvas.height = Math.max(2, Math.round(region.h * scaleY))
      const context = canvas.getContext('2d')
      const draw = (): void => {
        if (!videoEl || !context) return
        context.drawImage(
          videoEl,
          Math.round(region.x * scaleX),
          Math.round(region.y * scaleY),
          Math.round(region.w * scaleX),
          Math.round(region.h * scaleY),
          0,
          0,
          canvas.width,
          canvas.height
        )
        frameTimer = window.requestAnimationFrame(draw)
      }
      draw()
      outputStream = canvas.captureStream(30)
      for (const track of stream.getAudioTracks()) outputStream.addTrack(track)
      recordStream = outputStream
    }
    chunks = []
    recorder = new MediaRecorder(recordStream, {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
    })
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = async () => {
      const current = recorder
      const blob = new Blob(chunks, { type: current?.mimeType || 'video/webm' })
      recorder = null
      if (frameTimer !== null) cancelAnimationFrame(frameTimer)
      frameTimer = null
      outputStream?.getTracks().forEach((track) => track.stop())
      outputStream = null
      stream?.getTracks().forEach((track) => track.stop())
      stream = null
      if (videoEl) {
        videoEl.pause()
        videoEl.srcObject = null
        videoEl = null
      }
      chunks = []
      useIsland.getState().setRecording({ active: false, startedAt: null })
      if (blob.size > 0) {
        try {
          const data = await blobToBase64(blob)
          const result = await window.island.systemSaveRecording(data, current?.mimeType || 'video/webm')
          useIsland.getState().pushToast({
            id: `recording-${Date.now()}`,
            kind: result.ok ? 'info' : 'error',
            text: result.ok ? `录屏已保存：${result.path ?? ''}` : result.message
          })
        } catch {
          useIsland.getState().pushToast({ id: `recording-${Date.now()}`, kind: 'error', text: '录屏保存失败' })
        }
      }
    }
    recorder.start(1000)
    useIsland.getState().setRecording({ active: true, startedAt: Date.now() })
    return null
  } catch (error) {
    if (frameTimer !== null) cancelAnimationFrame(frameTimer)
    frameTimer = null
    outputStream?.getTracks().forEach((track) => track.stop())
    outputStream = null
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
    if (videoEl) {
      videoEl.pause()
      videoEl.srcObject = null
      videoEl = null
    }
    recorder = null
    return error instanceof Error ? error.message : '无法开始录屏'
  }
}

export function stopRecording(): void {
  if (recorder && recorder.state !== 'inactive') recorder.stop()
}

export function recordingActive(): boolean {
  return Boolean(recorder)
}
