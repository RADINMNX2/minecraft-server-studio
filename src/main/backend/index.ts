import { ipcMain } from 'electron'
import type { LoaderId } from '../../shared/types'
import { listLoaders, listVersions } from './versions'
import { detectJavas, requiredJavaMajor } from './java'
import { ServerManager } from './servers'

let manager: ServerManager | null = null

export function registerBackendIpc(): void {
  manager = new ServerManager()
  ipcMain.handle('backend', async (_e, method: string, params: any) => {
    try {
      return await dispatch(method, params ?? {})
    } catch (err: any) {
      return { error: err?.message || String(err) }
    }
  })
}

async function dispatch(method: string, p: any): Promise<any> {
  const m = manager ?? (manager = new ServerManager())
  switch (method) {
    case 'list_loaders':
      return listLoaders()
    case 'list_versions':
      return listVersions(p.loader as LoaderId, !!p.refresh)
    case 'detect_java':
      return detectJavas()
    case 'required_java':
      return { major: requiredJavaMajor(p.version || '') }
    case 'create_server':
      return m.create(p)
    case 'list_servers':
      return m.list()
    case 'start_server':
      return m.start(p.id)
    case 'stop_server':
      return m.stop(p.id, !!p.force)
    case 'restart_server':
      return m.restart(p.id)
    case 'send_command':
      await m.sendCommand(p.id, p.command)
      return { ok: true }
    case 'get_logs':
      return { lines: m.getLogs(p.id, p.tail || 0) }
    case 'delete_server':
      await m.delete(p.id, !!p.removeFiles)
      return { ok: true }
    case 'get_properties':
      return m.getProperties(p.id)
    case 'set_property':
      m.setProperty(p.id, p.key, p.value)
      return { ok: true }
    case 'list_players':
      return m.listPlayers(p.id)
    case 'player_action':
      await m.playerAction(p.id, p.action, p.target, p)
      return { ok: true }
    case 'list_banned':
      return m.listBanned(p.id)
    default:
      throw new Error(`متد ناشناخته: ${method}`)
  }
}
