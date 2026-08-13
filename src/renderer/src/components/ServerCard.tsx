import type { ServerInfo } from '../../../shared/types'
import { AddressChip } from './AddressChip'

interface Props {
  s: ServerInfo
  onOpen: () => void
  onStart: () => void
  onStop: () => void
  onDelete: () => void
}

function statusLabel(st: string) {
  switch (st) {
    case 'running':
      return { text: 'در حال اجرا', cls: 'on' }
    case 'starting':
      return { text: 'در حال آماده‌سازی', cls: 'busy' }
    case 'stopping':
      return { text: 'در حال توقف', cls: 'busy' }
    default:
      return { text: 'خاموش', cls: 'off' }
  }
}

function displayLoader(l: string) {
  const map: Record<string, string> = {
    vanilla: 'Vanilla',
    paper: 'Paper',
    purpur: 'Purpur',
    folia: 'Folia',
    fabric: 'Fabric',
    quilt: 'Quilt',
    neoforge: 'NeoForge',
    forge: 'Forge',
  }
  return map[l] || l
}

export function ServerCard({ s, onOpen, onStart, onStop, onDelete }: Props) {
  const st = statusLabel(s.status)
  const running = s.status === 'running'
  return (
    <div className="server-card">
      <div className="card-icon-wrap" onClick={onOpen}>
        {s.icon ? (
          <img className="card-icon" src={s.icon} alt={s.name} />
        ) : (
          <div className="card-icon fallback">{s.name.slice(0, 1).toUpperCase()}</div>
        )}
        <span className={`status-badge ${st.cls}`}>{st.text}</span>
      </div>

      <div className="card-body" onClick={onOpen}>
        <div className="card-title-row">
          <h3>{s.name}</h3>
          <span className="loader-tag">{displayLoader(s.loader)}</span>
        </div>
        <p className="card-motd">{s.motd || 'بدون پیام'}</p>
        <div className="card-addr">
          <AddressChip value={`localhost:${s.port}`} />
          <span className="card-version">v{s.version}</span>
        </div>
      </div>

      <div className="card-actions">
        {running ? (
          <button className="btn sm danger" onClick={onStop} title="توقف">
            ✕
          </button>
        ) : (
          <button className="btn sm good" onClick={onStart} title="شروع">
            ▶
          </button>
        )}
        <button className="btn sm ghost" onClick={onDelete} title="حذف">
          🗑
        </button>
      </div>
    </div>
  )
}
