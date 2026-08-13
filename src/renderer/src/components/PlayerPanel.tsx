import { useEffect, useState } from 'react'
import type { BannedPlayer } from '../../../shared/types'
import { call } from '../api'
import { PlayerAvatar } from './PlayerAvatar'

export function PlayerPanel({
  serverId,
  players,
  showToast,
}: {
  serverId: string
  players: string[]
  showToast: (m: string) => void
}) {
  const [banned, setBanned] = useState<BannedPlayer[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [tab, setTab] = useState<'online' | 'banned'>('online')

  const [mode, setMode] = useState('survival')
  const [tp, setTp] = useState({ x: 0, y: 64, z: 0 })
  const [xp, setXp] = useState(0)
  const [giveItem, setGiveItem] = useState('minecraft:diamond')
  const [giveAmt, setGiveAmt] = useState(1)

  async function refreshBanned() {
    const b = await call('list_banned', { id: serverId })
    if (Array.isArray(b)) setBanned(b as BannedPlayer[])
  }
  async function refreshPlayers() {
    await call('list_players', { id: serverId })
  }

  useEffect(() => {
    refreshBanned()
    refreshPlayers()
    const t = setInterval(refreshPlayers, 6000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId])

  async function act(action: string, extra: Record<string, any> = {}) {
    try {
      await call('player_action', { id: serverId, action, target: selected || '', ...extra })
      showToast(`انجام شد: ${action}`)
    } catch (e: any) {
      showToast('خطا: ' + (e?.message || e))
    }
  }

  return (
    <div className="panel card" style={{ padding: 20 }}>
      <div className="flex between" style={{ marginBottom: 14 }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <div className={'tab' + (tab === 'online' ? ' active' : '')} onClick={() => setTab('online')}>
            آنلاین ({players.length})
          </div>
          <div className={'tab' + (tab === 'banned' ? ' active' : '')} onClick={() => setTab('banned')}>
            بن‌شده ({banned.length})
          </div>
        </div>
        <button className="btn sm" onClick={refreshPlayers}>
          بارگذاری مجدد
        </button>
      </div>

      {tab === 'online' &&
        (players.length === 0 ? (
          <p className="tag">هیچ بازیکنی آنلاین نیست.</p>
        ) : (
          <div className="player-grid">
            {players.map((p) => (
              <div key={p} className="player-card" onClick={() => setSelected(p)}>
                <PlayerAvatar name={p} size={56} />
                <div className="player-meta">
                  <div className="player-name">{p}</div>
                  <div className="tag">کلیک برای مدیریت</div>
                </div>
                <span className="status-dot on" />
              </div>
            ))}
          </div>
        ))}

      {tab === 'banned' &&
        (banned.length === 0 ? (
          <p className="tag">هیچ بازیکنی بن نشده است.</p>
        ) : (
          <div className="player-grid">
            {banned.map((b) => (
              <div key={b.name} className="player-card banned">
                <PlayerAvatar name={b.name} size={56} />
                <div className="player-meta">
                  <div className="player-name">{b.name}</div>
                  <div className="tag">{b.reason || 'بدون دلیل'}</div>
                </div>
                <button
                  className="btn sm good"
                  onClick={async () => {
                    await call('player_action', { id: serverId, action: 'pardon', target: b.name })
                    showToast(`آن‌بن شد: ${b.name}`)
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
                <div className="about-name" style={{ fontSize: 20 }}>
                  {selected}
                </div>
                <div className="tag">مدیریت بازیکن</div>
              </div>
              <button className="btn sm ghost" style={{ marginInlineStart: 'auto' }} onClick={() => setSelected(null)}>
                ✕
              </button>
            </div>

            <div className="drawer-grid">
              <div className="drawer-col">
                <h4>وضعیت & دسترسی</h4>
                <div className="btn-row">
                  <button className="btn sm danger" onClick={() => act('kick')}>
                    اخراج (Kick)
                  </button>
                  <button className="btn sm" onClick={() => act('ban')}>
                    بن (Ban)
                  </button>
                  <button className="btn sm" onClick={() => act('op')}>
                    اپراتور (OP)
                  </button>
                  <button className="btn sm" onClick={() => act('deop')}>
                    لغو OP
                  </button>
                </div>

                <h4 style={{ marginTop: 14 }}>گیم‌مود</h4>
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

                <h4 style={{ marginTop: 14 }}>تجربه (XP)</h4>
                <div className="coord-row">
                  <input className="input" type="number" value={xp} onChange={(e) => setXp(+e.target.value)} placeholder="سطح" />
                  <button className="btn sm primary" onClick={() => act('xp', { amount: xp })}>
                    تنظیم XP
                  </button>
                </div>
              </div>

              <div className="drawer-col">
                <h4>جون & غذا</h4>
                <div className="btn-row">
                  <button className="btn sm good" onClick={() => act('heal')}>
                    ❤️ درمان کامل
                  </button>
                  <button className="btn sm good" onClick={() => act('feed')}>
                    🍖 سیر کامل
                  </button>
                </div>

                <h4 style={{ marginTop: 14 }}>آیتم (Inventory)</h4>
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
