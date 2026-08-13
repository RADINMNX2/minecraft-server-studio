interface Props {
  name: string
  size?: number
}

export function PlayerAvatar({ name, size = 48 }: Props) {
  const src = `https://mc-heads.net/avatar/${encodeURIComponent(name)}/${size * 2}`
  return (
    <img
      className="player-avatar"
      width={size}
      height={size}
      src={src}
      alt={name}
      style={{ width: size, height: size }}
      onError={(e) => {
        const t = e.currentTarget
        t.style.display = 'none'
        const parent = t.parentElement
        if (parent && !parent.querySelector('.avatar-fallback')) {
          const f = document.createElement('div')
          f.className = 'player-avatar avatar-fallback'
          f.style.width = size + 'px'
          f.style.height = size + 'px'
          f.textContent = name.slice(0, 1).toUpperCase()
          parent.appendChild(f)
        }
      }}
    />
  )
}
