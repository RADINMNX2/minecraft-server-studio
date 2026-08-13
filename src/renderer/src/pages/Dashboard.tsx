import type { LoaderMeta, ServerInfo } from '../../../shared/types'
import { ServerCard } from '../components/ServerCard'
import { Icon } from '../components/Icon'

export function Dashboard({
  servers,
  loaders,
  running,
  online,
  onNew,
  onOpen,
  onStart,
  onStop,
  onDelete,
  showToast,
}: {
  servers: ServerInfo[]
  loaders: LoaderMeta[]
  running: number
  online: number
  onNew: () => void
  onOpen: (id: string) => void
  onStart: (id: string) => void
  onStop: (id: string) => void
  onDelete: (id: string) => void
  showToast: (m: string, kind?: any) => void
}) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">داشبورد</h1>
          <p className="page-sub">
            {servers.length} سرور · {loaders.length} لودر پشتیبانی‌شده
          </p>
        </div>
        <button className="btn primary" onClick={onNew}>
          <Icon name="plus" size={16} />
          سرور جدید
        </button>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-ico total">
            <Icon name="server" size={20} />
          </span>
          <div>
            <div className="stat-value">{servers.length}</div>
            <div className="stat-label">کل سرورها</div>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-ico on">
            <Icon name="activity" size={20} />
          </span>
          <div>
            <div className="stat-value">{running}</div>
            <div className="stat-label">در حال اجرا</div>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-ico players">
            <Icon name="users" size={20} />
          </span>
          <div>
            <div className="stat-value">{online}</div>
            <div className="stat-label">بازیکن آنلاین</div>
          </div>
        </div>
      </div>

      {servers.length === 0 ? (
        <div className="empty">
          <div className="empty-art">
            <Icon name="sparkles" size={40} />
          </div>
          <h3>هنوز سروری نداری</h3>
          <p>اولین سرور ماینکرفت خودت را با چند کلیک بساز — بدون پیچیدگی.</p>
          <button className="btn primary" onClick={onNew}>
            <Icon name="rocket" size={16} />
            ساخت سرور
          </button>
        </div>
      ) : (
        <div className="servers-grid">
          {servers.map((s) => (
            <ServerCard
              key={s.id}
              s={s}
              onOpen={() => onOpen(s.id)}
              onStart={() => onStart(s.id)}
              onStop={() => onStop(s.id)}
              onDelete={() => {
                if (window.confirm('سرور حذف شود؟ (فایل‌ها پاک نمی‌شوند)')) onDelete(s.id)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
