import { useEffect, useMemo, useState } from 'react'
import type { ServerInfo, TunnelInfo } from '../../../shared/types'
import { Console } from '../components/Console'
import { AddressChip } from '../components/AddressChip'
import { PlayerPanel } from '../components/PlayerPanel'
import { Icon } from '../components/Icon'
import { call } from '../api'

type Tab = 'console' | 'settings' | 'online' | 'players'

const statusText: Record<string, string> = {
  running: 'در حال اجرا',
  starting: 'در حال آماده‌سازی',
  stopping: 'در حال توقف',
  stopped: 'خاموش',
  error: 'خطا',
}

export function ServerDetail({
  server,
  logs,
  tunnel,
  players,
  onBack,
  onStart,
  onStop,
  onRestart,
  onCommand,
  onTunnelStart,
  onTunnelStop,
  showToast,
}: {
  server: ServerInfo
  logs: string[]
  tunnel: TunnelInfo
  players: string[]
  onBack: () => void
  onStart: () => void
  onStop: () => void
  onRestart: () => void
  onCommand: (c: string) => void
  onTunnelStart: () => void
  onTunnelStop: () => void
  showToast: (m: string, kind?: any) => void
}) {
  const [tab, setTab] = useState<Tab>('console')
  const [props, setProps] = useState<Record<string, string>>({})
  const [orig, setOrig] = useState<Record<string, string>>({})
  const running = server.status === 'running'
  const busy = server.status === 'starting' || server.status === 'stopping'

  async function loadProps() {
    const p = await call('get_properties', { id: server.id })
    if (p && typeof p === 'object' && !('error' in p)) {
      setProps(p as Record<string, string>)
      setOrig(p as Record<string, string>)
    }
  }

  useEffect(() => {
    if (tab === 'settings') loadProps()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  async function saveProps() {
    for (const k of Object.keys(props)) {
      if (props[k] !== orig[k]) {
        await call('set_property', { id: server.id, key: k, value: props[k] })
      }
    }
    showToast('تنظیمات ذخیره شد ✓', 'success')
    setOrig(props)
  }

  const changedCount = useMemo(
    () => Object.keys(props).filter((k) => props[k] !== orig[k]).length,
    [props, orig],
  )

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'console', label: 'کنسول', icon: 'terminal' },
    { id: 'settings', label: 'تنظیمات', icon: 'sliders' },
    { id: 'online', label: 'دسترسی آنلاین', icon: 'globe' },
    { id: 'players', label: 'بازیکنان', icon: 'users' },
  ]

  return (
    <div className="page">
      <div className="detail-head">
        <button className="btn ghost back-btn" onClick={onBack}>
          <Icon name="arrowRight" size={15} />
          بازگشت
        </button>

        <div className="detail-icon-wrap">
          {server.icon ? (
            <img className="detail-icon" src={server.icon} alt={server.name} />
          ) : (
            <div className="detail-icon fallback">{server.name.slice(0, 1).toUpperCase()}</div>
          )}
        </div>

        <div className="detail-meta">
          <h1>{server.name}</h1>
          <div className="detail-meta-row">
            <span className="loader-tag lv-purple">{displayLoader(server.loader)}</span>
            <span className="detail-sub">
              <Icon name="globe" size={12} /> نسخه {server.version}
            </span>
            <span className={`status-pill ${server.status}`}>
              <span className={`status-dot ${server.status}`} />
              {statusText[server.status] || server.status}
            </span>
          </div>
          <div className="detail-addr">
            <AddressChip value={`localhost:${server.port}`} label="لوکال" />
            <span className="players-count">
              <Icon name="users" size={13} />
              {server.players.online}/{server.players.max} بازیکن
            </span>
          </div>
        </div>

        <div className="detail-actions">
          {running ? (
            <button className="btn danger" onClick={onStop} disabled={busy}>
              <Icon name="square" size={14} />
              توقف
            </button>
          ) : (
            <button className="btn good" onClick={onStart} disabled={busy}>
              <Icon name="play" size={14} />
              شروع
            </button>
          )}
          <button className="btn" onClick={onRestart} disabled={!running}>
            <Icon name="restart" size={14} />
            ری‌استارت
          </button>
        </div>
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'console' && (
        <div className="panel">
          <Console logs={logs} onCommand={onCommand} />
        </div>
      )}

      {tab === 'settings' && (
        <div className="panel settings-panel">
          <div className="kv">
            <div>
              <div className="k">لودر</div>
              <div className="v">{displayLoader(server.loader)}</div>
            </div>
            <div>
              <div className="k">نسخه</div>
              <div className="v">{server.version}</div>
            </div>
            <div>
              <div className="k">رم</div>
              <div className="v">
                <Icon name="memory" size={13} /> {server.ramMb} MB
              </div>
            </div>
            <div>
              <div className="k">پورت</div>
              <div className="v">{server.port}</div>
            </div>
            <div>
              <div className="k">مسیر</div>
              <div className="v mono" dir="ltr" style={{ fontSize: 12 }}>
                {server.path}
              </div>
            </div>
            <div>
              <div className="k">Java</div>
              <div className="v">{server.javaPath ? server.javaPath.replace(/\\/g, '/') : 'خودکار'}</div>
            </div>
          </div>

          <h3 className="settings-title">server.properties</h3>
          <div className="props-grid">
            {Object.keys(props).map((k) => (
              <div className="field" key={k}>
                <label>{k}</label>
                <input
                  className="input"
                  value={props[k] ?? ''}
                  onChange={(e) => setProps((p) => ({ ...p, [k]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="settings-actions">
            <button className="btn primary" onClick={saveProps} disabled={changedCount === 0}>
              <Icon name="check" size={14} />
              ذخیره تنظیمات
              {changedCount > 0 && <span className="changed-count">{changedCount}</span>}
            </button>
            <p className="tag">تغییر برخی تنظیمات (مثل پورت) برای اعمال نیاز به ری‌استارت سرور دارد.</p>
          </div>
        </div>
      )}

      {tab === 'online' && (
        <div className="panel online-panel">
          <div className="online-hero">
            <span className="online-ico">
              <Icon name="globe" size={26} />
            </span>
            <div>
              <h3>دسترسی اینترنتی (بدون Port Forwarding)</h3>
              <p>با استفاده از تانل رایگان pinggy، سرورت را برای دوستانت از هر کجای دنیا در دسترس قرار بده.</p>
            </div>
          </div>
          {!tunnel.active ? (
            <button className="btn primary big" onClick={onTunnelStart}>
              <Icon name="wifi" size={16} />
              فعال‌سازی تانل آنلاین
            </button>
          ) : (
            <button className="btn danger" onClick={onTunnelStop}>
              <Icon name="power" size={15} />
              قطع تانل
            </button>
          )}
          {tunnel.urls?.length > 0 && (
            <div className="online-urls">
              <div className="tag">آدرس عمومی سرور (در بازی وارد کنید):</div>
              <div className="addr-list">
                {tunnel.urls.map((u) => (
                  <AddressChip key={u} value={u.replace('tcp://', '')} label="عمومی" primary />
                ))}
              </div>
            </div>
          )}
          {tunnel.error && <p className="tag" style={{ color: 'var(--bad)' }}>خطا: {tunnel.error}</p>}
        </div>
      )}

      {tab === 'players' && <PlayerPanel serverId={server.id} players={players} showToast={showToast} />}
    </div>
  )
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
