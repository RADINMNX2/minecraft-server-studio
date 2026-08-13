use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;

use crate::http;

#[derive(Debug, Clone, Serialize)]
pub struct LoaderMeta {
    pub id: String,
    pub name: String,
    pub description: String,
    pub family: String,
    pub supports_plugins: bool,
    pub supports_mods: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct VersionInfo {
    pub id: String,
    pub stable: bool,
    #[serde(default)]
    pub latest: bool,
}

pub fn list_loaders() -> Vec<LoaderMeta> {
    vec![
        LoaderMeta { id: "vanilla".into(), name: "Vanilla (رسمی)".into(), description: "سرور رسمی Mojang بدون تغییر".into(), family: "vanilla".into(), supports_plugins: false, supports_mods: false },
        LoaderMeta { id: "paper".into(), name: "Paper".into(), description: "بهینه‌سازی شده، سازگار با پلاگین Bukkit/Spigot".into(), family: "paper".into(), supports_plugins: true, supports_mods: false },
        LoaderMeta { id: "purpur".into(), name: "Purpur".into(), description: "فورک Paper با ویژگی‌های بیشتر".into(), family: "paper".into(), supports_plugins: true, supports_mods: false },
        LoaderMeta { id: "folia".into(), name: "Folia".into(), description: "سرور چندهسته‌ای با performance بالا".into(), family: "paper".into(), supports_plugins: true, supports_mods: false },
        LoaderMeta { id: "fabric".into(), name: "Fabric".into(), description: "لودر مدرن مادها (Mods)".into(), family: "fabric".into(), supports_plugins: false, supports_mods: true },
        LoaderMeta { id: "quilt".into(), name: "Quilt".into(), description: "جایگزین مدرن Fabric".into(), family: "fabric".into(), supports_plugins: false, supports_mods: true },
        LoaderMeta { id: "neoforge".into(), name: "NeoForge".into(), description: "فورک مدرن Forge برای نسخه‌های جدید".into(), family: "forge".into(), supports_plugins: false, supports_mods: true },
        LoaderMeta { id: "forge".into(), name: "Forge".into(), description: "لودر کلاسیک مادها".into(), family: "forge".into(), supports_plugins: false, supports_mods: true },
    ]
}

type Cache = HashMap<String, (Instant, Vec<VersionInfo>)>;
fn cache() -> &'static Mutex<Cache> {
    static C: OnceLock<Mutex<Cache>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

pub async fn list_versions(loader: &str, refresh: bool) -> Result<Vec<VersionInfo>, String> {
    if !refresh {
        if let Some(v) = cache().lock().unwrap().get(loader) {
            if v.0.elapsed() < Duration::from_secs(300) {
                return Ok(v.1.clone());
            }
        }
    }
    let versions = match loader {
        "vanilla" => vanilla().await,
        "paper" => papermc("paper").await,
        "purpur" => papermc("purpur").await,
        "folia" => papermc("folia").await,
        "fabric" => fabric().await,
        "quilt" => quilt().await,
        "neoforge" => neoforge().await,
        "forge" => forge().await,
        other => Err(format!("لودر ناشناخته: {other}")),
    }?;
    cache().lock().unwrap().insert(loader.to_string(), (Instant::now(), versions.clone()));
    Ok(versions)
}

async fn vanilla() -> Result<Vec<VersionInfo>, String> {
    let m: Value = http::get_json("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json").await.map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    let mut latest_release = String::new();
    if let Some(v) = m.get("latest").and_then(|x| x.get("release")).and_then(|x| x.as_str()) {
        latest_release = v.to_string();
    }
    if let Some(arr) = m.get("versions").and_then(|x| x.as_array()) {
        for v in arr {
            let id = v.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let t = v.get("type").and_then(|x| x.as_str()).unwrap_or("");
            let stable = t == "release";
            let latest = id == latest_release;
            out.push(VersionInfo { id, stable, latest });
        }
    }
    // releases first, then snapshots
    out.sort_by(|a, b| {
        match (a.stable, b.stable) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => b.id.cmp(&a.id),
        }
    });
    Ok(out)
}

async fn papermc(project: &str) -> Result<Vec<VersionInfo>, String> {
    let url = format!("https://api.papermc.io/v2/projects/{project}");
    let j: Value = http::get_json(&url).await.map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    if let Some(arr) = j.get("versions").and_then(|x| x.as_array()) {
        let n = arr.len();
        for (i, v) in arr.iter().enumerate() {
            if let Some(id) = v.as_str() {
                out.push(VersionInfo { id: id.to_string(), stable: true, latest: i + 1 == n });
            }
        }
    }
    out.reverse(); // newest first
    Ok(out)
}

async fn fabric() -> Result<Vec<VersionInfo>, String> {
    let j: Value = http::get_json("https://meta.fabricmc.net/v2/versions/game").await.map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    if let Some(arr) = j.as_array() {
        for v in arr {
            let id = v.get("version").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let stable = v.get("stable").and_then(|x| x.as_bool()).unwrap_or(false);
            out.push(VersionInfo { id, stable, latest: false });
        }
    }
    out.sort_by(|a, b| match (a.stable, b.stable) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => b.id.cmp(&a.id),
    });
    if let Some(f) = out.first_mut() {
        f.latest = true;
    }
    Ok(out)
}

async fn quilt() -> Result<Vec<VersionInfo>, String> {
    let j: Value = http::get_json("https://meta.quiltmc.org/v3/versions/game").await.map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    if let Some(arr) = j.as_array() {
        for v in arr {
            let id = v.get("version").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let stable = v.get("stable").and_then(|x| x.as_bool()).unwrap_or(false);
            out.push(VersionInfo { id, stable, latest: false });
        }
    }
    out.sort_by(|a, b| match (a.stable, b.stable) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => b.id.cmp(&a.id),
    });
    if let Some(f) = out.first_mut() {
        f.latest = true;
    }
    Ok(out)
}

async fn neoforge() -> Result<Vec<VersionInfo>, String> {
    let j: Value = http::get_json("https://api.neoforged.net/v1/neoforge/").await.map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    if let Some(arr) = j.as_array() {
        for (i, v) in arr.iter().enumerate() {
            if let Some(id) = v.as_str() {
                out.push(VersionInfo { id: id.to_string(), stable: true, latest: i == 0 });
            }
        }
    }
    Ok(out)
}

async fn forge() -> Result<Vec<VersionInfo>, String> {
    let xml = http::get_text("https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml").await.map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for cap in xml.split("<version>").skip(1) {
        if let Some(end) = cap.find("</version>") {
            let id = cap[..end].trim().to_string();
            if id.is_empty() { continue; }
            out.push(VersionInfo { id, stable: true, latest: false });
        }
    }
    out.reverse();
    if let Some(f) = out.first_mut() {
        f.latest = true;
    }
    Ok(out)
}
