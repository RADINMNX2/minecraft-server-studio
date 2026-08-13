const COLORS: Record<string, string> = {
  '0': '#1c1c1c', '1': '#3b5bdb', '2': '#2f9e44', '3': '#0c8599',
  '4': '#e03131', '5': '#9c36b5', '6': '#f08c00', '7': '#adb5bd',
  '8': '#495057', '9': '#4dabf7', a: '#40c057', b: '#3bc9db',
  c: '#ff6b6b', d: '#faa2c1', e: '#ffd43b', f: '#f1f3f5',
}

function renderLine(line: string) {
  const parts: { text: string; color: string }[] = []
  let cur = '#cdd3e0'
  let buf = ''
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '§' && i + 1 < line.length) {
      if (buf) parts.push({ text: buf, color: cur })
      buf = ''
      const code = line[i + 1].toLowerCase()
      if (code === 'r') cur = '#cdd3e0'
      else if (COLORS[code]) cur = COLORS[code]
      i++
      continue
    }
    buf += ch
  }
  if (buf) parts.push({ text: buf, color: cur })
  return parts
}

export function Console({ logs, onCommand }: { logs: string[]; onCommand: (c: string) => void }) {
  const ref = (el: HTMLDivElement | null) => {
    if (el) el.scrollTop = el.scrollHeight
  }
  return (
    <>
      <div className="console" ref={ref}>
        {logs.length === 0 && <span className="c-debug">هنوز لاگی وجود ندارد…</span>}
        {logs.map((l, i) => (
          <span className="line c-info" key={i}>
            {renderLine(l).map((p, j) => (
              <span key={j} style={{ color: p.color }}>
                {p.text}
              </span>
            ))}
          </span>
        ))}
      </div>
      <form
        className="cmd-bar"
        onSubmit={(e) => {
          e.preventDefault()
          const v = (e.target as any).cmd.value
          if (v.trim()) onCommand(v.trim())
          ;(e.target as any).cmd.value = ''
        }}
      >
        <input className="input" name="cmd" placeholder="دستور را وارد کنید (مثلاً: say سلام)…" />
        <button className="btn" type="submit">
          ارسال
        </button>
      </form>
    </>
  )
}
