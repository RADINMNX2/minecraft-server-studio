import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { BackendEvent, LoaderMeta, ServerInfo, ToastKind, ToastMsg, TunnelInfo } from '../../shared/types'
import { api, call } from './api'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { ProgressToast, Skeleton, Toast } from './components/Feedback'

const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const CreateServer = lazy(() => import('./pages/CreateServer').then((m) => ({ default: m.CreateServer })))
const ServerDetail = lazy(() => import('./pages/ServerDetail').then((m) => ({ default: m.ServerDetail })))
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })))

const LOG_CAP = 4000

type View = 'dashboard' | 'create' | 'detail' | 'settings'

let toastId = 1

function PageFallback() {
  return (
    <div className="page page-loading">
      <Skeleton className="sk-head" />
      <Skeleton className="sk-card" />
      <Skeleton className="sk-card" />
    </div>
  )
}

export default function App() {
  const [view, setView] = useState<View>('dashboard')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [servers, setServers] = useState<ServerInfo[]>([])
  const [loaders, setLoaders] = useState<LoaderMeta[]>([])
  const [logs, setLogs] = useState<Record<string, string[]>>({})
  const [playersMap, setPlayersMap] = useState<Record<string, string[]>>({})
  const [progress, setProgress] = useState<{ phase: string; percent: number } | null>(null)
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const [tunnel, setTunnel] = useState<TunnelInfo>({ active: false, urls: [] })
  const progressTimer = useRef<number>()

  const refreshServers = useCallback(async () => {
    const list = await call('list_servers')
    if (Array.isArray(list)) setServers(list as ServerInfo[])
  }, [])

  const showToast = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = toastId++
    setToasts((prev) => [...prev.slice(-3), { id, text, kind }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4200)
  }, [])

  useEffect(() => {
    call('list_loaders').then((l) => Array.isArray(l) && setLoaders(l as LoaderMeta[]))
    refreshServers()
  }, [refreshServers])

  useEffect(() => {
    api.onBackendEvent((ev: BackendEvent) => {
      const e = ev as any
      switch (e.event) {
        case 'status':
          setServers((prev) =>
            prev.map((s) => (s.id === e.serverId ? { ...s, status: e.status, pid: e.pid ?? s.pid } : s)),
          )
          break
        case 'players':
          setServers((prev) =>
            prev.map((s) =>
              s.id === e.serverId ? { ...s, players: { online: e.online, max: e.max } } : s,
            ),
          )
          break
        case 'players_list':
          setPlayersMap((prev) => ({ ...prev, [e.serverId]: e.names }))
          break
        case 'log':
          setLogs((prev) => {
            const arr = prev[e.serverId] ? [...prev[e.serverId]] : []
            arr.push(e.line)
            if (arr.length > LOG_CAP) arr.splice(0, arr.length - LOG_CAP)
            return { ...prev, [e.serverId]: arr }
          })
          break
        case 'download':
          setProgress({ phase: e.phase, percent: e.percent })
          if (e.done) {
            window.clearTimeout(progressTimer.current)
            progressTimer.current = window.setTimeout(() => setProgress(null), 1600)
          }
          break
        case 'java_download':
          setProgress({ phase: `دانلود JDK ${e.major}`, percent: e.percent })
          if (e.done) {
            window.clearTimeout(progressTimer.current)
            progressTimer.current = window.setTimeout(() => setProgress(null), 1600)
          }
          break
        case 'error':
          showToast(e.message, 'error')
          break
      }
    })

    api.onTunnelEvent((m: any) => {
      if (m.type === 'url') setTunnel((t) => ({ ...t, active: true, urls: m.urls, error: undefined }))
      else if (m.type === 'error') {
        setTunnel((t) => ({ ...t, active: false, error: m.message }))
        showToast(m.message, 'error')
      } else if (m.type === 'stopped') setTunnel({ active: false, urls: [], error: undefined })
    })
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const openServer = useCallback((id: string) => {
    setSelectedId(id)
    setView('detail')
    call('get_logs', { id, tail: 400 }).then((r: any) => {
      if (r && Array.isArray(r.lines)) {
        setLogs((prev) => ({ ...prev, [id]: r.lines as string[] }))
      }
    })
  }, [])

  const goDashboard = useCallback(() => {
    setView('dashboard')
    refreshServers()
  }, [refreshServers])

  const selected = servers.find((s) => s.id === selectedId) || null
  const runningCount = servers.filter((s) => s.status === 'running').length
  const onlineTotal = servers.reduce((sum, s) => sum + s.players.online, 0)

  return (
    <div className="app">
      <TitleBar />
      <div className="app-body">
        <Sidebar
          view={view}
          servers={servers.length}
          running={runningCount}
          online={onlineTotal}
          onNavigate={(v) => {
            setSelectedId(null)
            setView(v as View)
          }}
        />
        <main className="main" key={view}>
          <Suspense fallback={<PageFallback />}>
            {view === 'dashboard' && (
              <Dashboard
                servers={servers}
                loaders={loaders}
                running={runningCount}
                online={onlineTotal}
                onNew={() => setView('create')}
                onOpen={openServer}
                onStart={async (id) => {
                  const r = await call('start_server', { id })
                  if (r && 'error' in r) showToast(r.error, 'error')
                }}
                onStop={async (id) => {
                  const r = await call('stop_server', { id })
                  if (r && 'error' in r) showToast(r.error, 'error')
                }}
                onDelete={async (id) => {
                  await call('delete_server', { id, removeFiles: false })
                  refreshServers()
                  showToast('سرور حذف شد', 'success')
                }}
                showToast={showToast}
              />
            )}
            {view === 'create' && (
              <CreateServer
                loaders={loaders}
                onCreated={() => {
                  refreshServers()
                  setView('dashboard')
                }}
                onCancel={goDashboard}
                showToast={showToast}
              />
            )}
            {view === 'detail' && selected && (
              <ServerDetail
                server={selected}
                logs={logs[selected.id] || []}
                tunnel={tunnel}
                players={playersMap[selected.id] || []}
                onBack={goDashboard}
                onStart={async () => {
                  const r = await call('start_server', { id: selected.id })
                  if (r && 'error' in r) showToast(r.error, 'error')
                }}
                onStop={async () => {
                  const r = await call('stop_server', { id: selected.id })
                  if (r && 'error' in r) showToast(r.error, 'error')
                }}
                onRestart={async () => {
                  const r = await call('restart_server', { id: selected.id })
                  if (r && 'error' in r) showToast(r.error, 'error')
                }}
                onCommand={async (c) => {
                  const r = await call('send_command', { id: selected.id, command: c })
                  if (r && 'error' in r) showToast(r.error, 'error')
                }}
                onTunnelStart={async () => {
                  await api.tunnelStart(selected.port)
                }}
                onTunnelStop={async () => {
                  await api.tunnelStop()
                }}
                showToast={showToast}
              />
            )}
            {view === 'settings' && <Settings showToast={showToast} />}
          </Suspense>
        </main>
      </div>
      <ProgressToast progress={progress} />
      <div className="toast-stack">
        {toasts.map((t) => (
          <Toast key={t.id} t={t} onDismiss={dismissToast} />
        ))}
      </div>
    </div>
  )
}
