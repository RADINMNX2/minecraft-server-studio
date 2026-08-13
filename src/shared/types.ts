// Shared IPC contract between Electron (Node) <-> Rust backend <-> React renderer.

export type LoaderId =
  | 'vanilla'
  | 'paper'
  | 'purpur'
  | 'folia'
  | 'fabric'
  | 'quilt'
  | 'neoforge'
  | 'forge';

export interface LoaderMeta {
  id: LoaderId;
  name: string;
  description: string;
  family: 'vanilla' | 'paper' | 'fabric' | 'forge';
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
  javaMajor: number;       // requested Java major (0 = auto)
  onlineMode: boolean;
  motd: string;
  path: string;            // absolute directory
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

// ---- Requests (Electron -> Rust) ----
export interface ReqListLoaders { method: 'list_loaders'; params: Record<string, never> }
export interface ReqListVersions { method: 'list_versions'; params: { loader: LoaderId; refresh?: boolean } }
export interface ReqDetectJava { method: 'detect_java'; params: Record<string, never> }
export interface ReqCreateServer {
  method: 'create_server';
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
  };
}
export interface ReqListServers { method: 'list_servers'; params: Record<string, never> }
export interface ReqStartServer { method: 'start_server'; params: { id: string } }
export interface ReqStopServer { method: 'stop_server'; params: { id: string; force?: boolean } }
export interface ReqRestartServer { method: 'restart_server'; params: { id: string } }
export interface ReqSendCommand { method: 'send_command'; params: { id: string; command: string } }
export interface ReqGetLogs { method: 'get_logs'; params: { id: string; tail?: number } }
export interface ReqDeleteServer { method: 'delete_server'; params: { id: string; removeFiles?: boolean } }
export interface ReqGetProperties { method: 'get_properties'; params: { id: string } }
export interface ReqSetProperty { method: 'set_property'; params: { id: string; key: string; value: string } }
export interface ReqGetJavaForVersion { method: 'required_java'; params: { version: string } }

export type BackendRequest =
  | ReqListLoaders | ReqListVersions | ReqDetectJava | ReqCreateServer
  | ReqListServers | ReqStartServer | ReqStopServer | ReqRestartServer
  | ReqSendCommand | ReqGetLogs | ReqDeleteServer | ReqGetProperties
  | ReqSetProperty | ReqGetJavaForVersion;

export type RequestMap = {
  list_loaders: { params: ReqListLoaders['params']; result: LoaderMeta[] };
  list_versions: { params: ReqListVersions['params']; result: VersionInfo[] };
  detect_java: { params: ReqDetectJava['params']; result: JavaInfo[] };
  create_server: { params: ReqCreateServer['params']; result: ServerInfo };
  list_servers: { params: ReqListServers['params']; result: ServerInfo[] };
  start_server: { params: ReqStartServer['params']; result: ServerInfo };
  stop_server: { params: ReqStopServer['params']; result: ServerInfo };
  restart_server: { params: ReqRestartServer['params']; result: ServerInfo };
  send_command: { params: ReqSendCommand['params']; result: { ok: boolean } };
  get_logs: { params: ReqGetLogs['params']; result: { lines: string[] } };
  delete_server: { params: ReqDeleteServer['params']; result: { ok: boolean } };
  get_properties: { params: ReqGetProperties['params']; result: Record<string, string> };
  set_property: { params: ReqSetProperty['params']; result: { ok: boolean } };
  required_java: { params: ReqGetJavaForVersion['params']; result: { major: number } };
};

// ---- Events (Rust -> Electron, unsolicited) ----
export type BackendEvent =
  | { event: 'log'; serverId: string; line: string; level: LogLevel; ts: number }
  | { event: 'status'; serverId: string; status: ServerStatus; pid?: number }
  | { event: 'players'; serverId: string; online: number; max: number }
  | { event: 'download'; phase: string; serverId?: string; percent: number; done: boolean }
  | { event: 'java_download'; major: number; percent: number; done: boolean }
  | { event: 'error'; serverId?: string; message: string };

export type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'chat';

export interface TunnelInfo {
  urls: string[];
  active: boolean;
}

export type TunnelMsg =
  | { type: 'url'; urls: string[] }
  | { type: 'error'; message: string }
  | { type: 'stopped' };
