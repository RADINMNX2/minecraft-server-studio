import { useEffect, useState } from 'react'
import type { JavaInfo, LoaderMeta } from '../../../shared/types'
import { call } from '../api'

export function Settings({ onToast }: { onToast: (m: string) => void }) {
  const [javas, setJavas] = useState<JavaInfo[]>([])
  const [loaders, setLoaders] = useState<LoaderMeta[]>([])

  useEffect(() => {
    call('detect_java', {}).then((j) => Array.isArray(j) && setJavas(j))
    call('list_loaders', {}).then((l) => Array.isArray(l) && setLoaders(l))
  }, [])

  return (
    <>
      <div className="page-head">
        <div>
          <h1>تنظیمات</h1>
          <p>تشخیص خودکار Java و لودرهای پشتیبانی‌شده</p>
        </div>
      </div>

      <div className="panel card" style={{ padding: 20, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Javaهای شناسایی‌شده</h3>
        {javas.length === 0 ? (
          <p className="tag">
            جاوا روی سیستم پیدا نشد — برنامه به‌صورت خودکار نسخه مناسب را هنگام اجرای سرور دانلود می‌کند.
          </p>
        ) : (
          <div className="kv">
            {javas.map((j, i) => (
              <div key={i}>
                <div className="k">
                  Java {j.major} · {j.source === 'managed' ? 'مدیریت‌شده' : 'سیستم'}
                </div>
                <div className="v" style={{ fontSize: 13 }}>
                  {j.version}
                </div>
              </div>
            ))}
          </div>
        )}
        <button className="btn sm" style={{ marginTop: 12 }} onClick={() => call('detect_java', {}).then((j) => Array.isArray(j) && setJavas(j))}>
          بارگذاری مجدد
        </button>
      </div>

      <div className="panel card" style={{ padding: 20 }}>
        <h3 style={{ marginTop: 0 }}>لودرهای پشتیبانی‌شده ({loaders.length})</h3>
        <div className="loader-grid">
          {loaders.map((l) => (
            <div className="loader-pick sel" key={l.id}>
              <h4>{l.name}</h4>
              <p>{l.description}</p>
              {l.supports_plugins && <span className="pill">پلاگین</span>}
              {l.supports_mods && <span className="pill" style={{ marginInlineStart: 4 }}>ماد</span>}
            </div>
          ))}
        </div>
        <p className="tag" style={{ marginTop: 14 }}>
          لیست نسخه‌ها به‌صورت زنده از منابع رسمی (Mojang، PaperMC، Fabric، Forge، NeoForge، Quilt) دریافت می‌شود؛ پس از انتشار هر نسخه جدید، بلافاصله در برنامه ظاهر می‌شود.
        </p>
      </div>
    </>
  )
}
