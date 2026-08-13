import * as fs from 'fs'
import * as path from 'path'

const UA = 'MCSS/1.0'

export async function getJson<T = any>(url: string): Promise<T> {
  const resp = await fetch(url, { headers: { 'user-agent': UA } })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} برای ${url}`)
  return (await resp.json()) as T
}

export async function getText(url: string): Promise<string> {
  const resp = await fetch(url, { headers: { 'user-agent': UA } })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} برای ${url}`)
  return resp.text()
}

export async function downloadFile(url: string, dest: string, onProgress: (pct: number) => void): Promise<void> {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const resp = await fetch(url, { headers: { 'user-agent': UA } })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} برای ${url}`)
  const total = Number(resp.headers.get('content-length') || 0)
  const body = resp.body
  if (!body) throw new Error('پاسخ دانلود خالی است')

  const reader = body.getReader()
  const ws = fs.createWriteStream(dest)
  let downloaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    downloaded += value.length
    if (!ws.write(value)) await new Promise<void>((r) => ws.once('drain', () => r()))
    onProgress(total > 0 ? Math.min(100, Math.floor((downloaded * 100) / total)) : 0)
  }
  ws.end()
  await new Promise<void>((resolve, reject) => {
    ws.on('finish', resolve)
    ws.on('error', reject)
  })
}
