import type { ReactNode } from 'react'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'
import { useIsland } from '../store'

export function Toasts(): ReactNode {
  const toasts = useIsland((state) => state.toasts)
  const dismiss = useIsland((state) => state.dismissToast)
  if (!toasts.length) return null
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div className={`toast ${toast.kind}`} key={toast.id}>
          {toast.kind === 'error' ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
          <span>{toast.text}</span>
          <button type="button" aria-label="关闭提示" onClick={() => dismiss(toast.id)}>
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
