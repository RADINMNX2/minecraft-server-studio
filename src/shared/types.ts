// قرارداد مشترک بین Electron (Node) و رابط کاربری React.

export type LoaderId =
  | 'vanilla'
  | 'paper'
  | 'purpur'
  | 'folia'
  | 'fabric'
  | 'quilt'
  | 'neoforge'
  | 'forge';

export type LoaderFamily = 'vanilla' | 'paper' | 'fabric' | 'forge';

export interface LoaderMeta {
  id: LoaderId;
  name: string;
  description: string;
  family: LoaderFamily;
  supportsPlugins: boolean;
  supportsMods: boolean;
}

export interface VersionInfo {
  id: string;          // e.g. "1.21.1" or "1.21.1-rc1"
  stable: boolean;     // release vs snapshot/pre-release
  latest?: boolean;    // newest stable for this loader
}

export interface ServerConfig {
  id: string;
  name: string;
  loader: LoaderId;
  version: string;
  port: number;
  ramMb: number;
  minRamMb: number;
  javaMajor: number;
  onlineMode: boolean;
  motd: string;
  icon: string;
  jarFile: string;
  path: string;
  createdAt: number;
}

export type ServerStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

export interface ServerInfo extends ServerConfig {
  status: ServerStatus;
  players: { online: number; max: number };
  pid?: number;
  javaPath?: string;
}

export interface JavaInfo {
  major: number;
  version: string;
  path: string;            // java executable
  source: 'system' | 'managed';
}

// ---- درخواست‌های Renderer -> Main ----
export type RequestMap = {
  list_loaders: { params: Record<string, never>; result: LoaderMeta[] };
  list_versions: { params: { loader: LoaderId; refresh?: boolean }; result: VersionInfo[] };
  detect_java: { params: Record<string, never>; result: JavaInfo[] };
  create_server: {
    params: {
      name: string;
      loader: LoaderId;
      version: string;
      port?: number;
      ramMb?: number;
      minRamMb?: number;
      javaMajor?: number;
      onlineMode?: boolean;
      motd?: string;
      icon?: string;
    };
    result: ServerInfo;
  };
  list_servers: { params: Record<string, never>; result: ServerInfo[] };
  start_server: { params: { id: string }; result: ServerInfo };
  stop_server: { params: { id: string; force?: boolean }; result: ServerInfo };
  restart_server: { params: { id: string }; result: ServerInfo };
  send_command: { params: { id: string; command: string }; result: { ok: boolean } };
  get_logs: { params: { id: string; tail?: number }; result: { lines: string[] } };
  delete_server: { params: { id: string; removeFiles?: boolean }; result: { ok: boolean } };
  get_properties: { params: { id: string }; result: Record<string, string> };
  set_property: { params: { id: string; key: string; value: string }; result: { ok: boolean } };
  required_java: { params: { version: string }; result: { major: number } };
  list_players: { params: { id: string }; result: string[] };
  player_action: {
    params: {
      id: string;
      action: 'ban' | 'pardon' | 'kick' | 'op' | 'deop' | 'gamemode' | 'tp' | 'xp' | 'give' | 'heal' | 'feed';
      target: string;
      mode?: string;
      x?: number;
      y?: number;
      z?: number;
      amount?: number;
      item?: string;
    };
    result: { ok: boolean };
  };
  list_banned: { params: { id: string }; result: BannedPlayer[] };
};

export interface BannedPlayer {
  name: string;
  reason: string;
}

// ---- رویدادهای Main -> Renderer (بدون درخواست) ----
export type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'chat';

export type BackendEvent =
  | { event: 'log'; serverId: string; line: string; level: LogLevel; ts: number }
  | { event: 'status'; serverId: string; status: ServerStatus; pid?: number }
  | { event: 'players'; serverId: string; online: number; max: number }
  | { event: 'players_list'; serverId: string; names: string[] }
  | { event: 'download'; phase: string; serverId?: string; percent: number; done: boolean }
  | { event: 'java_download'; major: number; percent: number; done: boolean }
  | { event: 'error'; serverId?: string; message: string };

export interface TunnelInfo {
  urls: string[];
  active: boolean;
  error?: string;
}

export type TunnelMsg =
  | { type: 'url'; urls: string[] }
  | { type: 'error'; message: string }
  | { type: 'stopped' };

export type ToastKind = 'success' | 'error' | 'info' | 'warn';

export interface ToastMsg {
  id: number;
  text: string;
  kind: ToastKind;
}

// ---- قرارداد API که از طریق preload در معرض window قرار می‌گیرد ----
export interface MCSSApi {
  backend: <K extends keyof RequestMap>(method: K, params?: RequestMap[K]['params']) => Promise<RequestMap[K]['result'] | { error: string }>;
  tunnelStart: (port: number) => Promise<any>;
  tunnelStop: () => Promise<any>;
  selectFolder: () => Promise<string | null>;
  onBackendEvent: (cb: (e: BackendEvent) => void) => void;
  onTunnelEvent: (cb: (e: TunnelMsg) => void) => void;
  windowMinimize: () => void;
  windowMaximize: () => void;
  windowClose: () => void;
}
