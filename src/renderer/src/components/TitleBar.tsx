export function TitleBar() {
  const api = (window as any).api
  return (
    <div className="titlebar">
      <div className="brand">
        <div className="logo" />
        <span>Minecraft Server Studio</span>
      </div>
      <div className="win-btns">
        <button title="Minimize" onClick={() => api.windowMinimize()}>–</button>
        <button title="Maximize" onClick={() => api.windowMaximize()}>▢</button>
        <button className="close" title="Close" onClick={() => api.windowClose()}>✕</button>
      </div>
    </div>
  )
}
