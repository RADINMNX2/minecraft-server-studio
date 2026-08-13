import { useRef, type MouseEvent as ReactMouseEvent } from 'react'
import type { ServerInfo, ServerStatus } from '../../../shared/types'
import { Icon } from './Icon'

interface Props {
  s: ServerInfo
  onOpen: () => void
  onStart: () => void
  onStop: () => void
  onDelete: () => void
}

const loaderMeta: Record<string, { label: string; cls: string }> = {
  vanilla: { label: 'Vanilla', cls: 'lv-green' },
  paper: { label: 'Paper', cls: 'lv-blue' },
  purpur: { label: 'Purpur', cls: 'lv-purple' },
  folia: { label: 'Folia', cls: 'lv-red' },
  fabric: { label: 'Fabric', cls: 'lv-orange' },
  quilt: { label: 'Quilt', cls: 'lv-teal' },
  neoforge: { label: 'NeoForge', cls: 'lv-orange' },
  forge: { label: 'Forge', cls: 'lv-amber' },
}

const statusMeta: Record<ServerStatus, { text: string; cls: string }> = {
  running: { text: 'در حال اجرا', cls: 'on' },
  starting: { text: 'در حال آماده‌سازی', cls: 'busy' },
  stopping: { text: 'در حال توقف', cls: 'busy' },
  stopped: { text: 'خاموش', cls: 'off' },
  error: { text: 'خطا', cls: 'error' },
}

export function ServerCard({ s, onOpen, onStart, onStop, onDelete }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const st = statusMeta[s.status] || statusMeta.stopped
  const loader = loaderMeta[s.loader] || { label: s.loader, cls: '' }
  const running = s.status === 'running'

  const onMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    const el = cardRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  return (
    <div className="server-card" ref={cardRef} onMouseMove={onMove} onClick={onOpen}>
      <div className="sc-glow" />
      <div className="sc-head">
        <div className="sc-icon-wrap">
          {s.icon ? (
            <img className="sc-icon" src={s.icon} alt={s.name} loading="lazy" decoding="async" />
          ) : (
            <div className="sc-icon fallback">{s.name.slice(0, 1).toUpperCase()}</div>
          )}
          <span className={`status-dot ${st.cls}`} />
        </div>
        <div className="sc-title">
          <div className="sc-name-row">
            <h3>{s.name}</h3>
            <span className={`loader-tag ${loader.cls}`}>{loader.label}</span>
          </div>
          <div className="sc-sub">
            <Icon name="globe" size={12} /> {s.version}
          </div>
        </div>
        <div className="sc-menu">
          <button
            className="icon-btn danger"
            title="حذف سرور"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
          >
            <Icon name="trash" size={15} />
          </button>
        </div>
      </div>

      <div className="sc-info">
        <div className="sc-stat">
          <Icon name="activity" size={13} className="ico online" />
          <div>
            <b>
              {s.players.online}/{s.players.max}
            </b>
            <span>بازیکن</span>
          </div>
        </div>
        <div className="sc-stat">
          <Icon name="memory" size={13} className="ico mem" />
          <div>
            <b>{s.ramMb} MB</b>
            <span>رم</span>
          </div>
        </div>
        <div className="sc-stat">
          <Icon name="wifi" size={13} className="ico net" />
          <div>
            <b>{s.port}</b>
            <span>پورت</span>
          </div>
        </div>
      </div>

      <div className="sc-footer">
        <span className={`status-pill ${st.cls}`}>
          <span className={`status-dot ${st.cls}`} />
          {st.text}
        </span>
        <div className="sc-actions">
          {running ? (
            <button
              className="btn sm danger"
              title="توقف"
              onClick={(e) => {
                e.stopPropagation()
                onStop()
              }}
            >
              <Icon name="square" size={12} />
            </button>
          ) : (
            <button
              className="btn sm good"
              title="شروع"
              onClick={(e) => {
                e.stopPropagation()
                onStart()
              }}
            >
              <Icon name="play" size={12} />
            </button>
          )}
          <button
            className="btn sm"
            title="باز کردن"
            onClick={(e) => {
              e.stopPropagation()
              onOpen()
            }}
          >
            <Icon name="arrowRight" size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
