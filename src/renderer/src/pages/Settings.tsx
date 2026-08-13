import { useCallback, useEffect, useState } from 'react'
import type { JavaInfo, LoaderMeta } from '../../../shared/types'
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

export function Settings({ showToast }: { showToast: (m: string, kind?: any) => void }) {
  const [javas, setJavas] = useState<JavaInfo[]>([])
  const [loaders, setLoaders] = useState<LoaderMeta[]>([])
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setBusy(true)
    try {
      const [j, l] = await Promise.all([
        call('detect_java'),
        call('list_loaders'),
      ])
      if (Array.isArray(j)) setJavas(j as JavaInfo[])
      if (Array.isArray(l)) setLoaders(l as LoaderMeta[])
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">تنظیمات</h1>
          <p className="page-sub">تشخیص خودکار Java و لودرهای پشتیبانی‌شده</p>
        </div>
        <button className="btn ghost" onClick={refresh} disabled={busy}>
          {busy ? <Spinner size={14} /> : <Icon name="refresh" size={15} />}
          بارگذاری مجدد
        </button>
      </div>

      <div className="settings-grid">
        <section className="panel settings-card">
          <div className="card-title-row">
            <span className="card-title-ico">
              <Icon name="cpu" size={18} />
            </span>
            <h3>Javaهای شناسایی‌شده</h3>
          </div>
          {javas.length === 0 ? (
            <p className="tag">
              جاوا روی سیستم پیدا نشد — برنامه به‌صورت خودکار نسخه مناسب را هنگام اجرای سرور دانلود می‌کند.
            </p>
          ) : (
            <div className="java-list">
              {javas.map((j, i) => (
                <div className="java-item" key={i}>
                  <span className="java-badge">
                    <Icon name="zap" size={14} />
                    {j.major}
                  </span>
                  <div className="java-meta">
                    <div className="java-ver">{j.version}</div>
                    <div className="tag">
                      {j.source === 'managed' ? 'مدیریت‌شده توسط برنامه' : 'سیستم'} · {j.path}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel settings-card">
          <div className="card-title-row">
            <span className="card-title-ico">
              <Icon name="sparkles" size={18} />
            </span>
            <h3>لودرهای پشتیبانی‌شده ({loaders.length})</h3>
          </div>
          <div className="loader-grid sm">
            {loaders.map((l) => {
              const brand = LOADER_BRAND[l.id] || { letter: l.id[0].toUpperCase(), cls: '' }
              return (
                <div className="loader-pick static" key={l.id}>
                  <div className={`loader-logo ${brand.cls} sm`}>{brand.letter}</div>
                  <div>
                    <h4>{l.name}</h4>
                    <div className="loader-pills">
                      {l.supportsPlugins && <span className="pill plugin">پلاگین</span>}
                      {l.supportsMods && <span className="pill mod">ماد</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="tag">
            لیست نسخه‌ها به‌صورت زنده از منابع رسمی (Mojang، PaperMC، Fabric، Forge، NeoForge، Quilt) دریافت می‌شود.
          </p>
        </section>

        <section className="panel settings-card">
          <div className="card-title-row">
            <span className="card-title-ico">
              <Icon name="info" size={18} />
            </span>
            <h3>درباره</h3>
          </div>
          <div className="about">
            <div className="about-logo">
              <Icon name="server" size={26} />
            </div>
            <div>
              <div className="about-name">Minecraft Server Studio</div>
              <div className="tag">
                ساخته‌شده توسط <b>RADINMNX</b>
              </div>
              <div className="tag">نسخه 1.0.12 · Electron + React + Node.js — بدون Rust</div>
              <div className="about-chips">
                <span className="pill latest">GPU-friendly UI</span>
                <span className="pill mod">Lazy Loading</span>
                <span className="pill plugin">Node.js Engine</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
