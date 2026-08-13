import { useEffect, useRef, useState } from 'react'
import type { LoaderMeta, VersionInfo } from '../../../shared/types'
import { call } from '../api'
import { Icon } from '../components/Icon'
import { Spinner } from '../components/Feedback'

const LOADER_BRAND: Record<string, { letter: string; cls: string }> = {
  vanilla: { letter: 'V', cls: 'lb-green' },
  paper: { letter: 'P', cls: 'lb-blue' },
  purpur: { letter: 'P', cls: 'lb-purple' },
  folia: { letter: 'F', cls: 'lb-red' },
  fabric: { letter: 'F', cls: 'lb-orange' },
  quilt: { letter: 'Q', cls: 'lb-teal' },
  neoforge: { letter: 'N', cls: 'lb-red' },
  forge: { letter: 'F', cls: 'lb-amber' },
}

export function CreateServer({
  loaders,
  onCreated,
  onCancel,
  showToast,
}: {
  loaders: LoaderMeta[]
  onCreated: () => void
  onCancel: () => void
  showToast: (m: string, kind?: any) => void
}) {
  const [name, setName] = useState('')
  const [loader, setLoader] = useState<LoaderMeta | null>(null)
  const [versions, setVersions] = useState<VersionInfo[]>([])
  const [version, setVersion] = useState('')
  const [verQuery, setVerQuery] = useState('')
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
    setVerQuery('')
    call('list_versions', { loader: loader.id })
      .then((v) => {
        const list = (Array.isArray(v) ? v : []) as VersionInfo[]
        setVersions(list)
        const latest = list.find((x) => x.latest) || list[0]
        if (latest) setVersion(latest.id)
      })
      .catch(() => showToast('دریافت نسخه‌ها ناموفق بود', 'error'))
      .finally(() => setLoading(false))
  }, [loader, showToast])

  const filteredVersions = verQuery
    ? versions.filter((v) => v.id.includes(verQuery.trim()))
    : versions

  function pickIcon(file: File) {
    const reader = new FileReader()
    reader.onload = () => setIcon(String(reader.result))
    reader.readAsDataURL(file)
  }

  async function submit() {
    if (!name.trim() || !loader || !version) {
      showToast('نام، لودر و نسخه الزامی هستند', 'warn')
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
      if (res && 'error' in res) {
        showToast('خطا: ' + res.error, 'error')
      } else {
        showToast('سرور ساخته شد ✓', 'success')
        onCreated()
      }
    } catch (e: any) {
      showToast('خطا: ' + (e?.message || e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">سرور جدید</h1>
          <p className="page-sub">لودر و نسخه را انتخاب کن — لیست نسخه‌ها به‌صورت زنده از منابع رسمی دریافت می‌شود.</p>
        </div>
        <button className="btn ghost" onClick={onCancel}>
          <Icon name="arrowRight" size={15} />
          انصراف
        </button>
      </div>

      <div className="create-card">
        <section className="create-section">
          <div className="section-title">
            <span className="step-num">۱</span>
            <h3>لودر (نوع سرور)</h3>
          </div>
          <div className="loader-grid">
            {loaders.map((l) => {
              const brand = LOADER_BRAND[l.id] || { letter: l.id[0].toUpperCase(), cls: '' }
              return (
                <div
                  key={l.id}
                  className={'loader-pick' + (loader?.id === l.id ? ' sel' : '')}
                  onClick={() => setLoader(l)}
                >
                  <div className={`loader-logo ${brand.cls}`}>{brand.letter}</div>
                  <h4>{l.name}</h4>
                  <p>{l.description}</p>
                  <div className="loader-pills">
                    {l.supportsPlugins && <span className="pill plugin">پلاگین</span>}
                    {l.supportsMods && <span className="pill mod">ماد</span>}
                  </div>
                  {loader?.id === l.id && (
                    <span className="loader-check">
                      <Icon name="check" size={13} />
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <section className="create-section">
          <div className="section-title">
            <span className="step-num">۲</span>
            <h3>مشخصات سرور</h3>
          </div>
          <div className="form-row">
            <div className="field">
              <label>نام سرور</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="سرور من"
              />
            </div>
            <div className="field" style={{ maxWidth: 220 }}>
              <label>آیکون سرور</label>
              <div className="icon-picker">
                {icon ? (
                  <img className="icon-preview" src={icon} alt="icon" />
                ) : (
                  <div className="icon-preview empty">{name.slice(0, 1).toUpperCase() || 'M'}</div>
                )}
                <div className="icon-actions">
                  <button className="btn sm" onClick={() => fileRef.current?.click()}>
                    <Icon name="image" size={13} />
                    انتخاب
                  </button>
                  {icon && (
                    <button className="btn sm ghost" onClick={() => setIcon('')}>
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

          <div className="form-row">
            <div className="field">
              <label>نسخه {loading && <Spinner size={13} />}</label>
              <div className="select-with-icon">
                <Icon name="search" size={14} className="select-ico" />
                <input
                  className="input version-search"
                  value={verQuery}
                  onChange={(e) => setVerQuery(e.target.value)}
                  placeholder="جستجوی نسخه…"
                  disabled={!loader || loading}
                />
              </div>
              <div className="version-list">
                {loading && (
                  <div className="version-loading">
                    <Spinner size={16} />
                    در حال دریافت نسخه‌ها…
                  </div>
                )}
                {!loading &&
                  filteredVersions.map((v) => (
                    <button
                      key={v.id}
                      className={'version-item' + (version === v.id ? ' sel' : '')}
                      onClick={() => setVersion(v.id)}
                    >
                      <span className="version-id">{v.id}</span>
                      {v.latest && <span className="pill latest">جدیدترین</span>}
                      {!v.stable && <span className="pill snap">snapshot</span>}
                    </button>
                  ))}
                {!loading && filteredVersions.length === 0 && (
                  <div className="version-loading">نسخه‌ای پیدا نشد</div>
                )}
              </div>
            </div>
            <div className="field" style={{ maxWidth: 180 }}>
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
        </section>

        <section className="create-section">
          <div className="section-title">
            <span className="step-num">۳</span>
            <h3>منابع و حالت</h3>
          </div>
          <div className="form-row">
            <div className="field">
              <div className="slider-head">
                <label>رم حداکثر</label>
                <span className="slider-val">{ramMb} MB</span>
              </div>
              <input
                className="slider"
                type="range"
                min={512}
                max={16384}
                step={256}
                value={ramMb}
                onChange={(e) => {
                  setRamMb(+e.target.value)
                  if (minRamMb > +e.target.value) setMinRamMb(+e.target.value)
                }}
              />
              <div className="slider-scale">
                <span>512</span>
                <span>16 GB</span>
              </div>
            </div>
            <div className="field">
              <div className="slider-head">
                <label>رم حداقل</label>
                <span className="slider-val">{minRamMb} MB</span>
              </div>
              <input
                className="slider"
                type="range"
                min={512}
                max={ramMb}
                step={256}
                value={minRamMb}
                onChange={(e) => setMinRamMb(+e.target.value)}
              />
              <div className="slider-scale">
                <span>512</span>
                <span>{ramMb} MB</span>
              </div>
            </div>
          </div>

          <div className={`toggle${onlineMode ? ' on' : ''}`} onClick={() => setOnlineMode((v) => !v)}>
            <div className="track">
              <div className="knob" />
            </div>
            <div>
              <div className="toggle-title">
                <Icon name="key" size={15} />
                حالت آنلاین (Online Mode)
              </div>
              <div className="tag">اگر خاموش باشد، بازیکنان بدون حساب پرمیوم هم می‌توانند وصل شوند.</div>
            </div>
          </div>
        </section>

        <div className="create-actions">
          <button className="btn ghost" onClick={onCancel}>
            انصراف
          </button>
          <button className="btn primary big" onClick={submit} disabled={busy}>
            {busy ? (
              <>
                <Spinner size={16} />
                در حال ساخت…
              </>
            ) : (
              <>
                <Icon name="download" size={16} />
                ساخت و دانلود فایل‌ها
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
