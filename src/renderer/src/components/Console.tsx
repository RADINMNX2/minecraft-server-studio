import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

const COLORS: Record<string, string> = {
  '0': '#1c1c1c', '1': '#3b5bdb', '2': '#2f9e44', '3': '#0c8599',
  '4': '#e03131', '5': '#9c36b5', '6': '#f08c00', '7': '#adb5bd',
  '8': '#495057', '9': '#4dabf7', a: '#40c057', b: '#3bc9db',
  c: '#ff6b6b', d: '#faa2c1', e: '#ffd43b', f: '#f1f3f5',
}
const DEFAULT_COLOR = '#cdd3e0'

interface Part {
  text: string
  color: string
}

function renderLine(line: string): Part[] {
  const parts: Part[] = []
  let cur = DEFAULT_COLOR
  let buf = ''
  const flush = () => {
    if (buf) parts.push({ text: buf, color: cur })
    buf = ''
  }
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '§' && i + 1 < line.length) {
      flush()
      const code = line[i + 1].toLowerCase()
      if (code === 'r') cur = DEFAULT_COLOR
      else if (COLORS[code]) cur = COLORS[code]
      i++
      continue
    }
    buf += ch
  }
  flush()
  return parts
}

export function Console({ logs, onCommand }: { logs: string[]; onCommand: (c: string) => void }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [cmd, setCmd] = useState('')

  useEffect(() => {
    const el = boxRef.current
    if (el && autoScroll) el.scrollTop = el.scrollHeight
  }, [logs, autoScroll])

  return (
    <div className="console-wrap">
      <div className="console-toolbar">
        <div className="console-dots">
          <span className="cd red" />
          <span className="cd yellow" />
          <span className="cd green" />
        </div>
        <span className="console-title">Server Console</span>
        <button
          className={'console-follow' + (autoScroll ? ' active' : '')}
          onClick={() => setAutoScroll((v) => !v)}
          title="اسکرول خودکار"
        >
          <Icon name="chevronRight" size={13} />
          {autoScroll ? 'دنبال‌کردن' : 'متوقف'}
        </button>
      </div>
      <div className="console" ref={boxRef}>
        {logs.length === 0 && <span className="console-empty">هنوز لاگی وجود ندارد…</span>}
        {logs.map((l, i) => (
          <div className="console-line" key={i}>
            {renderLine(l).map((p, j) => (
              <span key={j} style={{ color: p.color }}>
                {p.text}
              </span>
            ))}
          </div>
        ))}
      </div>
      <form
        className="cmd-bar"
        onSubmit={(e) => {
          e.preventDefault()
          if (cmd.trim()) {
            onCommand(cmd.trim())
            setCmd('')
          }
        }}
      >
        <span className="cmd-prompt">›</span>
        <input
          className="cmd-input"
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          placeholder="دستور را وارد کنید… (مثلاً: say سلام)"
          autoComplete="off"
          spellCheck={false}
        />
        <button className="btn cmd-send" type="submit" disabled={!cmd.trim()}>
          <Icon name="send" size={14} />
          ارسال
        </button>
      </form>
    </div>
  )
}
