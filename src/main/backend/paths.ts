import { app } from 'electron'
import * as path from 'path'

export function dataDir(): string {
  if (process.env.MCSS_DATA_DIR) return process.env.MCSS_DATA_DIR
  return path.join(app.getPath('appData'), 'com', 'mcss', 'MCSS')
}

export function serversDir(): string {
  return path.join(dataDir(), 'servers')
}

export function javaStore(): string {
  return path.join(dataDir(), 'java')
}
