import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'

export function IconButton({
  label,
  active,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }): ReactNode {
  return (
    <button
      type="button"
      className={`icon-btn ${active ? 'is-active' : ''} ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  )
}

export function Chip({
  icon,
  children,
  tone = 'default',
  title,
  className = ''
}: {
  icon?: ReactNode
  children: ReactNode
  tone?: 'default' | 'good' | 'warn' | 'bad' | 'accent'
  title?: string
  className?: string
}): ReactNode {
  return (
    <span className={`chip chip-${tone} ${className}`} title={title}>
      {icon ? <span className="chip-icon">{icon}</span> : null}
      <span className="chip-text">{children}</span>
    </span>
  )
}

export function Switch({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}): ReactNode {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md'
}: {
  value: T
  options: Array<{ value: T; label: string; icon?: ReactNode }>
  onChange: (value: T) => void
  size?: 'sm' | 'md'
}): ReactNode {
  return (
    <div className={`segmented segmented-${size}`} role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={`segmented-item ${value === option.value ? 'is-active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Progress({
  value,
  max = 100,
  tone = 'accent',
  className = ''
}: {
  value: number
  max?: number
  tone?: 'accent' | 'good' | 'warn' | 'bad'
  className?: string
}): ReactNode {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <span className={`progress progress-${tone} ${className}`}>
      <span className="progress-fill" style={{ width: `${pct}%` }} />
    </span>
  )
}

export function Meter({
  label,
  value,
  display,
  tone = 'accent',
  icon
}: {
  label: string
  value: number
  display: string
  tone?: 'accent' | 'good' | 'warn' | 'bad'
  icon?: ReactNode
}): ReactNode {
  return (
    <div className="meter">
      <div className="meter-top">
        <span className="meter-label">
          {icon}
          {label}
        </span>
        <span className="meter-value">{display}</span>
      </div>
      <Progress value={value} tone={tone} />
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}): ReactNode {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {description ? <div className="empty-desc">{description}</div> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  )
}

export function Spinner({ label }: { label?: string }): ReactNode {
  return (
    <span className="spinner">
      <Loader2 size={15} className="spin" />
      {label ? <span>{label}</span> : null}
    </span>
  )
}

export function Skeleton({ className = '' }: { className?: string }): ReactNode {
  return <span className={`skeleton ${className}`} />
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 520
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  width?: number
}): ReactNode {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div
      className="modal-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="modal glass"
        data-glass="modal"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <IconButton label="关闭" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body
  )
}
