import { useIsland } from '../store'

let stream: MediaStream | null = null
let recorder: MediaRecorder | null = null
let chunks: Blob[] = []

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

export async function startRecording(): Promise<string | null> {
  if (recorder) return null
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: true
    })
    chunks = []
    recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' })
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: recorder?.mimeType || 'video/webm' })
      const current = recorder
      recorder = null
      stream?.getTracks().forEach((track) => track.stop())
      stream = null
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
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
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
