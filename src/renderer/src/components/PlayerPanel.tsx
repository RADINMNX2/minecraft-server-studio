import { useCallback, useEffect, useState } from 'react'
import type { BannedPlayer } from '../../../shared/types'
import { call } from '../api'
import { PlayerAvatar } from './PlayerAvatar'
import { Icon } from './Icon'

export function PlayerPanel({
  serverId,
  players,
  showToast,
}: {
  serverId: string
  players: string[]
  showToast: (m: string, kind?: any) => void
}) {
  const [banned, setBanned] = useState<BannedPlayer[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [tab, setTab] = useState<'online' | 'banned'>('online')

  const [mode, setMode] = useState('survival')
  const [tp, setTp] = useState({ x: 0, y: 64, z: 0 })
  const [xp, setXp] = useState(0)
  const [giveItem, setGiveItem] = useState('minecraft:diamond')
  const [giveAmt, setGiveAmt] = useState(1)

  const refreshBanned = useCallback(async () => {
    const b = await call('list_banned', { id: serverId })
    if (Array.isArray(b)) setBanned(b as BannedPlayer[])
  }, [serverId])

  const refreshPlayers = useCallback(async () => {
    await call('list_players', { id: serverId })
  }, [serverId])

  useEffect(() => {
    refreshBanned()
    refreshPlayers()
    const t = setInterval(refreshPlayers, 6000)
    return () => clearInterval(t)
  }, [refreshBanned, refreshPlayers])

  async function act(action: string, extra: Record<string, any> = {}) {
    if (!selected) return
    const r = await call('player_action', { id: serverId, action, target: selected, ...extra } as any)
    if (r && 'error' in r) showToast(r.error, 'error')
    else showToast('انجام شد ✓', 'success')
  }

  return (
    <div className="players-panel">
      <div className="players-toolbar">
        <div className="tabs">
          <button className={`tab${tab === 'online' ? ' active' : ''}`} onClick={() => setTab('online')}>
            <Icon name="users" size={15} />
            آنلاین <span className="tab-count">{players.length}</span>
          </button>
          <button className={`tab${tab === 'banned' ? ' active' : ''}`} onClick={() => setTab('banned')}>
            <Icon name="ban" size={15} />
            بن‌شده <span className="tab-count">{banned.length}</span>
          </button>
        </div>
        <button className="btn sm ghost" onClick={refreshPlayers}>
          <Icon name="refresh" size={13} />
          بارگذاری مجدد
        </button>
      </div>

      {tab === 'online' &&
        (players.length === 0 ? (
          <div className="players-empty">
            <Icon name="users" size={28} />
            <p>هیچ بازیکنی آنلاین نیست.</p>
          </div>
        ) : (
          <div className="player-grid">
            {players.map((p) => (
              <div key={p} className="player-card" onClick={() => setSelected(p)}>
                <PlayerAvatar name={p} size={52} />
                <div className="player-meta">
                  <div className="player-name">{p}</div>
                  <div className="tag">کلیک برای مدیریت</div>
                </div>
                <span className="presence" />
              </div>
            ))}
          </div>
        ))}

      {tab === 'banned' &&
        (banned.length === 0 ? (
          <div className="players-empty">
            <Icon name="shield" size={28} />
            <p>هیچ بازیکنی بن نشده است.</p>
          </div>
        ) : (
          <div className="player-grid">
            {banned.map((b) => (
              <div key={b.name} className="player-card banned">
                <PlayerAvatar name={b.name} size={52} />
                <div className="player-meta">
                  <div className="player-name">{b.name}</div>
                  <div className="tag">{b.reason || 'بدون دلیل'}</div>
                </div>
                <button
                  className="btn sm good"
                  onClick={async () => {
                    await call('player_action', { id: serverId, action: 'pardon', target: b.name } as any)
                    showToast(`آن‌بن شد: ${b.name}`, 'success')
                    refreshBanned()
                  }}
                >
                  آن‌بن
                </button>
              </div>
            ))}
          </div>
        ))}

      {selected && (
        <div className="modal-bg" onClick={() => setSelected(null)}>
          <div className="modal player-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <PlayerAvatar name={selected} size={72} />
              <div>
                <div className="drawer-name">{selected}</div>
                <div className="tag">مدیریت بازیکن</div>
              </div>
              <button className="icon-btn ghost" style={{ marginInlineStart: 'auto' }} onClick={() => setSelected(null)}>
                <Icon name="x" size={16} />
              </button>
            </div>

            <div className="drawer-grid">
              <div className="drawer-col">
                <h4>وضعیت و دسترسی</h4>
                <div className="btn-row">
                  <button className="btn sm danger" onClick={() => act('kick')}>
                    اخراج
                  </button>
                  <button className="btn sm warn" onClick={() => act('ban')}>
                    بن
                  </button>
                  <button className="btn sm" onClick={() => act('op')}>
                    اپراتور
                  </button>
                  <button className="btn sm ghost" onClick={() => act('deop')}>
                    لغو OP
                  </button>
                </div>

                <h4>گیم‌مود</h4>
                <div className="btn-row">
                  <select className="select" value={mode} onChange={(e) => setMode(e.target.value)}>
                    <option value="survival">بقا</option>
                    <option value="creative">خلاق</option>
                    <option value="adventure">ماجراجویی</option>
                    <option value="spectator">ناظر</option>
                  </select>
                  <button className="btn sm primary" onClick={() => act('gamemode', { mode })}>
                    اعمال
                  </button>
                </div>
              </div>

              <div className="drawer-col">
                <h4>موقعیت (Teleport)</h4>
                <div className="coord-row">
                  <input className="input" type="number" value={tp.x} onChange={(e) => setTp({ ...tp, x: +e.target.value })} placeholder="X" />
                  <input className="input" type="number" value={tp.y} onChange={(e) => setTp({ ...tp, y: +e.target.value })} placeholder="Y" />
                  <input className="input" type="number" value={tp.z} onChange={(e) => setTp({ ...tp, z: +e.target.value })} placeholder="Z" />
                </div>
                <button className="btn sm primary" style={{ marginTop: 6 }} onClick={() => act('tp', { x: tp.x, y: tp.y, z: tp.z })}>
                  انتقال به موقعیت
                </button>

                <h4>تجربه (XP)</h4>
                <div className="coord-row">
                  <input className="input" type="number" value={xp} onChange={(e) => setXp(+e.target.value)} placeholder="سطح" />
                  <button className="btn sm primary" onClick={() => act('xp', { amount: xp })}>
                    تنظیم XP
                  </button>
                </div>
              </div>

              <div className="drawer-col">
                <h4>جون و غذا</h4>
                <div className="btn-row">
                  <button className="btn sm good" onClick={() => act('heal')}>
                    ❤️ درمان کامل
                  </button>
                  <button className="btn sm good" onClick={() => act('feed')}>
                    🍖 سیر کامل
                  </button>
                </div>

                <h4>آیتم (Inventory)</h4>
                <input className="input" value={giveItem} onChange={(e) => setGiveItem(e.target.value)} placeholder="minecraft:diamond" />
                <div className="coord-row" style={{ marginTop: 6 }}>
                  <input className="input" type="number" value={giveAmt} onChange={(e) => setGiveAmt(+e.target.value)} placeholder="تعداد" />
                  <button className="btn sm primary" onClick={() => act('give', { item: giveItem, amount: giveAmt })}>
                    + آیتم
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}
    </div>
  )
}
