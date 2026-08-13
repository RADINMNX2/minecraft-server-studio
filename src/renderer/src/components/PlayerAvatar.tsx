import { useState } from 'react'

interface Props {
  name: string
  size?: number
}

export function PlayerAvatar({ name, size = 48 }: Props) {
  const [failed, setFailed] = useState(false)
  const src = `https://mc-heads.net/avatar/${encodeURIComponent(name)}/${size * 2}`
  if (failed) {
    return (
      <div
        className="avatar-fallback"
        style={{ width: size, height: size, fontSize: size * 0.4, borderRadius: size * 0.24 }}
      >
        {name.slice(0, 1).toUpperCase()}
      </div>
    )
  }
  return (
    <img
      className="player-avatar"
      width={size}
      height={size}
      src={src}
      alt={name}
      loading="lazy"
      decoding="async"
      style={{ width: size, height: size, borderRadius: size * 0.24 }}
      onError={() => setFailed(true)}
    />
  )
}
