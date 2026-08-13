import { api } from '../api'
import { Icon } from './Icon'

export function TitleBar() {
  return (
    <header className="titlebar">
      <div className="brand">
        <div className="logo-mark">
          <Icon name="server" size={15} />
        </div>
        <div className="brand-text">
          <span className="brand-name">MCSS</span>
          <span className="brand-by">by RADINMNX</span>
        </div>
      </div>
      <div className="win-btns">
        <button className="win-btn" title="Minimize" onClick={() => api.windowMinimize()}>
          <Icon name="minus" size={15} />
        </button>
        <button className="win-btn" title="Maximize" onClick={() => api.windowMaximize()}>
          <Icon name="maximize" size={12} />
        </button>
        <button className="win-btn close" title="Close" onClick={() => api.windowClose()}>
          <Icon name="x" size={16} />
        </button>
      </div>
    </header>
  )
}
