export function Sidebar({ view, setView }: { view: string; setView: (v: string) => void }) {
  const items = [
    { id: 'dashboard', label: 'داشبورد', icon: '▦' },
    { id: 'create', label: 'سرور جدید', icon: '＋' },
    { id: 'settings', label: 'تنظیمات', icon: '⚙' },
  ]
  return (
    <div className="sidebar">
      {items.map((it) => (
        <div
          key={it.id}
          className={'nav-item' + (view === it.id ? ' active' : '')}
          onClick={() => setView(it.id)}
        >
          <span style={{ opacity: 0.8 }}>{it.icon}</span>
          <span>{it.label}</span>
        </div>
      ))}
      <div className="spacer" />
      <div className="ver">MCSS v1.0</div>
      <div className="ver by">ساخته شده توسط RADINMNX</div>
    </div>
  )
}
