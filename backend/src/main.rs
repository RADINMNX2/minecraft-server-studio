mod http;
mod ipc;
mod java;
mod servers;
mod versions;

use std::sync::Arc;

use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, BufWriter};
use tokio::sync::Mutex;

use crate::ipc::{Request, Response};
use crate::servers::ServerManager;

#[tokio::main]
async fn main() {
    // stdout writer shared by responses and events to keep JSON lines atomic.
    let out = tokio::io::stdout();
    let out_mutex = Arc::new(Mutex::new(BufWriter::new(out)));

    let (bus, _) = tokio::sync::broadcast::channel::<Value>(4096);

    // Event forwarder: every backend event is emitted as a JSON line.
    {
        let out_mutex = out_mutex.clone();
        let mut rx = bus.subscribe();
        tokio::spawn(async move {
            while let Ok(ev) = rx.recv().await {
                let line = serde_json::to_string(&ev).unwrap_or_default();
                let mut w = out_mutex.lock().await;
                let _ = w.write_all(format!("{line}\n").as_bytes()).await;
                let _ = w.flush().await;
            }
        });
    }

    let manager = Arc::new(ServerManager::new(bus.clone()).await);

    let stdin = tokio::io::stdin();
    let mut reader = BufReader::new(stdin).lines();

    while let Ok(Some(line)) = reader.next_line().await {
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }
        let req: Request = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let id = req.id;
        let method = req.method.clone();
        let params = req.params.clone();
        let mgr = manager.clone();
        let out_mutex = out_mutex.clone();
        tokio::spawn(async move {
            let result = handle(id, &method, params, mgr).await;
            let resp = match result {
                Ok(v) => Response { id, result: Some(v), error: None },
                Err(e) => Response { id, result: None, error: Some(e) },
            };
            if let Ok(s) = serde_json::to_string(&resp) {
                let mut w = out_mutex.lock().await;
                let _ = w.write_all(format!("{s}\n").as_bytes()).await;
                let _ = w.flush().await;
            }
        });
    }
}

async fn handle(
    _id: u64,
    method: &str,
    params: Value,
    mgr: Arc<ServerManager>,
) -> Result<Value, String> {
    match method {
        "list_loaders" => Ok(serde_json::to_value(versions::list_loaders()).unwrap_or(json!([]))),
        "list_versions" => {
            let loader = params.get("loader").and_then(|v| v.as_str()).unwrap_or("");
            let refresh = params.get("refresh").and_then(|v| v.as_bool()).unwrap_or(false);
            let v = versions::list_versions(loader, refresh).await?;
            Ok(serde_json::to_value(v).unwrap_or(json!([])))
        }
        "detect_java" => Ok(serde_json::to_value(java::detect_javas()).unwrap_or(json!([]))),
        "required_java" => {
            let version = params.get("version").and_then(|v| v.as_str()).unwrap_or("");
            Ok(json!({ "major": java::required_java_major(version) }))
        }
        "create_server" => {
            let info = mgr.create(params).await?;
            Ok(serde_json::to_value(info).unwrap())
        }
        "list_servers" => {
            let list = mgr.list_servers().await;
            Ok(serde_json::to_value(list).unwrap())
        }
        "start_server" => {
            let id = params.get("id").and_then(|v| v.as_str()).ok_or("id الزامی است")?;
            let info = mgr.start(id, mgr.clone()).await?;
            Ok(serde_json::to_value(info).unwrap())
        }
        "stop_server" => {
            let id = params.get("id").and_then(|v| v.as_str()).ok_or("id الزامی است")?;
            let force = params.get("force").and_then(|v| v.as_bool()).unwrap_or(false);
            let info = mgr.stop(id, force).await?;
            Ok(serde_json::to_value(info).unwrap())
        }
        "restart_server" => {
            let id = params.get("id").and_then(|v| v.as_str()).ok_or("id الزامی است")?;
            let info = mgr.restart(id, mgr.clone()).await?;
            Ok(serde_json::to_value(info).unwrap())
        }
        "send_command" => {
            let id = params.get("id").and_then(|v| v.as_str()).ok_or("id الزامی است")?;
            let command = params.get("command").and_then(|v| v.as_str()).ok_or("command الزامی است")?;
            mgr.send_command(id, command).await?;
            Ok(json!({ "ok": true }))
        }
        "get_logs" => {
            let id = params.get("id").and_then(|v| v.as_str()).ok_or("id الزامی است")?;
            let tail = params.get("tail").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
            let lines = mgr.get_logs(id, tail).await;
            Ok(json!({ "lines": lines }))
        }
        "delete_server" => {
            let id = params.get("id").and_then(|v| v.as_str()).ok_or("id الزامی است")?;
            let remove = params.get("removeFiles").and_then(|v| v.as_bool()).unwrap_or(false);
            mgr.delete(id, remove).await?;
            Ok(json!({ "ok": true }))
        }
        "get_properties" => {
            let id = params.get("id").and_then(|v| v.as_str()).ok_or("id الزامی است")?;
            let map = mgr.get_properties(id).await?;
            Ok(serde_json::to_value(map).unwrap())
        }
        "set_property" => {
            let id = params.get("id").and_then(|v| v.as_str()).ok_or("id الزامی است")?;
            let key = params.get("key").and_then(|v| v.as_str()).ok_or("key الزامی است")?;
            let value = params.get("value").and_then(|v| v.as_str()).ok_or("value الزامی است")?;
            mgr.set_property(id, key, value).await?;
            Ok(json!({ "ok": true }))
        }
        "list_players" => {
            let id = params.get("id").and_then(|v| v.as_str()).ok_or("id الزامی است")?;
            let names = mgr.list_players(id).await?;
            Ok(serde_json::to_value(names).unwrap())
        }
        "player_action" => {
            let id = params.get("id").and_then(|v| v.as_str()).ok_or("id الزامی است")?;
            let action = params.get("action").and_then(|v| v.as_str()).ok_or("action الزامی است")?;
            let target = params.get("target").and_then(|v| v.as_str()).ok_or("target الزامی است")?;
            let mode = params.get("mode").and_then(|v| v.as_str());
            let x = params.get("x").and_then(|v| v.as_f64());
            let y = params.get("y").and_then(|v| v.as_f64());
            let z = params.get("z").and_then(|v| v.as_f64());
            let amount = params.get("amount").and_then(|v| v.as_u64()).map(|n| n as u32);
            let item = params.get("item").and_then(|v| v.as_str());
            mgr.player_action(id, action, target, mode, x, y, z, amount, item).await?;
            Ok(json!({ "ok": true }))
        }
        "list_banned" => {
            let id = params.get("id").and_then(|v| v.as_str()).ok_or("id الزامی است")?;
            let banned = mgr.list_banned(id).await?;
            let out: Vec<serde_json::Value> = banned
                .into_iter()
                .map(|(name, reason)| json!({ "name": name, "reason": reason }))
                .collect();
            Ok(serde_json::to_value(out).unwrap())
        }
        other => Err(format!("متد ناشناخته: {other}")),
    }
}
