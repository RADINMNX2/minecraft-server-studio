import type { ServerInfo } from '../../../shared/types'

const STATUS_LABEL: Record<string, string> = {
  running: 'در حال اجرا',
  stopped: 'متوقف',
  starting: 'در حال شروع',
  stopping: 'در حال توقف',
  error: 'خطا',
}

export function ServerCard({
  s,
  onOpen,
  onStart,
  onStop,
  onDelete,
}: {
  s: ServerInfo
  onOpen: () => void
  onStart: () => void
  onStop: () => void
  onDelete: () => void
}) {
  const running = s.status === 'running'
  return (
    <div className="panel card">
      <div className="top">
        <div>
          <h3>{s.name}</h3>
          <div className="sub">
            {s.loader} · {s.version} · پورت {s.port}
          </div>
        </div>
        <span className="badge">{s.loader}</span>
      </div>

      <div className="stats">
        <div>
          <b>
            <span className={'status-dot status-' + s.status} />
            {STATUS_LABEL[s.status] || s.status}
          </b>
          وضعیت
        </div>
        <div>
          <b>
            {s.players_online}/{s.players_max}
          </b>
          بازیکنان
        </div>
        <div>
          <b>{s.ram_mb}MB</b>
          رم
        </div>
      </div>

      <div className="actions">
        <button className="btn primary sm" onClick={onOpen}>
          باز کردن
        </button>
        {running ? (
          <button className="btn danger sm" onClick={onStop}>
            توقف
          </button>
        ) : (
          <button className="btn good sm" onClick={onStart}>
            شروع
          </button>
        )}
        <button className="btn sm" onClick={onDelete} style={{ marginInlineStart: 'auto' }}>
          حذف
        </button>
      </div>
    </div>
  )
}
