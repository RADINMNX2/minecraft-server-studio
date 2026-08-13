use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;
use serde_json::Value;

use crate::http;

#[derive(Debug, Clone, Serialize)]
pub struct JavaInfo {
    pub major: u32,
    pub version: String,
    pub path: String,
    pub source: String,
}

pub fn data_dir() -> PathBuf {
    let base = std::env::var("MCSS_DATA_DIR").unwrap_or_default();
    if !base.is_empty() {
        return PathBuf::from(base);
    }
    if let Some(proj) = directories::ProjectDirs::from("com", "mcss", "MCSS") {
        proj.data_dir().to_path_buf()
    } else {
        PathBuf::from(".").join("mcss-data")
    }
}

pub fn servers_dir() -> PathBuf {
    data_dir().join("servers")
}

pub fn java_store() -> PathBuf {
    data_dir().join("java")
}

/// Map a Minecraft version to the minimum Java major version it requires.
pub fn required_java_major(version: &str) -> u32 {
    let parts: Vec<&str> = version.split('.').collect();
    let a: u32 = parts.first().and_then(|s| s.parse().ok()).unwrap_or(1);
    if a >= 2 && a <= 9 {
        return 8; // old "1.x"
    }
    if a == 1 {
        let b: u32 = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
        let c: u32 = parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);
        return match b {
            0..=16 => 8,
            17..=19 => 17,
            20 => {
                if c >= 5 {
                    21
                } else {
                    17
                }
            }
            _ => 21,
        };
    }
    // New versioning (e.g. 26.2) — default to 21; auto-recovery handles higher.
    21
}

fn parse_major(output: &str) -> Option<u32> {
    for line in output.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("java.specification.version") {
            if let Some(v) = rest.split('=').nth(1) {
                if let Ok(m) = v.trim().parse::<f32>() {
                    return Some(m as u32);
                }
            }
        }
    }
    // fallback: java.version = 21.0.4
    if let Some(idx) = output.find("java.version") {
        let tail = &output[idx..];
        if let Some(eq) = tail.find('=') {
            let v = tail[eq + 1..].trim().split_whitespace().next().unwrap_or("");
            if let Ok(f) = v.parse::<f32>() {
                return Some(f as u32);
            }
        }
    }
    None
}

fn run_java_version(java: &Path) -> Option<JavaInfo> {
    let out = Command::new(java)
        .arg("-XshowSettings:properties")
        .arg("-version")
        .output()
        .ok()?;
    let combined = format!(
        "{} {}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    let major = parse_major(&combined)?;
    let version = combined
        .lines()
        .find_map(|l| l.trim().strip_prefix("java.version = "))
        .unwrap_or("unknown")
        .to_string();
    Some(JavaInfo {
        major,
        version,
        path: java.to_string_lossy().to_string(),
        source: "system".into(),
    })
}

pub fn detect_javas() -> Vec<JavaInfo> {
    let mut found: Vec<JavaInfo> = Vec::new();

    // PATH java
    if let Ok(out) = Command::new("java").arg("-version").output() {
        let combined = format!(
            "{} {}",
            String::from_utf8_lossy(&out.stdout),
            String::from_utf8_lossy(&out.stderr)
        );
        if let Some(major) = parse_major(&combined) {
            let version = combined
                .lines()
                .next()
                .unwrap_or("")
                .to_string();
            found.push(JavaInfo {
                major,
                version,
                path: "java".into(),
                source: "system".into(),
            });
        }
    }

    // Managed JDKs
    let store = java_store();
    if let Ok(entries) = std::fs::read_dir(&store) {
        for e in entries.flatten() {
            let p = e.path().join("bin").join("java.exe");
            if p.exists() {
                if let Some(info) = run_java_version(&p) {
                    found.push(JavaInfo { source: "managed".into(), ..info });
                }
            }
        }
    }

    found.sort_by(|a, b| b.major.cmp(&a.major));
    found.dedup_by(|a, b| a.major == b.major);
    found
}

/// Return a java executable that satisfies `major` (>=), downloading if needed.
pub async fn ensure_java(major: u32, bus: &tokio::sync::broadcast::Sender<Value>) -> anyhow::Result<PathBuf> {
    let javas = detect_javas();
    if let Some(j) = javas.iter().find(|j| j.major >= major) {
        return Ok(PathBuf::from(&j.path));
    }

    let store = java_store();
    let target = store.join(format!("jdk-{major}")).join("bin").join("java.exe");
    if target.exists() {
        return Ok(target);
    }

    // Download Adoptium JDK of the requested major.
    let url = format!(
        "https://api.adoptium.net/v3/binary/latest/{major}/ga/windows/x64/jdk/hotspot/normal/eclipse"
    );
    let zip_path = store.join(format!("jdk-{major}.zip"));
    tokio::fs::create_dir_all(&store).await.ok();
    http::download_file(&url, &zip_path, |pct, _| {
        let _ = bus.send(serde_json::json!({
            "event": "java_download", "major": major, "percent": pct, "done": false
        }));
    })
    .await
    .map_err(|e| anyhow::anyhow!("دانلود JDK {major}: {e}"))?;

    let extract_to = store.join(format!("jdk-{major}"));
    tokio::fs::create_dir_all(&extract_to).await.ok();
    extract_zip(&zip_path, &extract_to)?;

    let _ = bus.send(serde_json::json!({
        "event": "java_download", "major": major, "percent": 100, "done": true
    }));

    tokio::fs::remove_file(&zip_path).await.ok();
    Ok(target)
}

fn extract_zip(zip_path: &Path, dest: &Path) -> anyhow::Result<()> {
    let file = std::fs::File::open(zip_path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    // The Adoptium zip wraps everything in a single top-level folder; strip it.
    let strip = archive
        .by_index(0)
        .ok()
        .and_then(|f| {
            let name = f.name();
            name.trim_end_matches('/').rsplit('/').next().map(|s| s.to_string())
        });
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let name = entry.name().to_string();
        let rel = match &strip {
            Some(s) => name.strip_prefix(s).unwrap_or(&name).trim_start_matches('/').to_string(),
            None => name,
        };
        if rel.is_empty() {
            continue;
        }
        let out_path = dest.join(&rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path)?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut buf = Vec::with_capacity(entry.size() as usize);
            std::io::Read::read_to_end(&mut entry, &mut buf)?;
            std::fs::write(&out_path, &buf)?;
        }
    }
    Ok(())
}
