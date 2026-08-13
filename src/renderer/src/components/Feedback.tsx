import type { CSSProperties } from 'react'
import type { ToastMsg } from '../../../shared/types'
import { Icon, type IconName } from './Icon'

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg className={'spinner' + (className ? ' ' + className : '')} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={'skeleton' + (className ? ' ' + className : '')} style={style} />
}

const toastIcon: Record<string, IconName> = {
  success: 'check-circle',
  error: 'alert',
  warn: 'alert',
  info: 'info',
}

export function Toast({ t, onDismiss }: { t: ToastMsg; onDismiss: (id: number) => void }) {
  return (
    <div className={`toast toast-${t.kind}`} onClick={() => onDismiss(t.id)}>
      <span className="toast-icon">
        <Icon name={toastIcon[t.kind] || 'info'} size={17} />
      </span>
      <span className="toast-text">{t.text}</span>
      <button className="toast-close">
        <Icon name="x" size={13} />
      </button>
    </div>
  )
}

export function ProgressToast({
  progress,
}: {
  progress: { phase: string; percent: number } | null
}) {
  if (!progress) return null
  return (
    <div className="progress-toast">
      <div className="progress-toast-head">
        <span className="progress-toast-title">
          <Spinner size={14} /> {progress.phase}
        </span>
        <span className="progress-toast-pct">{progress.percent}%</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
      </div>
    </div>
  )
}
