import { useEffect, useRef, useState } from 'react'
import type { LoaderMeta, VersionInfo } from '../../../shared/types'
import { call } from '../api'

export function CreateServer({
  loaders,
  onCreated,
  onCancel,
  showToast,
}: {
  loaders: LoaderMeta[]
  onCreated: () => void
  onCancel: () => void
  showToast: (m: string) => void
}) {
  const [name, setName] = useState('')
  const [loader, setLoader] = useState<LoaderMeta | null>(null)
  const [versions, setVersions] = useState<VersionInfo[]>([])
  const [version, setVersion] = useState('')
  const [ramMb, setRamMb] = useState(2048)
  const [minRamMb, setMinRamMb] = useState(1024)
  const [port, setPort] = useState(25565)
  const [onlineMode, setOnlineMode] = useState(false)
  const [motd, setMotd] = useState('A Minecraft Server')
  const [icon, setIcon] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!loader) return
    setLoading(true)
    setVersion('')
    call('list_versions', { loader: loader.id, refresh: false })
      .then((v: VersionInfo[]) => {
        setVersions(v || [])
        const latest = v?.find((x) => x.latest) || v?.[0]
        if (latest) setVersion(latest.id)
      })
      .finally(() => setLoading(false))
  }, [loader])

  function pickIcon(file: File) {
    const reader = new FileReader()
    reader.onload = () => setIcon(String(reader.result))
    reader.readAsDataURL(file)
  }

  async function submit() {
    if (!name.trim() || !loader || !version) {
      showToast('نام، لودر و نسخه الزامی هستند')
      return
    }
    setBusy(true)
    try {
      const res = await call('create_server', {
        name: name.trim(),
        loader: loader.id,
        version,
        ramMb,
        minRamMb,
        port,
        onlineMode,
        motd,
        icon,
      })
      if (res && res.error) {
        showToast('خطا: ' + res.error)
      } else {
        showToast('سرور ساخته شد ✓')
        onCreated()
      }
    } catch (e: any) {
      showToast('خطا: ' + (e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>سرور جدید</h1>
          <p>لودر و نسخه را انتخاب کن — لیست نسخه‌ها به‌صورت زنده از منابع رسمی دریافت می‌شود.</p>
        </div>
        <button className="btn" onClick={onCancel}>
          انصراف
        </button>
      </div>

      <div className="panel card" style={{ padding: 22 }}>
        <div className="field">
          <label>لودر (نوع سرور)</label>
          <div className="loader-grid">
            {loaders.map((l) => (
              <div
                key={l.id}
                className={'loader-pick' + (loader?.id === l.id ? ' sel' : '')}
                onClick={() => setLoader(l)}
              >
                <h4>{l.name}</h4>
                <p>{l.description}</p>
                {l.supports_plugins && <span className="pill">پلاگین</span>}
                {l.supports_mods && <span className="pill" style={{ marginInlineStart: 4 }}>ماد</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>نام سرور</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="سرور من" />
          </div>
          <div className="field" style={{ flex: '0 0 auto' }}>
            <label>آیکون سرور</label>
            <div className="icon-picker">
              {icon ? (
                <img className="icon-preview" src={icon} alt="icon" />
              ) : (
                <div className="icon-preview empty">{name.slice(0, 1).toUpperCase() || 'M'}</div>
              )}
              <div className="icon-actions">
                <button className="btn small" onClick={() => fileRef.current?.click()}>
                  انتخاب عکس
                </button>
                {icon && (
                  <button className="btn small ghost" onClick={() => setIcon('')}>
                    حذف
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) pickIcon(f)
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>نسخه {loading && '(دریافت…)'}</label>
            <select className="select" value={version} onChange={(e) => setVersion(e.target.value)} disabled={!loader || loading}>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id}
                  {v.latest ? ' ★' : ''}
                  {!v.stable ? ' (snapshot)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>پورت</label>
            <input className="input" type="number" value={port} onChange={(e) => setPort(+e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label>پیام سرور (MOTD)</label>
          <textarea
            className="input textarea"
            rows={2}
            value={motd}
            onChange={(e) => setMotd(e.target.value)}
            placeholder="پیامی که در لیست بازیکنان نمایش داده می‌شود"
          />
        </div>

        <div className="row">
          <div className="field">
            <label>رم حداکثر: {ramMb} MB</label>
            <input type="range" min={512} max={16384} step={256} value={ramMb} onChange={(e) => setRamMb(+e.target.value)} />
          </div>
          <div className="field">
            <label>رم حداقل: {minRamMb} MB</label>
            <input type="range" min={512} max={ramMb} step={256} value={minRamMb} onChange={(e) => setMinRamMb(+e.target.value)} />
          </div>
        </div>

        <div className="field">
          <div className={'toggle' + (onlineMode ? ' on' : '')} onClick={() => setOnlineMode((v) => !v)}>
            <div className="track">
              <div className="knob" />
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>حالت آنلاین (Online Mode)</div>
              <div className="tag">اگر خاموش باشد، بازیکنان بدون حساب پرمیوم هم می‌توانند وصل شوند.</div>
            </div>
          </div>
        </div>

        <div className="flex" style={{ marginTop: 18 }}>
          <button className="btn primary" onClick={submit} disabled={busy}>
            {busy ? 'در حال ساخت…' : 'ساخت و دانلود فایل‌ها'}
          </button>
        </div>
      </div>
    </>
  )
}
