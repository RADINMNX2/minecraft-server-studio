import type { ServerInfo, LoaderMeta } from '../../../shared/types'
import { ServerCard } from '../components/ServerCard'

export function Dashboard({
  servers,
  loaders,
  progress,
  onNew,
  onOpen,
  onStart,
  onStop,
  onDelete,
}: {
  servers: ServerInfo[]
  loaders: LoaderMeta[]
  progress: { phase: string; percent: number } | null
  onNew: () => void
  onOpen: (id: string) => void
  onStart: (id: string) => void
  onStop: (id: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>داشبورد</h1>
          <p>{servers.length} سرور · {loaders.length} لودر پشتیبانی شده</p>
        </div>
        <button className="btn primary" onClick={onNew}>
          ＋ سرور جدید
        </button>
      </div>

      {progress && (
        <div className="panel card" style={{ marginBottom: 16 }}>
          <div className="flex between">
            <span>{progress.phase}</span>
            <span className="tag">{progress.percent}%</span>
          </div>
          <div className="progress" style={{ marginTop: 8 }}>
            <div style={{ width: progress.percent + '%' }} />
          </div>
        </div>
      )}

      {servers.length === 0 ? (
        <div className="empty">
          <div className="big">⛏️</div>
          <h3>هنوز سروری نداری</h3>
          <p>اولین سرور ماینکرفت خودت رو با چند کلیک بساز.</p>
          <button className="btn primary" onClick={onNew} style={{ marginTop: 12 }}>
            ساخت سرور
          </button>
        </div>
      ) : (
        <div className="grid servers">
          {servers.map((s) => (
            <ServerCard
              key={s.id}
              s={s}
              onOpen={() => onOpen(s.id)}
              onStart={() => onStart(s.id)}
              onStop={() => onStop(s.id)}
              onDelete={() => onDelete(s.id)}
            />
          ))}
        </div>
      )}
    </>
  )
}
