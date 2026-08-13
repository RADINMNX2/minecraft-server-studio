import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'

let mainWindow: BrowserWindow | null = null
let backend: ChildProcess | null = null
const pending = new Map<number, (resp: any) => void>()
let reqId = 1

// -------------------- Rust backend lifecycle --------------------
function backendPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bin', 'mcss_backend.exe')
  }
  const base = path.join(__dirname, '..', '..', 'backend')
  const release = path.join(base, 'target', 'release', 'mcss_backend.exe')
  const debug = path.join(base, 'target', 'debug', 'mcss_backend.exe')
  return fs.existsSync(release) ? release : debug
}

function startBackend() {
  const exe = backendPath()
  if (!fs.existsSync(exe)) {
    console.error('Rust backend not found at', exe)
    return
  }
  backend = spawn(exe, [], { stdio: ['pipe', 'pipe', 'pipe'] })
  let buf = ''
  backend.stdout?.on('data', (chunk: Buffer) => {
    buf += chunk.toString()
    let idx: number
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line) continue
      try {
        const obj = JSON.parse(line)
        if ('event' in obj) {
          mainWindow?.webContents.send('backend:event', obj)
        } else if ('id' in obj) {
          const r = pending.get(obj.id)
          if (r) {
            pending.delete(obj.id)
            r(obj)
          }
        }
      } catch {
        /* ignore */
      }
    }
  })
  backend.stderr?.on('data', (d) => console.error('[rust]', d.toString()))
  backend.on('exit', (c) => console.log('backend exited', c))
}

function sendRequest(method: string, params: any): Promise<any> {
  return new Promise((resolve) => {
    if (!backend || !backend.stdin) {
      resolve({ error: 'backend offline' })
      return
    }
    const id = reqId++
    pending.set(id, resolve)
    backend.stdin.write(JSON.stringify({ id, method, params }) + '\n')
  })
}

// -------------------- Tunnel (online access) --------------------
let tunnelObj: any = null
let tunnelActive = false

async function startTunnel(port: number) {
  if (tunnelActive) return { active: true }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { pinggy } = require('@pinggy/pinggy')
    tunnelObj = await pinggy.forward({
      forwarding: `tcp://localhost:${port}`,
      serverAddress: 'free.pinggy.io:443',
    })
    const urls = await tunnelObj.urls()
    tunnelActive = true
    mainWindow?.webContents.send('tunnel:event', { type: 'url', urls })
  } catch (e: any) {
    mainWindow?.webContents.send('tunnel:event', {
      type: 'error',
      message: e?.message ? e.message : String(e),
    })
  }
  return { active: tunnelActive }
}

function stopTunnel() {
  try {
    tunnelObj?.stop?.()
  } catch {
    /* ignore */
  }
  tunnelObj = null
  tunnelActive = false
  mainWindow?.webContents.send('tunnel:event', { type: 'stopped' })
}

// -------------------- Window --------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#0b0e14',
    titleBarStyle: 'hidden',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  mainWindow.on('closed', () => (mainWindow = null))
}

// -------------------- IPC --------------------
ipcMain.handle('backend', (_e, method: string, params: any) => sendRequest(method, params))
ipcMain.handle('tunnel:start', (_e, port: number) => startTunnel(port))
ipcMain.handle('tunnel:stop', () => {
  stopTunnel()
  return { active: false }
})
ipcMain.handle('dialog:folder', async () => {
  const r = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] })
  return r.filePaths[0] || null
})
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())

app.whenReady().then(() => {
  startBackend()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopTunnel()
  backend?.kill()
  if (process.platform !== 'darwin') app.quit()
})
