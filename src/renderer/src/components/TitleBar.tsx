export function TitleBar() {
  const api = (window as any).api
  return (
    <div className="titlebar">
      <div className="brand">
        <div className="logo" />
        <div className="brand-text">
          <span className="brand-name">MCSS</span>
          <span className="brand-by">by RADINMNX</span>
        </div>
      </div>
      <div className="win-btns">
        <button title="Minimize" onClick={() => api.window.minimize()}>–</button>
        <button title="Maximize" onClick={() => api.window.maximize()}>▢</button>
        <button className="close" title="Close" onClick={() => api.window.close()}>✕</button>
      </div>
    </div>
  )
}
