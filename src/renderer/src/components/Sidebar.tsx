import type { IconName } from './Icon'
import { Icon } from './Icon'

export type SidebarView = 'dashboard' | 'create' | 'detail' | 'settings'

interface Props {
  view: SidebarView
  servers: number
  running: number
  online: number
  onNavigate: (v: string) => void
}

const groups: { label: string; items: { id: string; label: string; icon: IconName }[] }[] = [
  {
    label: 'مدیریت',
    items: [
      { id: 'dashboard', label: 'داشبورد', icon: 'dashboard' },
      { id: 'create', label: 'سرور جدید', icon: 'plus' },
    ],
  },
  {
    label: 'سیستم',
    items: [{ id: 'settings', label: 'تنظیمات', icon: 'settings' }],
  },
]

export function Sidebar({ view, servers, running, online, onNavigate }: Props) {
  const active = view === 'detail' ? 'dashboard' : view
  return (
    <nav className="sidebar">
      <div className="side-status">
        <div className="side-status-row">
          <span className="side-status-ico online">
            <Icon name="activity" size={13} />
          </span>
          <span>
            <b>{running}</b> در حال اجرا
          </span>
        </div>
        <div className="side-status-row">
          <span className="side-status-ico players">
            <Icon name="users" size={13} />
          </span>
          <span>
            <b>{online}</b> بازیکن آنلاین
          </span>
        </div>
        <div className="side-status-row">
          <span className="side-status-ico total">
            <Icon name="server" size={13} />
          </span>
          <span>
            <b>{servers}</b> سرور
          </span>
        </div>
      </div>

      {groups.map((g) => (
        <div className="nav-group" key={g.label}>
          <div className="nav-label">{g.label}</div>
          {g.items.map((it) => (
            <button
              key={it.id}
              className={'nav-item' + (active === it.id ? ' active' : '')}
              onClick={() => onNavigate(it.id)}
            >
              <span className="nav-ico">
                <Icon name={it.icon} size={17} />
              </span>
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      ))}

      <div className="spacer" />
      <div className="side-version">
        <div className="side-logo">MC</div>
        <div>
          <div className="side-ver-name">MCSS v1.0.12</div>
          <div className="side-ver-by">ساخته‌شده توسط RADINMNX</div>
        </div>
      </div>
    </nav>
  )
}
