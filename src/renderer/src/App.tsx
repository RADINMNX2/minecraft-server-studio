import { useEffect, useRef, useState, useCallback } from 'react'
import type { ServerInfo, LoaderMeta, BackendEvent } from '../../shared/types'
import { api, call } from './api'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { CreateServer } from './pages/CreateServer'
import { ServerDetail } from './pages/ServerDetail'
import { Settings } from './pages/Settings'

const LOG_CAP = 4000

export default function App() {
  const [view, setView] = useState('dashboard')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [servers, setServers] = useState<ServerInfo[]>([])
  const [loaders, setLoaders] = useState<LoaderMeta[]>([])
  const [logs, setLogs] = useState<Record<string, string[]>>({})
  const [progress, setProgress] = useState<{ phase: string; percent: number } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [tunnel, setTunnel] = useState<{ active: boolean; urls: string[]; error?: string }>({ active: false, urls: [] })
  const toastTimer = useRef<number>()

  const refreshServers = useCallback(async () => {
    const list = await call('list_servers', {})
    if (Array.isArray(list)) setServers(list)
  }, [])

  useEffect(() => {
    call('list_loaders', {}).then((l) => Array.isArray(l) && setLoaders(l))
    refreshServers()
  }, [refreshServers])

  useEffect(() => {
    api.onBackendEvent((ev: BackendEvent) => {
      if (!ev || typeof ev !== 'object') return
      // @ts-ignore
      const e: any = ev
      if (e.event === 'status') {
        setServers((prev) => prev.map((s) => (s.id === e.serverId ? { ...s, status: e.status, pid: e.pid ?? s.pid } : s)))
      } else if (e.event === 'players') {
        setServers((prev) => prev.map((s) => (s.id === e.serverId ? { ...s, players_online: e.online, players_max: e.max } : s)))
      } else if (e.event === 'log') {
        setLogs((prev) => {
          const arr = prev[e.serverId] ? [...prev[e.serverId]] : []
          arr.push(e.line)
          if (arr.length > LOG_CAP) arr.splice(0, arr.length - LOG_CAP)
          return { ...prev, [e.serverId]: arr }
        })
      } else if (e.event === 'download') {
        setProgress({ phase: e.phase, percent: e.percent })
        if (e.done) setTimeout(() => setProgress(null), 1500)
      } else if (e.event === 'java_download') {
        setProgress({ phase: `دانلود JDK ${e.major}`, percent: e.percent })
      } else if (e.event === 'error') {
        showToast(e.message)
      }
    })
    api.onTunnelEvent((m: any) => {
      if (m.type === 'url') setTunnel((t) => ({ ...t, active: true, urls: m.urls }))
      else if (m.type === 'error') setTunnel((t) => ({ ...t, error: m.message }))
      else if (m.type === 'stopped') setTunnel({ active: false, urls: [] })
    })
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 4000)
  }

  const selected = servers.find((s) => s.id === selectedId) || null

  return (
    <div className="app">
      <TitleBar />
      <Sidebar view={view} setView={(v) => { setSelectedId(null); setView(v) }} />
      <div className="main">
        {view === 'dashboard' && (
          <Dashboard
            servers={servers}
            loaders={loaders}
            progress={progress}
            onNew={() => setView('create')}
            onOpen={(id) => { setSelectedId(id); setView('detail') }}
            onStart={async (id) => { await call('start_server', { id }); }}
            onStop={async (id) => { await call('stop_server', { id }) }}
            onDelete={async (id) => {
              if (confirm('سرور حذف شود؟ (فایل‌ها پاک نمی‌شوند مگر انتخاب کنی)')) {
                await call('delete_server', { id, removeFiles: false })
                refreshServers()
              }
            }}
          />
        )}
        {view === 'create' && (
          <CreateServer
            loaders={loaders}
            onCreated={() => { refreshServers(); setView('dashboard') }}
            onCancel={() => setView('dashboard')}
            showToast={showToast}
          />
        )}
        {view === 'detail' && selected && (
          <ServerDetail
            server={selected}
            logs={logs[selected.id] || []}
            tunnel={tunnel}
            onBack={() => { setView('dashboard'); refreshServers() }}
            onStart={async () => { await call('start_server', { id: selected.id }) }}
            onStop={async () => { await call('stop_server', { id: selected.id }) }}
            onRestart={async () => { await call('restart_server', { id: selected.id }) }}
            onCommand={async (c) => { await call('send_command', { id: selected.id, command: c }) }}
            onTunnelStart={async () => { await api.tunnelStart(selected.port) }}
            onTunnelStop={async () => { await api.tunnelStop() }}
            showToast={showToast}
          />
        )}
        {view === 'settings' && <Settings onToast={showToast} />}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
