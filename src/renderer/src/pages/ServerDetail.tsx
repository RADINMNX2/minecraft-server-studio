import { useEffect, useState } from 'react'
import type { ServerInfo } from '../../../shared/types'
import { Console } from '../components/Console'
import { call } from '../api'

type Tab = 'console' | 'settings' | 'online'

export function ServerDetail({
  server,
  logs,
  tunnel,
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
  tunnel: { active: boolean; urls: string[]; error?: string }
  onBack: () => void
  onStart: () => void
  onStop: () => void
  onRestart: () => void
  onCommand: (c: string) => void
  onTunnelStart: () => void
  onTunnelStop: () => void
  showToast: (m: string) => void
}) {
  const [tab, setTab] = useState<Tab>('console')
  const [props, setProps] = useState<Record<string, string>>({})
  const [orig, setOrig] = useState<Record<string, string>>({})
  const running = server.status === 'running'

  async function loadProps() {
    const p = await call('get_properties', { id: server.id })
    if (p && typeof p === 'object') {
      setProps(p)
      setOrig(p)
    }
  }

  useEffect(() => {
    if (tab === 'settings') loadProps()
  }, [tab])

  async function saveProps() {
    for (const k of Object.keys(props)) {
      if (props[k] !== orig[k]) {
        await call('set_property', { id: server.id, key: k, value: props[k] })
      }
    }
    showToast('تنظیمات ذخیره شد ✓')
    setOrig(props)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{server.name}</h1>
          <p>
            {server.loader} · {server.version} · پورت {server.port} · وضعیت: {server.status}
          </p>
        </div>
        <button className="btn" onClick={onBack}>
          ← بازگشت
        </button>
      </div>

      <div className="tabs">
        {(['console', 'settings', 'online'] as Tab[]).map((t) => (
          <div key={t} className={'tab' + (tab === t ? ' active' : '')} onClick={() => setTab(t)}>
            {t === 'console' ? 'کنسول' : t === 'settings' ? 'تنظیمات' : 'دسترسی آنلاین'}
          </div>
        ))}
      </div>

      {tab === 'console' && (
        <div className="panel card" style={{ padding: 16 }}>
          <div className="flex between" style={{ marginBottom: 12 }}>
            <div className="flex">
              {running ? (
                <button className="btn danger sm" onClick={onStop}>
                  توقف
                </button>
              ) : (
                <button className="btn good sm" onClick={onStart}>
                  شروع
                </button>
              )}
              <button className="btn sm" onClick={onRestart} disabled={!running}>
                ری‌استارت
              </button>
            </div>
            <span className="tag">
              {server.players_online}/{server.players_max} بازیکن
            </span>
          </div>
          <Console logs={logs} onCommand={onCommand} />
        </div>
      )}

      {tab === 'settings' && (
        <div className="panel card" style={{ padding: 20 }}>
          <div className="kv" style={{ marginBottom: 18 }}>
            <div><div className="k">لودر</div><div className="v">{server.loader}</div></div>
            <div><div className="k">نسخه</div><div className="v">{server.version}</div></div>
            <div><div className="k">رم</div><div className="v">{server.ram_mb} MB</div></div>
            <div><div className="k">پورت</div><div className="v">{server.port}</div></div>
          </div>
          <h3 style={{ fontSize: 15, margin: '0 0 10px' }}>server.properties</h3>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {Object.keys(props).map((k) => (
              <div className="field" key={k} style={{ margin: 0 }}>
                <label>{k}</label>
                <input className="input" value={props[k] ?? ''} onChange={(e) => setProps((p) => ({ ...p, [k]: e.target.value }))} />
              </div>
            ))}
          </div>
          <button className="btn primary" style={{ marginTop: 16 }} onClick={saveProps}>
            ذخیره تنظیمات
          </button>
          <p className="tag" style={{ marginTop: 8 }}>
            تغییر برخی تنظیماتات (مثل پورت) برای اعمال نیاز به ری‌استارت سرور دارد.
          </p>
        </div>
      )}

      {tab === 'online' && (
        <div className="panel card" style={{ padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>دسترسی اینترنتی (بدون Port Forwarding)</h3>
          <p className="tag">
            با استفاده از تانل رایگان pinggy، سرورت را برای دوستانت از هر کجای دنیا در دسترس قرار بده.
          </p>
          {!tunnel.active ? (
            <button className="btn primary" onClick={onTunnelStart}>
              فعال‌سازی تانل آنلاین
            </button>
          ) : (
            <button className="btn danger" onClick={onTunnelStop}>
              قطع تانل
            </button>
          )}
          {tunnel.urls?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="tag">آدرس عمومی سرور (در بازی وارد کنید):</div>
              {tunnel.urls.map((u) => (
                <div key={u} className="input" style={{ marginTop: 8, fontFamily: 'monospace' }}>
                  {u.replace('tcp://', '')}
                </div>
              ))}
            </div>
          )}
          {tunnel.error && <p className="tag" style={{ color: 'var(--bad)' }}>خطا: {tunnel.error}</p>}
        </div>
      )}
    </>
  )
}
