import { spawn, type ChildProcess } from 'child_process'
import * as readline from 'readline'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import type { BannedPlayer, LoaderId, LogLevel, ServerConfig, ServerInfo, ServerStatus } from '../../shared/types'
import { emit } from './bus'
import { getJson, downloadFile } from './http'
import { ensureJava, requiredJavaMajor } from './java'
import { serversDir } from './paths'

const LOG_CAP = 8000

interface Runtime {
  config: ServerConfig
  status: ServerStatus
  child: ChildProcess | null
  stdin: NodeJS.WritableStream | null
  logs: string[]
  playersOnline: number
  playersMax: number
  players: string[]
  pid: number | null
  javaPath: string | null
  javaOverride: number | null
}

export class ServerManager {
  private servers = new Map<string, Runtime>()

  constructor() {
    this.loadExisting()
  }

  private loadExisting(): void {
    const dir = serversDir()
    if (!fs.existsSync(dir)) return
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      const cfgPath = path.join(dir, e.name, 'mcss.json')
      if (!fs.existsSync(cfgPath)) continue
      try {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as ServerConfig
        this.servers.set(cfg.id, this.blankRuntime(cfg))
      } catch {
        /* ignore corrupted */
      }
    }
  }

  private blankRuntime(cfg: ServerConfig): Runtime {
    return {
      config: cfg,
      status: 'stopped',
      child: null,
      stdin: null,
      logs: [],
      playersOnline: 0,
      playersMax: 0,
      players: [],
      pid: null,
      javaPath: null,
      javaOverride: null,
    }
  }

  private toInfo(rt: Runtime): ServerInfo {
    return {
      ...rt.config,
      status: rt.status,
      players: { online: rt.playersOnline, max: rt.playersMax },
      pid: rt.pid ?? undefined,
      javaPath: rt.javaPath ?? undefined,
    }
  }

  private get(id: string): Runtime {
    const rt = this.servers.get(id)
    if (!rt) throw new Error('سرور یافت نشد')
    return rt
  }

  list(): ServerInfo[] {
    return [...this.servers.values()].map((rt) => this.toInfo(rt))
  }

  async create(params: any): Promise<ServerInfo> {
    const name: string = params.name?.trim() || 'Server'
    const loader: LoaderId = params.loader || 'vanilla'
    const version: string = params.version?.trim() || ''
    if (!name || !version) throw new Error('نام و نسخه الزامی هستند')

    const id = crypto.randomUUID()
    const dir = path.join(serversDir(), id)
    fs.mkdirSync(dir, { recursive: true })

    const cfg: ServerConfig = {
      id,
      name,
      loader,
      version,
      port: params.port ?? 25565,
      ramMb: params.ramMb ?? 2048,
      minRamMb: params.minRamMb ?? 1024,
      javaMajor: params.javaMajor ?? 0,
      onlineMode: params.onlineMode ?? false,
      motd: params.motd ?? 'A Minecraft Server',
      icon: params.icon ?? '',
      jarFile: '',
      path: dir,
      createdAt: Math.floor(Date.now() / 1000),
    }

    await this.prepare(cfg)

    fs.writeFileSync(path.join(dir, 'eula.txt'), 'eula=true\n')
    this.writeProperties(cfg)
    fs.writeFileSync(path.join(dir, 'mcss.json'), JSON.stringify(cfg, null, 2))

    const iconB64 = cfg.icon.match(/^data:image\/png;base64,(.*)$/s)
    if (iconB64) {
      try {
        fs.writeFileSync(path.join(dir, 'server-icon.png'), Buffer.from(iconB64[1], 'base64'))
      } catch {
        /* ignore */
      }
    }

    const rt = this.blankRuntime(cfg)
    this.servers.set(id, rt)
    return this.toInfo(rt)
  }

  private async prepare(cfg: ServerConfig): Promise<void> {
    const dir = cfg.path
    const phase = `آماده‌سازی ${cfg.loader}`
    emit({ event: 'download', phase, serverId: cfg.id, percent: 5, done: false })

    switch (cfg.loader) {
      case 'vanilla': {
        const m = await getJson<any>('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')
        const v = (m?.versions || []).find((x: any) => x.id === cfg.version)
        if (!v) throw new Error('نسخه یافت نشد')
        const vj = await getJson<any>(v.url)
        const jar: string | undefined = vj?.downloads?.server?.url
        if (!jar) throw new Error('لینک جار یافت نشد')
        await this.downloadWithEvents(jar, path.join(dir, 'server.jar'), cfg, 'دانلود سرور رسمی')
        cfg.jarFile = 'server.jar'
        break
      }
      case 'paper':
      case 'purpur':
      case 'folia': {
        const b = await getJson<any>(
          `https://api.papermc.io/v2/projects/${cfg.loader}/versions/${cfg.version}/builds`,
        )
        const builds: any[] = b?.builds || []
        if (builds.length === 0) throw new Error('ساخت یافت نشد')
        const last = builds[builds.length - 1]
        const jar = `${cfg.loader}-${cfg.version}-${last.build}.jar`
        const url = `https://api.papermc.io/v2/projects/${cfg.loader}/versions/${cfg.version}/builds/${last.build}/downloads/${jar}`
        await this.downloadWithEvents(url, path.join(dir, jar), cfg, `دانلود ${cfg.loader}`)
        cfg.jarFile = jar
        break
      }
      case 'fabric':
      case 'quilt':
      case 'neoforge':
      case 'forge':
        await this.prepareInstaller(cfg)
        break
      default:
        throw new Error(`لودر پشتیبانی نمی‌شود: ${cfg.loader}`)
    }

    emit({ event: 'download', phase, serverId: cfg.id, percent: 100, done: true })
  }

  private async downloadWithEvents(url: string, dest: string, cfg: ServerConfig, label: string): Promise<void> {
    emit({ event: 'download', phase: label, serverId: cfg.id, percent: 0, done: false })
    await downloadFile(url, dest, (percent) =>
      emit({ event: 'download', phase: label, serverId: cfg.id, percent, done: false }),
    )
  }

  private async prepareInstaller(cfg: ServerConfig): Promise<void> {
    const dir = cfg.path
    const major = cfg.javaMajor > 0 ? cfg.javaMajor : requiredJavaMajor(cfg.version)
    const javaExe = await ensureJava(major)

    let installerUrl: string
    switch (cfg.loader) {
      case 'fabric': {
        const iv = await getJson<any>('https://meta.fabricmc.net/v2/versions/installer')
        const ver: string = iv?.[0]?.version
        if (!ver) throw new Error('installer fabric یافت نشد')
        installerUrl = `https://maven.fabricmc.net/net/fabricmc/fabric-installer/${ver}/fabric-installer-${ver}.jar`
        break
      }
      case 'quilt': {
        const iv = await getJson<any>('https://meta.quiltmc.org/v3/versions/installer')
        const ver: string = iv?.[0]?.version
        if (!ver) throw new Error('installer quilt یافت نشد')
        installerUrl = `https://maven.quiltmc.org/repository/release/org/quiltmc/quilt-installer/${ver}/quilt-installer-${ver}.jar`
        break
      }
      case 'neoforge':
        installerUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${cfg.version}/neoforge-${cfg.version}-installer.jar`
        break
      case 'forge':
        installerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${cfg.version}/forge-${cfg.version}-installer.jar`
        break
      default:
        throw new Error('Unknown installer loader')
    }

    const installer = path.join(dir, 'installer.jar')
    await this.downloadWithEvents(installerUrl, installer, cfg, `دانلود ${cfg.loader} installer`)

    const args = ['-jar', installer]
    switch (cfg.loader) {
      case 'fabric':
        args.push('server', '-mcversion', cfg.version, '-downloadMinecraft')
        break
      case 'quilt':
        args.push('server', '-minecraft-version', cfg.version, '-download-minecraft')
        break
      default:
        args.push('--installServer')
    }

    await runInstaller(javaExe, args, dir, cfg)
    fs.rmSync(installer, { force: true })
    cfg.jarFile = ''
  }

  private writeProperties(cfg: ServerConfig): void {
    const props: [string, string][] = [
      ['server-port', String(cfg.port)],
      ['online-mode', String(cfg.onlineMode)],
      ['motd', cfg.motd],
      ['max-players', '20'],
      ['level-name', 'world'],
      ['spawn-protection', '0'],
      ['view-distance', '10'],
    ]
    const content = props.map(([k, v]) => `${k}=${v}`).join('\n') + '\n'
    fs.writeFileSync(path.join(cfg.path, 'server.properties'), content)
  }

  async start(id: string): Promise<ServerInfo> {
    const rt = this.get(id)
    if (rt.status === 'running' || rt.status === 'starting') return this.toInfo(rt)
    const cfg = rt.config
    return this.launch(rt, cfg)
  }

  private async launch(rt: Runtime, cfg: ServerConfig): Promise<ServerInfo> {
    const major = cfg.javaMajor > 0 ? cfg.javaMajor : rt.javaOverride ?? requiredJavaMajor(cfg.version)
    const javaExe = await ensureJava(major)
    const jar = this.resolveJar(cfg)

    rt.javaPath = javaExe
    rt.status = 'starting'
    emit({ event: 'status', serverId: cfg.id, status: 'starting' })

    const args = [`-Xms${cfg.minRamMb}M`, `-Xmx${cfg.ramMb}M`, '-jar', jar, 'nogui']
    let child: ChildProcess
    try {
      child = spawn(javaExe, args, { cwd: cfg.path, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (e: any) {
      rt.status = 'stopped'
      emit({ event: 'status', serverId: cfg.id, status: 'stopped' })
      throw new Error(`عدم اجرای سرور: ${e?.message || e}`)
    }

    rt.child = child
    rt.stdin = child.stdin
    rt.pid = child.pid ?? null
    rt.playersOnline = 0
    rt.playersMax = 0
    rt.status = 'running'
    emit({ event: 'status', serverId: cfg.id, status: 'running', pid: child.pid })

    if (child.stdout) this.pump(child.stdout, cfg.id, rt, false)
    if (child.stderr) this.pump(child.stderr, cfg.id, rt, true)

    child.on('exit', (code) => {
      const failedClass =
        code !== 0 && rt.logs.join('\n').match(/class file version|UnsupportedClassVersionError/i)
      if (failedClass && rt.javaOverride == null) {
        const major2 = parseRequiredMajor(rt.logs.join('\n')) ?? 21
        rt.javaOverride = major2
        rt.child = null
        rt.stdin = null
        rt.status = 'stopped'
        rt.pid = null
        emit({
          event: 'log',
          serverId: cfg.id,
          level: 'warn',
          line: `نسخه جاوا نامناسب؛ در حال دانلود JDK ${major2} و تلاش مجدد…`,
          ts: Math.floor(Date.now() / 1000),
        })
        ensureJava(major2)
          .then(() => this.start(cfg.id))
          .catch(() => {})
        return
      }
      rt.child = null
      rt.stdin = null
      rt.status = 'stopped'
      rt.pid = null
      emit({ event: 'status', serverId: cfg.id, status: 'stopped' })
      emit({
        event: 'log',
        serverId: cfg.id,
        level: 'info',
        line: `سرور متوقف شد (کد ${code})`,
        ts: Math.floor(Date.now() / 1000),
      })
    })

    return this.toInfo(rt)
  }

  private pump(stream: NodeJS.ReadableStream, id: string, rt: Runtime, isStderr: boolean): void {
    const rl = readline.createInterface({ input: stream })
    rl.on('line', (line: string) => {
      if (!line.trim()) return
      const level: LogLevel = isStderr ? 'error' : detectLevel(line)
      rt.logs.push(line)
      if (rt.logs.length > LOG_CAP) rt.logs.shift()
      const before = `${rt.playersOnline}/${rt.playersMax}`
      const playersChanged = updatePlayers(line, rt)
      emit({ event: 'log', serverId: id, level, line, ts: Math.floor(Date.now() / 1000) })
      if (playersChanged) emit({ event: 'players_list', serverId: id, names: [...rt.players] })
      if (`${rt.playersOnline}/${rt.playersMax}` !== before) {
        emit({
          event: 'players',
          serverId: id,
          online: rt.playersOnline,
          max: rt.playersMax,
        })
      }
    })
  }

  private resolveJar(cfg: ServerConfig): string {
    const dir = cfg.path
    if (cfg.jarFile) {
      const p = path.join(dir, cfg.jarFile)
      if (fs.existsSync(p)) return p
    }
    if (!fs.existsSync(dir)) throw new Error('پوشه سرور وجود ندارد')
    const entries = fs.readdirSync(dir)
    const candidates: string[] = []
    for (const name of entries) {
      const lower = name.toLowerCase()
      if (lower.includes('installer') || lower.includes('shim')) continue
      switch (cfg.loader) {
        case 'fabric':
          if (lower === 'fabric-server-launch.jar') candidates.push(path.join(dir, name))
          break
        case 'quilt':
          if (lower === 'quilt-server-launch.jar') candidates.push(path.join(dir, name))
          break
        case 'neoforge':
          if (lower.startsWith('neoforge-') && lower.endsWith('.jar')) candidates.push(path.join(dir, name))
          break
        case 'forge':
          if (lower.startsWith('forge-') && lower.endsWith('.jar')) candidates.push(path.join(dir, name))
          break
        default:
          break
      }
    }
    if (candidates.length > 0) return candidates[0]
    throw new Error('فایل اجرایی سرور پیدا نشد')
  }

  async stop(id: string, force = false): Promise<ServerInfo> {
    const rt = this.get(id)
    if (rt.child && rt.stdin) {
      if (force) {
        try {
          rt.child.kill()
        } catch {
          /* ignore */
        }
      } else {
        try {
          rt.stdin.write('stop\n')
        } catch {
          /* ignore */
        }
        rt.status = 'stopping'
      }
    }
    return this.toInfo(rt)
  }

  async restart(id: string): Promise<ServerInfo> {
    await this.stop(id, false)
    await new Promise((r) => setTimeout(r, 3000))
    return this.start(id)
  }

  async sendCommand(id: string, command: string): Promise<void> {
    const rt = this.get(id)
    if (!rt.stdin) throw new Error('سرور در حال اجرا نیست')
    rt.stdin.write(`${command}\n`)
  }

  async listPlayers(id: string): Promise<string[]> {
    const rt = this.get(id)
    if (rt.stdin) rt.stdin.write('list\n')
    return [...rt.players]
  }

  async playerAction(id: string, action: string, target: string, p: any): Promise<void> {
    const cmd = buildActionCommand(action, target, p)
    await this.sendCommand(id, cmd)
  }

  async listBanned(id: string): Promise<BannedPlayer[]> {
    const rt = this.get(id)
    const file = path.join(rt.config.path, 'banned-players.json')
    const out: BannedPlayer[] = []
    if (fs.existsSync(file)) {
      try {
        const arr = JSON.parse(fs.readFileSync(file, 'utf8')) as any[]
        for (const e of arr) {
          const name = e?.name
          if (name) out.push({ name, reason: e?.reason || '' })
        }
      } catch {
        /* ignore */
      }
    }
    return out
  }

  getLogs(id: string, tail = 0): string[] {
    const rt = this.get(id)
    if (tail <= 0) return [...rt.logs]
    return rt.logs.slice(-tail)
  }

  async delete(id: string, removeFiles = false): Promise<void> {
    const rt = this.get(id)
    try {
      rt.child?.kill()
    } catch {
      /* ignore */
    }
    if (removeFiles) {
      fs.rmSync(path.join(serversDir(), id), { recursive: true, force: true })
    }
    this.servers.delete(id)
  }

  getProperties(id: string): Record<string, string> {
    const rt = this.get(id)
    const file = path.join(rt.config.path, 'server.properties')
    const map: Record<string, string> = {}
    if (!fs.existsSync(file)) return map
    for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq >= 0) map[line.slice(0, eq).trim()] = line.slice(eq + 1)
    }
    return map
  }

  setProperty(id: string, key: string, value: string): void {
    const rt = this.get(id)
    const file = path.join(rt.config.path, 'server.properties')
    const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n') : []
    const out: string[] = []
    let found = false
    for (const line of lines) {
      const eq = line.indexOf('=')
      if (eq >= 0 && line.slice(0, eq).trim() === key) {
        out.push(`${key}=${value}`)
        found = true
        continue
      }
      out.push(line)
    }
    if (!found) out.push(`${key}=${value}`)
    fs.writeFileSync(file, out.join('\n'))
  }
}

function runInstaller(exe: string, args: string[], cwd: string, cfg: ServerConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(exe, args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    p.stderr?.on('data', (d) => {
      err += d.toString()
      if (err.length > 4000) err = err.slice(-4000)
    })
    p.on('error', reject)
    p.on('close', (code) => {
      if (code === 0) return resolve()
      reject(new Error(`نصب ${cfg.loader} ناموفق بود (کد ${code}) ${err.slice(-400)}`))
    })
  })
}

function buildActionCommand(action: string, target: string, p: any): string {
  switch (action) {
    case 'ban':
      return `ban ${target}`
    case 'pardon':
      return `pardon ${target}`
    case 'kick':
      return `kick ${target}`
    case 'op':
      return `op ${target}`
    case 'deop':
      return `deop ${target}`
    case 'gamemode':
      return `gamemode ${p.mode || 'survival'} ${target}`
    case 'tp':
      if (p.x == null || p.y == null || p.z == null) throw new Error('x، y و z لازم هستند')
      return `tp ${target} ${p.x} ${p.y} ${p.z}`
    case 'xp':
      if (p.amount == null) throw new Error('مقدار XP لازم است')
      return `xp set ${target} ${p.amount} levels`
    case 'give':
      if (!p.item) throw new Error('آیتم لازم است')
      return `give ${target} ${p.item} ${p.amount ?? 1}`
    case 'heal':
      return `effect give ${target} minecraft:instant_health 1 255`
    case 'feed':
      return `effect give ${target} minecraft:saturation 1 255`
    default:
      throw new Error('عملیات نامعتبر')
  }
}

function detectLevel(line: string): LogLevel {
  if (/<[^>]+> /.test(line) || /joined the game|left the game/.test(line)) return 'chat'
  if (line.includes('ERROR') || line.includes('[SEVERE]')) return 'error'
  if (line.includes('WARN')) return 'warn'
  if (line.includes('[DEBUG]')) return 'debug'
  return 'info'
}

function parseRequiredMajor(logs: string): number | null {
  const m = logs.match(/class file version (\d+)\.?\s*/)
  if (!m) return null
  const v = parseInt(m[1], 10)
  if (Number.isNaN(v)) return null
  return Math.max(8, v - 44)
}

function lineBefore(line: string, suffix: string): string | null {
  const idx = line.lastIndexOf(suffix)
  if (idx < 0) return null
  let name = line.slice(0, idx).trim()
  while (name.endsWith(']') || name.endsWith(':') || name.endsWith(' ')) {
    name = name.slice(0, -1).trim()
  }
  return name || null
}

function updatePlayers(line: string, rt: Runtime): boolean {
  let changed = false

  const li = line.indexOf('There are ')
  if (li >= 0) {
    const tail = line.slice(li + 10)
    const sp1 = tail.indexOf(' of a max ')
    if (sp1 >= 0) {
      const o = parseInt(tail.slice(0, sp1).trim(), 10)
      const mp = tail.slice(sp1 + 9).trim().split(' ')[0]
      if (!Number.isNaN(o)) {
        rt.playersOnline = o
        const mx = parseInt(mp, 10)
        if (!Number.isNaN(mx)) rt.playersMax = mx
      }
    } else {
      const sp2 = tail.indexOf(' players online')
      if (sp2 >= 0) {
        const num = tail.slice(0, sp2).trim()
        const slash = num.indexOf('/')
        if (slash >= 0) {
          const o = parseInt(num.slice(0, slash).trim(), 10)
          const mx = parseInt(num.slice(slash + 1).trim(), 10)
          if (!Number.isNaN(o)) rt.playersOnline = o
          if (!Number.isNaN(mx)) rt.playersMax = mx
        } else {
          const o = parseInt(num, 10)
          if (!Number.isNaN(o)) rt.playersOnline = o
        }
      }
    }
    const colo = line.lastIndexOf('online:')
    if (colo >= 0) {
      const names = line
        .slice(colo + 7)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (JSON.stringify(names) !== JSON.stringify(rt.players)) {
        rt.players = names
        changed = true
      }
    } else if (rt.players.length > 0) {
      rt.players = []
      changed = true
    }
  }

  const joined = lineBefore(line, ' joined the game')
  if (joined && !rt.players.includes(joined)) {
    rt.players.push(joined)
    changed = true
  }

  const left = lineBefore(line, ' left the game')
  if (left) {
    const pos = rt.players.indexOf(left)
    if (pos >= 0) {
      rt.players.splice(pos, 1)
      changed = true
    }
  }

  return changed
}
