import type { LoaderId, LoaderMeta, VersionInfo } from '../../shared/types'
import { getJson, getText } from './http'

const CACHE_TTL = 5 * 60 * 1000
const cache = new Map<string, { at: number; v: VersionInfo[] }>()

export function listLoaders(): LoaderMeta[] {
  return [
    { id: 'vanilla', name: 'Vanilla', description: 'سرور رسمی Mojang بدون تغییر', family: 'vanilla', supportsPlugins: false, supportsMods: false },
    { id: 'paper', name: 'Paper', description: 'بهینه‌سازی‌شده، سازگار با پلاگین Bukkit/Spigot', family: 'paper', supportsPlugins: true, supportsMods: false },
    { id: 'purpur', name: 'Purpur', description: 'فورک Paper با ویژگی‌های بیشتر', family: 'paper', supportsPlugins: true, supportsMods: false },
    { id: 'folia', name: 'Folia', description: 'سرور چند‌هسته‌ای با عملکرد بالا', family: 'paper', supportsPlugins: true, supportsMods: false },
    { id: 'fabric', name: 'Fabric', description: 'لودر مدرن مادها (Mods)', family: 'fabric', supportsPlugins: false, supportsMods: true },
    { id: 'quilt', name: 'Quilt', description: 'جایگزین مدرن Fabric', family: 'fabric', supportsPlugins: false, supportsMods: true },
    { id: 'neoforge', name: 'NeoForge', description: 'فورک مدرن Forge برای نسخه‌های جدید', family: 'forge', supportsPlugins: false, supportsMods: true },
    { id: 'forge', name: 'Forge', description: 'لودر کلاسیک مادها', family: 'forge', supportsPlugins: false, supportsMods: true },
  ]
}

export async function listVersions(loader: LoaderId, refresh = false): Promise<VersionInfo[]> {
  if (!refresh) {
    const c = cache.get(loader)
    if (c && Date.now() - c.at < CACHE_TTL) return c.v
  }
  const v = await fetchVersions(loader)
  cache.set(loader, { at: Date.now(), v })
  return v
}

async function fetchVersions(loader: LoaderId): Promise<VersionInfo[]> {
  switch (loader) {
    case 'vanilla':
      return vanilla()
    case 'paper':
      return papermc('paper')
    case 'purpur':
      return papermc('purpur')
    case 'folia':
      return papermc('folia')
    case 'fabric':
      return fabricOrQuilt('https://meta.fabricmc.net/v2/versions/game')
    case 'quilt':
      return fabricOrQuilt('https://meta.quiltmc.org/v3/versions/game')
    case 'neoforge':
      return neoforge()
    case 'forge':
      return forge()
    default:
      throw new Error(`لودر ناشناخته: ${loader}`)
  }
}

async function vanilla(): Promise<VersionInfo[]> {
  const m = await getJson<any>('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')
  const latestRelease: string = m?.latest?.release || ''
  const out: VersionInfo[] = []
  for (const v of m?.versions || []) {
    const stable = v.type === 'release'
    out.push({ id: v.id, stable, latest: v.id === latestRelease })
  }
  out.sort(byStableThenId)
  return out
}

async function papermc(project: string): Promise<VersionInfo[]> {
  const j = await getJson<any>(`https://api.papermc.io/v2/projects/${project}`)
  const arr: string[] = j?.versions || []
  const out = arr.map((id, i) => ({ id, stable: true, latest: i + 1 === arr.length }))
  out.reverse()
  return out
}

async function fabricOrQuilt(url: string): Promise<VersionInfo[]> {
  const j = await getJson<any>(url)
  const out: VersionInfo[] = (j || []).map((v: any) => ({
    id: v.version,
    stable: !!v.stable,
    latest: false,
  }))
  out.sort(byStableThenId)
  if (out.length > 0) out[0].latest = true
  return out
}

async function neoforge(): Promise<VersionInfo[]> {
  const j = await getJson<any>('https://api.neoforged.net/v1/neoforge/')
  return (j || []).map((id: string, i: number) => ({ id, stable: true, latest: i === 0 }))
}

async function forge(): Promise<VersionInfo[]> {
  const xml = await getText('https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml')
  const out: VersionInfo[] = []
  const re = /<version>([^<]+)<\/version>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const id = m[1].trim()
    if (id) out.push({ id, stable: true, latest: false })
  }
  out.reverse()
  if (out.length > 0) out[0].latest = true
  return out
}

function byStableThenId(a: VersionInfo, b: VersionInfo): number {
  if (a.stable !== b.stable) return a.stable ? -1 : 1
  return b.id.localeCompare(a.id, undefined, { numeric: true })
}
