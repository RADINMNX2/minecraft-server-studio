import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import * as path from 'path'
import { registerBackendIpc } from './backend'
import { onEvent } from './backend/bus'

let mainWindow: BrowserWindow | null = null

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
    width: 1360,
    height: 860,
    minWidth: 1020,
    minHeight: 660,
    backgroundColor: '#05070d',
    titleBarStyle: 'hidden',
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173')
    // mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  mainWindow.on('closed', () => (mainWindow = null))
}

// -------------------- IPC --------------------
function registerIpc() {
  registerBackendIpc()

  onEvent((ev) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backend:event', ev)
    }
  })

  ipcMain.handle('tunnel:start', (_e, port: number) => startTunnel(port))
  ipcMain.handle('tunnel:stop', () => {
    stopTunnel()
    return { active: false }
  })
  ipcMain.handle('dialog:folder', async () => {
    if (!mainWindow) return null
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
    return r.filePaths[0] || null
  })
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.on('window:close', () => mainWindow?.close())
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopTunnel()
  if (process.platform !== 'darwin') app.quit()
})
