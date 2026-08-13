import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { BackendEvent, TunnelMsg } from '../shared/types'

export interface MCSSApi {
  backend: (method: string, params?: any) => Promise<any>
  tunnelStart: (port: number) => Promise<any>
  tunnelStop: () => Promise<any>
  selectFolder: () => Promise<string | null>
  onBackendEvent: (cb: (e: BackendEvent) => void) => void
  onTunnelEvent: (cb: (e: TunnelMsg) => void) => void
  windowMinimize: () => void
  windowMaximize: () => void
  windowClose: () => void
}

const api: MCSSApi = {
  backend: (method, params) => ipcRenderer.invoke('backend', method, params ?? {}),
  tunnelStart: (port) => ipcRenderer.invoke('tunnel:start', port),
  tunnelStop: () => ipcRenderer.invoke('tunnel:stop'),
  selectFolder: () => ipcRenderer.invoke('dialog:folder'),
  onBackendEvent: (cb) => {
    const handler = (_e: IpcRendererEvent, e: BackendEvent) => cb(e)
    ipcRenderer.on('backend:event', handler)
  },
  onTunnelEvent: (cb) => {
    const handler = (_e: IpcRendererEvent, e: TunnelMsg) => cb(e)
    ipcRenderer.on('tunnel:event', handler)
  },
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close'),
}

contextBridge.exposeInMainWorld('api', api)
