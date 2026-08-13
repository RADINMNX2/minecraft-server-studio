import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import AdmZip from 'adm-zip'
import type { JavaInfo } from '../../shared/types'
import { emit } from './bus'
import { downloadFile } from './http'
import { javaStore } from './paths'

export function requiredJavaMajor(version: string): number {
  const parts = version.split('.').map((s) => parseInt(s, 10) || 0)
  const a = parts[0] || 1
  if (a >= 2 && a <= 9) return 8
  if (a === 1) {
    const b = parts[1] || 0
    const c = parts[2] || 0
    if (b <= 16) return 8
    if (b <= 19) return 17
    if (b === 20) return c >= 5 ? 21 : 17
    return 21
  }
  return 21
}

function parseMajor(output: string): number | null {
  for (const line of output.split('\n')) {
    const l = line.trim()
    if (l.startsWith('java.specification.version')) {
      const v = l.split('=')[1]?.trim()
      const n = parseFloat(v)
      if (!Number.isNaN(n)) return Math.floor(n)
    }
  }
  const m = output.match(/java\.version\s*=\s*"?([\d.]+)/)
  if (m) {
    const n = parseFloat(m[1])
    if (!Number.isNaN(n)) return Math.floor(n)
  }
  return null
}

function runJavaVersion(javaPath: string): JavaInfo | null {
  try {
    const r = spawnSync(javaPath, ['-XshowSettings:properties', '-version'], { encoding: 'utf8' })
    if (r.status !== 0) return null
    const combined = (r.stdout || '') + (r.stderr || '')
    const major = parseMajor(combined)
    if (major == null) return null
    const version =
      combined
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.startsWith('java.version'))
        ?.split('=')[1]
        ?.trim() || 'unknown'
    return { major, version, path: javaPath, source: 'system' }
  } catch {
    return null
  }
}

export function detectJavas(): JavaInfo[] {
  const found: JavaInfo[] = []

  const r = spawnSync('java', ['-version'], { encoding: 'utf8' })
  if (r.status === 0) {
    const combined = (r.stdout || '') + (r.stderr || '')
    const major = parseMajor(combined)
    if (major != null) {
      const version = combined.split('\n').find((l) => l.trim())?.trim() || ''
      found.push({ major, version, path: 'java', source: 'system' })
    }
  }

  const store = javaStore()
  if (fs.existsSync(store)) {
    for (const e of fs.readdirSync(store, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      const p = path.join(store, e.name, 'bin', 'java.exe')
      if (fs.existsSync(p)) {
        const info = runJavaVersion(p)
        if (info) found.push({ ...info, source: 'managed' })
      }
    }
  }

  found.sort((a, b) => b.major - a.major)
  const dedup: JavaInfo[] = []
  const seen = new Set<number>()
  for (const j of found) {
    if (!seen.has(j.major)) {
      seen.add(j.major)
      dedup.push(j)
    }
  }
  return dedup
}

export async function ensureJava(major: number): Promise<string> {
  const javas = detectJavas()
  const sys = javas.find((j) => j.major >= major)
  if (sys) return sys.path

  const store = javaStore()
  const target = path.join(store, `jdk-${major}`, 'bin', 'java.exe')
  if (fs.existsSync(target)) return target

  fs.mkdirSync(store, { recursive: true })
  const url = `https://api.adoptium.net/v3/binary/latest/${major}/ga/windows/x64/jdk/hotspot/normal/eclipse`
  const zipPath = path.join(store, `jdk-${major}.zip`)

  emit({ event: 'java_download', major, percent: 0, done: false })
  await downloadFile(url, zipPath, (percent) => emit({ event: 'java_download', major, percent, done: false }))

  extractZip(zipPath, path.join(store, `jdk-${major}`))
  emit({ event: 'java_download', major, percent: 100, done: true })

  fs.rmSync(zipPath, { force: true })
  if (!fs.existsSync(target)) throw new Error('استخراج JDK ناموفق بود')
  return target
}

function extractZip(zipPath: string, dest: string): void {
  const zip = new AdmZip(zipPath)
  const entries = zip.getEntries()
  const firstFile = entries.find((e) => !e.isDirectory && e.entryName.includes('/'))?.entryName || entries[0]?.entryName || ''
  const top = firstFile.split('/')[0]
  fs.mkdirSync(dest, { recursive: true })
  for (const e of entries) {
    let rel = e.entryName
    if (top && e.entryName.startsWith(top)) rel = e.entryName.slice(top.length).replace(/^[/\\]+/, '')
    if (!rel) continue
    const out = path.join(dest, ...rel.split('/'))
    if (e.isDirectory) {
      fs.mkdirSync(out, { recursive: true })
      continue
    }
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, e.getData())
  }
}
