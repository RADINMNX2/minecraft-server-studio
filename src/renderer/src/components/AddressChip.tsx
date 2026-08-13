import { useState } from 'react'

interface Props {
  value: string
  label?: string
  primary?: boolean
}

export function AddressChip({ value, label, primary }: Props) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    let ok = false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
        ok = true
      }
    } catch {
      ok = false
    }
    if (!ok) {
      try {
        const ta = document.createElement('textarea')
        ta.value = value
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        ok = true
      } catch {
        ok = false
      }
    }
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    }
  }
  return (
    <button
      className={`addr-chip${primary ? ' primary' : ''}`}
      onClick={copy}
      title={`کپی: ${value}`}
    >
      <span className="dot" />
      {label && <span className="lbl">{label}</span>}
      <span className="val">{value}</span>
      <span className="copy">{copied ? 'کپی شد ✓' : 'کپی'}</span>
    </button>
  )
}
