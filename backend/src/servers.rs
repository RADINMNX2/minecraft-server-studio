use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::process::Stdio;
use tokio::fs;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command};
use tokio::sync::Mutex;

use crate::http;
use crate::java;
use crate::versions;

const LOG_CAP: usize = 8000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub id: String,
    pub name: String,
    pub loader: String,
    pub version: String,
    pub port: u32,
    pub ram_mb: u32,
    pub min_ram_mb: u32,
    pub java_major: u32,
    pub online_mode: bool,
    pub motd: String,
    #[serde(default)]
    pub icon: String,
    pub jar_file: String,
    pub path: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ServerInfo {
    #[serde(flatten)]
    pub config: ServerConfig,
    pub status: String,
    pub players_online: u32,
    pub players_max: u32,
    pub pid: Option<u32>,
    pub java_path: Option<String>,
}

struct ServerRuntime {
    config: ServerConfig,
    status: String,
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    logs: VecDeque<String>,
    players_online: u32,
    players_max: u32,
    players: Vec<String>,
    pid: Option<u32>,
    java_path: Option<String>,
    java_override: Option<u32>,
}

pub struct ServerManager {
    servers: Mutex<HashMap<String, Arc<Mutex<ServerRuntime>>>>,
    bus: tokio::sync::broadcast::Sender<Value>,
}

struct Ctx {
    id: String,
    state: Arc<Mutex<ServerRuntime>>,
    bus: tokio::sync::broadcast::Sender<Value>,
}

fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn server_dir(id: &str) -> PathBuf {
    java::servers_dir().join(id)
}

impl ServerManager {
    pub async fn new(bus: tokio::sync::broadcast::Sender<Value>) -> Self {
        let mgr = ServerManager {
            servers: Mutex::new(HashMap::new()),
            bus,
        };
        mgr.load_existing().await;
        mgr
    }

    async fn load_existing(&self) {
        let dir = java::servers_dir();
        if let Ok(mut entries) = fs::read_dir(&dir).await {
            while let Ok(Some(e)) = entries.next_entry().await {
                let p = e.path().join("mcss.json");
                if let Ok(data) = fs::read_to_string(&p).await {
                    if let Ok(cfg) = serde_json::from_str::<ServerConfig>(&data) {
                        self.servers.lock().await.insert(
                            cfg.id.clone(),
                            Arc::new(Mutex::new(ServerRuntime {
                                config: cfg,
                                status: "stopped".into(),
                                child: None,
                                stdin: None,
                                logs: VecDeque::new(),
                                players_online: 0,
                                players_max: 0,
                                players: Vec::new(),
                                pid: None,
                                java_path: None,
                                java_override: None,
                            })),
                        );
                    }
                }
            }
        }
    }

    pub async fn list_servers(&self) -> Vec<ServerInfo> {
        let mut out = Vec::new();
        for s in self.servers.lock().await.values() {
            let state = s.lock().await;
            out.push(self.to_info(&state).await);
        }
        out
    }

    async fn to_info(&self, rt: &ServerRuntime) -> ServerInfo {
        ServerInfo {
            config: rt.config.clone(),
            status: rt.status.clone(),
            players_online: rt.players_online,
            players_max: rt.players_max,
            pid: rt.pid,
            java_path: rt.java_path.clone(),
        }
    }

    pub async fn create(&self, params: Value) -> Result<ServerInfo, String> {
        let name = params.get("name").and_then(|v| v.as_str()).unwrap_or("Server").to_string();
        let loader = params.get("loader").and_then(|v| v.as_str()).unwrap_or("vanilla").to_string();
        let version = params.get("version").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if name.is_empty() || version.is_empty() {
            return Err("نام و نسخه الزامی هستند".into());
        }
        let id = uuid::Uuid::new_v4().to_string();
        let dir = server_dir(&id);
        fs::create_dir_all(&dir).await.map_err(|e| e.to_string())?;

        let ram_mb = params.get("ramMb").and_then(|v| v.as_u64()).unwrap_or(2048) as u32;
        let min_ram_mb = params.get("minRamMb").and_then(|v| v.as_u64()).unwrap_or(1024) as u32;
        let port = params.get("port").and_then(|v| v.as_u64()).unwrap_or(25565) as u32;
        let online_mode = params.get("onlineMode").and_then(|v| v.as_bool()).unwrap_or(false);
        let motd = params.get("motd").and_then(|v| v.as_str()).unwrap_or("A Minecraft Server").to_string();
        let java_major = params.get("javaMajor").and_then(|v| v.as_u64()).unwrap_or(0) as u32;

        let mut cfg = ServerConfig {
            id: id.clone(),
            name,
            loader,
            version,
            port,
            ram_mb,
            min_ram_mb,
            java_major,
            online_mode,
            motd,
            icon: params.get("icon").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            jar_file: String::new(),
            path: dir.to_string_lossy().to_string(),
            created_at: now(),
        };

        self.prepare(&mut cfg).await?;

        fs::write(dir.join("eula.txt"), "eula=true\n").await.map_err(|e| e.to_string())?;
        self.write_properties(&cfg).await?;

        let json = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
        fs::write(dir.join("mcss.json"), json).await.map_err(|e| e.to_string())?;

        if let Some(b64) = cfg.icon.strip_prefix("data:image/png;base64,") {
            if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(b64.trim()) {
                let _ = fs::write(dir.join("server-icon.png"), bytes).await;
            }
        }

        let rt = ServerRuntime {
            config: cfg.clone(),
            status: "stopped".into(),
            child: None,
            stdin: None,
            logs: VecDeque::new(),
            players_online: 0,
            players_max: 0,
            players: Vec::new(),
            pid: None,
            java_path: None,
            java_override: None,
        };
        self.servers.lock().await.insert(id, Arc::new(Mutex::new(rt)));
        let rt = self.servers.lock().await.get(&cfg.id).unwrap().clone();
        let state = rt.lock().await;
        Ok(self.to_info(&state).await)
    }

    async fn prepare(&self, cfg: &mut ServerConfig) -> Result<(), String> {
        let dir = Path::new(&cfg.path);
        let phase = format!("آماده‌سازی {}", cfg.loader);
        let _ = self.bus.send(serde_json::json!({ "event": "download", "phase": phase, "serverId": cfg.id, "percent": 5, "done": false }));

        match cfg.loader.as_str() {
            "vanilla" => {
                let m: Value = http::get_json("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json").await.map_err(|e| e.to_string())?;
                let vurl = m.get("versions").and_then(|a| a.as_array()).and_then(|arr| arr.iter().find(|v| v.get("id").and_then(|x| x.as_str()) == Some(&cfg.version))).and_then(|v| v.get("url")).and_then(|x| x.as_str()).ok_or("نسخه یافت نشد")?;
                let vj: Value = http::get_json(vurl).await.map_err(|e| e.to_string())?;
                let jar = vj.get("downloads").and_then(|d| d.get("server")).and_then(|s| s.get("url")).and_then(|x| x.as_str()).ok_or("لینک جار یافت نشد")?;
                self.download_with_events(jar, &dir.join("server.jar"), cfg, "دانلود سرور رسمی").await?;
                cfg.jar_file = "server.jar".into();
            }
            "paper" | "purpur" | "folia" => {
                let proj = &cfg.loader;
                let b: Value = http::get_json(&format!("https://api.papermc.io/v2/projects/{proj}/versions/{ver}/builds", proj = proj, ver = cfg.version)).await.map_err(|e| e.to_string())?;
                let builds = b.get("builds").and_then(|x| x.as_array()).ok_or("ساخت یافت نشد")?;
                let last = builds.last().and_then(|x| x.get("build").and_then(|y| y.as_u64())).ok_or("آخرین build یافت نشد")?;
                let jar = format!("{proj}-{ver}-{build}.jar", proj = proj, ver = cfg.version, build = last);
                let url = format!("https://api.papermc.io/v2/projects/{proj}/versions/{ver}/builds/{build}/downloads/{jar}", proj = proj, ver = cfg.version, build = last, jar = jar);
                self.download_with_events(&url, &dir.join(&jar), cfg, &format!("دانلود {proj}")).await?;
                cfg.jar_file = jar;
            }
            "fabric" | "quilt" | "neoforge" | "forge" => {
                self.prepare_installer(cfg).await?;
            }
            other => return Err(format!("لودر پشتیبانی نمی‌شود: {other}")),
        }

        let _ = self.bus.send(serde_json::json!({ "event": "download", "phase": phase, "serverId": cfg.id, "percent": 100, "done": true }));
        Ok(())
    }

    async fn prepare_installer(&self, cfg: &mut ServerConfig) -> Result<(), String> {
        let dir = Path::new(&cfg.path);
        let major = if cfg.java_major > 0 { cfg.java_major } else { java::required_java_major(&cfg.version) };
        let java_exe = java::ensure_java(major, &self.bus).await.map_err(|e| e.to_string())?;
        let installer = match cfg.loader.as_str() {
            "fabric" => {
                let iv: Value = http::get_json("https://meta.fabricmc.net/v2/versions/installer").await.map_err(|e| e.to_string())?;
                let ver = iv.get(0).and_then(|x| x.get("version")).and_then(|x| x.as_str()).ok_or("installer fabric یافت نشد")?;
                let url = format!("https://maven.fabricmc.net/net/fabricmc/fabric-installer/{v}/fabric-installer-{v}.jar", v = ver);
                let path = dir.join("installer.jar");
                self.download_with_events(&url, &path, cfg, "دانلود Fabric installer").await?;
                path
            }
            "quilt" => {
                let iv: Value = http::get_json("https://meta.quiltmc.org/v3/versions/installer").await.map_err(|e| e.to_string())?;
                let ver = iv.get(0).and_then(|x| x.get("version")).and_then(|x| x.as_str()).ok_or("installer quilt یافت نشد")?;
                let url = format!("https://maven.quiltmc.org/repository/release/org/quiltmc/quilt-installer/{v}/quilt-installer-{v}.jar", v = ver);
                let path = dir.join("installer.jar");
                self.download_with_events(&url, &path, cfg, "دانلود Quilt installer").await?;
                path
            }
            "neoforge" => {
                let url = format!("https://maven.neoforged.net/releases/net/neoforged/neoforge/{v}/neoforge-{v}-installer.jar", v = cfg.version);
                let path = dir.join("installer.jar");
                self.download_with_events(&url, &path, cfg, "دانلود NeoForge installer").await?;
                path
            }
            "forge" => {
                let url = format!("https://maven.minecraftforge.net/net/minecraftforge/forge/{v}/forge-{v}-installer.jar", v = cfg.version);
                let path = dir.join("installer.jar");
                self.download_with_events(&url, &path, cfg, "دانلود Forge installer").await?;
                path
            }
            _ => return Err("Unknown installer loader".into()),
        };

        let mut cmd = Command::new(&java_exe);
        cmd.arg("-jar").arg(&installer).current_dir(dir);
        match cfg.loader.as_str() {
            "fabric" => { cmd.args(["server", "-mcversion", &cfg.version, "-downloadMinecraft"]); }
            "quilt" => { cmd.args(["server", "-minecraft-version", &cfg.version, "-download-minecraft"]); }
            "neoforge" | "forge" => { cmd.arg("--installServer"); }
            _ => {}
        }
        let status = cmd.status().await.map_err(|e| format!("اجرای installer شکست خورد: {e}"))?;
        if !status.success() {
            return Err(format!("نصب {0} ناموفق بود (کد {1})", cfg.loader, status));
        }
        let _ = fs::remove_file(&installer).await;
        cfg.jar_file = String::new();
        Ok(())
    }

    async fn download_with_events(&self, url: &str, dest: &Path, cfg: &ServerConfig, label: &str) -> Result<(), String> {
        http::download_file(url, dest, |pct, _| {
            let _ = self.bus.send(serde_json::json!({
                "event": "download", "phase": label, "serverId": cfg.id, "percent": pct, "done": false
            }));
        })
        .await
        .map_err(|e| format!("دانلود {label}: {e}"))?;
        Ok(())
    }

    async fn write_properties(&self, cfg: &ServerConfig) -> Result<(), String> {
        let dir = Path::new(&cfg.path);
        let props = vec![
            ("server-port", cfg.port.to_string()),
            ("online-mode", cfg.online_mode.to_string()),
            ("motd", cfg.motd.clone()),
            ("max-players", "20".to_string()),
            ("level-name", "world".to_string()),
            ("spawn-protection", "0".to_string()),
            ("view-distance", "10".to_string()),
        ];
        let mut content = String::new();
        for (k, v) in props {
            content.push_str(&format!("{k}={v}\n"));
        }
        fs::write(dir.join("server.properties"), content).await.map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn start(&self, id: &str, mgr: Arc<ServerManager>) -> Result<ServerInfo, String> {
        let rt = self.servers.lock().await.get(id).cloned().ok_or("سرور یافت نشد")?;
        {
            let state = rt.lock().await;
            if state.status == "running" || state.status == "starting" {
                return Ok(self.to_info(&state).await);
            }
        }
        let cfg = rt.lock().await.config.clone();
        self.launch(&rt, &cfg, mgr).await
    }

    async fn launch(&self, rt: &Arc<Mutex<ServerRuntime>>, cfg: &ServerConfig, mgr: Arc<ServerManager>) -> Result<ServerInfo, String> {
        // Resolve Java version (explicit > override > auto).
        let major = {
            let st = rt.lock().await;
            if cfg.java_major > 0 {
                cfg.java_major
            } else if let Some(o) = st.java_override {
                o
            } else {
                java::required_java_major(&cfg.version)
            }
        };
        let java_exe = java::ensure_java(major, &self.bus).await.map_err(|e| e.to_string())?;

        let jar = self.resolve_jar(cfg, Path::new(&cfg.path)).await?;

        {
            let mut st = rt.lock().await;
            st.java_path = Some(java_exe.to_string_lossy().to_string());
            st.status = "starting".to_string();
        }
        let _ = self.bus.send(serde_json::json!({ "event": "status", "serverId": cfg.id, "status": "starting" }));

        let mut cmd = Command::new(&java_exe);
        cmd.arg(format!("-Xms{}M", cfg.min_ram_mb))
            .arg(format!("-Xmx{}M", cfg.ram_mb))
            .arg("-jar")
            .arg(&jar)
            .arg("nogui")
            .current_dir(Path::new(&cfg.path))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| format!("عدم اجرای سرور: {e}"))?;
        let stdout: ChildStdout = child.stdout.take().ok_or("stdout مفقود")?;
        let stderr: ChildStderr = child.stderr.take().ok_or("stderr مفقود")?;
        let stdin = child.stdin.take();

        let pid = child.id();
        {
            let mut st = rt.lock().await;
            st.child = Some(child);
            st.stdin = stdin;
            st.pid = pid;
            st.status = "running".to_string();
            st.players_online = 0;
            st.players_max = 0;
        }
        let _ = self.bus.send(serde_json::json!({ "event": "status", "serverId": cfg.id, "status": "running", "pid": pid }));

        let ctx = Ctx { id: cfg.id.clone(), state: rt.clone(), bus: self.bus.clone() };
        let ctx1 = Ctx { id: cfg.id.clone(), state: rt.clone(), bus: self.bus.clone() };

        // Background task: wait for process exit + auto-recover incompatible Java.
        let rt2 = rt.clone();
        let bus2 = self.bus.clone();
        let mgr2 = mgr.clone();
        let id2 = cfg.id.clone();
        tokio::spawn(async move {
            let code = {
                let mut st = rt2.lock().await;
                if let Some(c) = st.child.as_mut() {
                    c.wait().await.ok().map(|s| s.code().unwrap_or(-1))
                } else {
                    None
                }
            };
            let mut st = rt2.lock().await;
            let failed_class = code != Some(0)
                && st.logs.iter().any(|l| l.contains("class file version") || l.contains("UnsupportedClassVersionError"));
            if failed_class && st.java_override.is_none() {
                let major = parse_required_major(&st.logs.iter().cloned().collect::<String>()).unwrap_or(21);
                st.java_override = Some(major);
                st.child = None;
                st.stdin = None;
                st.status = "stopped".to_string();
                st.pid = None;
                drop(st);
                let _ = bus2.send(serde_json::json!({ "event": "log", "serverId": id2, "level": "warn", "line": format!("نسخه جاوا نامناسب؛ در حال دانلود JDK {major} و تلاش مجدد…"), "ts": now() }));
                let _ = java::ensure_java(major, &bus2).await;
                let _ = mgr2.start(&id2, mgr2.clone()).await;
                return;
            }
            st.child = None;
            st.stdin = None;
            st.status = "stopped".to_string();
            st.pid = None;
            drop(st);
            let _ = bus2.send(serde_json::json!({ "event": "status", "serverId": id2, "status": "stopped" }));
            let _ = bus2.send(serde_json::json!({ "event": "log", "serverId": id2, "level": "info", "line": format!("سرور متوقف شد (کد {code:?})"), "ts": now() }));
        });

        tokio::spawn(async move { pump(stdout, ctx, false).await });
        tokio::spawn(async move { pump(stderr, ctx1, true).await });

        let state = rt.lock().await;
        Ok(self.to_info(&state).await)
    }

    async fn resolve_jar(&self, cfg: &ServerConfig, dir: &Path) -> Result<PathBuf, String> {
        if !cfg.jar_file.is_empty() {
            let p = dir.join(&cfg.jar_file);
            if p.exists() {
                return Ok(p);
            }
        }
        let mut entries = fs::read_dir(dir).await.map_err(|e| e.to_string())?;
        let mut candidates: Vec<PathBuf> = Vec::new();
        while let Ok(Some(e)) = entries.next_entry().await {
            let name = e.file_name().to_string_lossy().to_lowercase();
            if name.contains("installer") || name.contains("shim") {
                continue;
            }
            match cfg.loader.as_str() {
                "fabric" if name == "fabric-server-launch.jar" => candidates.push(e.path()),
                "quilt" if name == "quilt-server-launch.jar" => candidates.push(e.path()),
                "neoforge" if name.starts_with("neoforge-") && name.ends_with(".jar") => candidates.push(e.path()),
                "forge" if name.starts_with("forge-") && name.ends_with(".jar") => candidates.push(e.path()),
                _ => {}
            }
        }
        candidates.into_iter().next().ok_or_else(|| "فایل اجرایی سرور پیدا نشد".into())
    }

    pub async fn stop(&self, id: &str, force: bool) -> Result<ServerInfo, String> {
        let rt = self.servers.lock().await.get(id).cloned().ok_or("سرور یافت نشد")?;
        let mut state = rt.lock().await;
        if let Some(child) = state.child.as_mut() {
            if force {
                let _ = child.start_kill();
            } else {
                if let Some(stdin) = state.stdin.as_mut() {
                    let _ = stdin.write_all(b"stop\n").await;
                    let _ = stdin.flush().await;
                }
                state.status = "stopping".to_string();
            }
        }
        Ok(self.to_info(&state).await)
    }

    pub async fn restart(&self, id: &str, mgr: Arc<ServerManager>) -> Result<ServerInfo, String> {
        self.stop(id, false).await?;
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        self.start(id, mgr).await
    }

    pub async fn send_command(&self, id: &str, command: &str) -> Result<(), String> {
        let rt = self.servers.lock().await.get(id).cloned().ok_or("سرور یافت نشد")?;
        let mut state = rt.lock().await;
        if let Some(stdin) = state.stdin.as_mut() {
            stdin.write_all(format!("{command}\n").as_bytes()).await.map_err(|e| e.to_string())?;
            stdin.flush().await.map_err(|e| e.to_string())?;
            Ok(())
        } else {
            Err("سرور در حال اجرا نیست".into())
        }
    }

    pub async fn list_players(&self, id: &str) -> Result<Vec<String>, String> {
        let rt = self.servers.lock().await.get(id).cloned().ok_or("سرور یافت نشد")?;
        {
            let mut state = rt.lock().await;
            if state.stdin.is_some() {
                let _ = state.stdin.as_mut().unwrap().write_all(b"list\n").await;
                let _ = state.stdin.as_mut().unwrap().flush().await;
            }
        }
        let state = rt.lock().await;
        Ok(state.players.clone())
    }

    pub async fn player_action(
        &self,
        id: &str,
        action: &str,
        target: &str,
        mode: Option<&str>,
        x: Option<f64>,
        y: Option<f64>,
        z: Option<f64>,
        amount: Option<u32>,
        item: Option<&str>,
    ) -> Result<(), String> {
        let cmd = match action {
            "ban" => format!("ban {target}"),
            "pardon" => format!("pardon {target}"),
            "kick" => format!("kick {target}"),
            "op" => format!("op {target}"),
            "deop" => format!("deop {target}"),
            "gamemode" => {
                let m = mode.unwrap_or("survival");
                format!("gamemode {m} {target}")
            }
            "tp" => {
                let (x, y, z) = (x.ok_or("x لازم است")?, y.ok_or("y لازم است")?, z.ok_or("z لازم است")?);
                format!("tp {target} {x} {y} {z}")
            }
            "xp" => {
                let n = amount.ok_or("مقدار XP لازم است")?;
                format!("xp set {target} {n} levels")
            }
            "give" => {
                let item = item.ok_or("آیتم لازم است")?;
                let n = amount.unwrap_or(1);
                format!("give {target} {item} {n}")
            }
            "heal" => format!("effect give {target} minecraft:instant_health 1 255"),
            "feed" => format!("effect give {target} minecraft:saturation 1 255"),
            _ => return Err("عملیات نامعتبر".into()),
        };
        self.send_command(id, &cmd).await
    }

    pub async fn list_banned(&self, id: &str) -> Result<Vec<(String, String)>, String> {
        let rt = self.servers.lock().await.get(id).cloned().ok_or("سرور یافت نشد")?;
        let state = rt.lock().await;
        let dir = Path::new(&state.config.path);
        let path = dir.join("banned-players.json");
        let content = fs::read_to_string(&path).await.unwrap_or_else(|_| "[]".into());
        let arr: serde_json::Value = serde_json::from_str(&content).unwrap_or(serde_json::Value::Array(vec![]));
        let mut out = Vec::new();
        if let Some(arr) = arr.as_array() {
            for e in arr {
                let name = e.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let reason = e.get("reason").and_then(|v| v.as_str()).unwrap_or("").to_string();
                if !name.is_empty() {
                    out.push((name, reason));
                }
            }
        }
        Ok(out)
    }

    pub async fn get_logs(&self, id: &str, tail: usize) -> Vec<String> {
        if let Some(rt) = self.servers.lock().await.get(id) {
            let state = rt.lock().await;
            if tail == 0 {
                state.logs.iter().cloned().collect()
            } else {
                state.logs.iter().rev().take(tail).rev().cloned().collect()
            }
        } else {
            Vec::new()
        }
    }

    pub async fn delete(&self, id: &str, remove_files: bool) -> Result<(), String> {
        let rt = self.servers.lock().await.get(id).cloned().ok_or("سرور یافت نشد")?;
        {
            let mut state = rt.lock().await;
            if let Some(c) = state.child.as_mut() {
                let _ = c.start_kill();
            }
        }
        if remove_files {
            let _ = fs::remove_dir_all(server_dir(id)).await;
        }
        self.servers.lock().await.remove(id);
        Ok(())
    }

    pub async fn get_properties(&self, id: &str) -> Result<HashMap<String, String>, String> {
        let rt = self.servers.lock().await.get(id).cloned().ok_or("سرور یافت نشد")?;
        let state = rt.lock().await;
        let dir = Path::new(&state.config.path);
        let content = fs::read_to_string(dir.join("server.properties")).await.unwrap_or_default();
        let mut map = HashMap::new();
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some(eq) = line.find('=') {
                map.insert(line[..eq].to_string(), line[eq + 1..].to_string());
            }
        }
        Ok(map)
    }

    pub async fn set_property(&self, id: &str, key: &str, value: &str) -> Result<(), String> {
        let rt = self.servers.lock().await.get(id).cloned().ok_or("سرور یافت نشد")?;
        let state = rt.lock().await;
        let dir = Path::new(&state.config.path);
        let path = dir.join("server.properties");
        let content = fs::read_to_string(&path).await.unwrap_or_default();
        let mut lines: Vec<String> = Vec::new();
        let mut found = false;
        for line in content.lines() {
            if let Some(eq) = line.find('=') {
                if line[..eq].trim() == key {
                    lines.push(format!("{key}={value}"));
                    found = true;
                    continue;
                }
            }
            lines.push(line.to_string());
        }
        if !found {
            lines.push(format!("{key}={value}"));
        }
        fs::write(&path, lines.join("\n")).await.map_err(|e| e.to_string())?;
        Ok(())
    }
}

fn parse_required_major(logs: &str) -> Option<u32> {
    if let Some(idx) = logs.find("class file version") {
        let tail = &logs[idx..];
        let parts: Vec<&str> = tail.split_whitespace().collect();
        // "...class file version 69.0 ..."
        if let Some(pos) = parts.iter().position(|p| *p == "version") {
            if let Some(num) = parts.get(pos + 1) {
                let v: u32 = num.trim_end_matches('.').parse().ok()?;
                return Some(v.saturating_sub(44));
            }
        }
    }
    None
}

async fn pump<R: AsyncRead + Unpin>(stream: R, ctx: Ctx, is_stderr: bool) {
    let mut reader = BufReader::new(stream).lines();
    while let Ok(Some(line)) = reader.next_line().await {
        let level = if is_stderr { "error" } else { detect_level(&line) };
        let (changed, names) = {
            let mut st = ctx.state.lock().await;
            if st.logs.len() >= LOG_CAP {
                st.logs.pop_front();
            }
            st.logs.push_back(line.clone());
            let changed = update_players(&line, &mut st);
            let names = st.players.clone();
            (changed, names)
        };
        let _ = ctx.bus.send(serde_json::json!({
            "event": "log", "serverId": ctx.id, "level": level, "line": line, "ts": now()
        }));
        if changed {
            let _ = ctx.bus.send(serde_json::json!({
                "event": "players_list", "serverId": ctx.id, "names": names
            }));
        }
    }
}

fn detect_level(line: &str) -> &'static str {
    if line.contains("ERROR") || line.contains("[SEVERE]") {
        "error"
    } else if line.contains("WARN") {
        "warn"
    } else if line.contains("[DEBUG]") {
        "debug"
    } else {
        "info"
    }
}

fn line_before(line: &str, suffix: &str) -> Option<String> {
    if let Some(idx) = line.rfind(suffix) {
        let mut name = line[..idx].trim();
        while name.ends_with(']') || name.ends_with(':') || name.ends_with(' ') {
            name = name[..name.len() - 1].trim();
        }
        if !name.is_empty() {
            return Some(name.to_string());
        }
    }
    None
}

fn update_players(line: &str, st: &mut ServerRuntime) -> bool {
    let mut changed = false;
    if let Some(idx) = line.find("There are ") {
        let tail = &line[idx + 10..];
        if let Some(sp) = tail.find(" of a max ") {
            if let Ok(o) = tail[..sp].trim().parse::<u32>() {
                st.players_online = o;
                if let Some(mp) = tail[sp + 9..].trim().split(' ').next() {
                    if let Ok(m) = mp.parse::<u32>() {
                        st.players_max = m;
                    }
                }
            }
        } else if let Some(sp) = tail.find(" players online") {
            let numpart = tail[..sp].trim();
            if let Some(slash) = numpart.find('/') {
                if let (Ok(o), Ok(m)) = (numpart[..slash].trim().parse::<u32>(), numpart[slash + 1..].trim().parse::<u32>()) {
                    st.players_online = o;
                    st.players_max = m;
                }
            } else if let Ok(o) = numpart.parse::<u32>() {
                st.players_online = o;
            }
        }
        if let Some(colo) = line.rfind("online:") {
            let names_part = &line[colo + 7..];
            let names: Vec<String> = names_part
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            if names != st.players {
                st.players = names;
                changed = true;
            }
        } else if !st.players.is_empty() {
            st.players = Vec::new();
            changed = true;
        }
    }
    if let Some(name) = line_before(line, " joined the game") {
        if !st.players.contains(&name) {
            st.players.push(name);
            changed = true;
        }
    }
    if let Some(name) = line_before(line, " left the game") {
        if let Some(pos) = st.players.iter().position(|p| p == &name) {
            st.players.remove(pos);
            changed = true;
        }
    }
    changed
}
