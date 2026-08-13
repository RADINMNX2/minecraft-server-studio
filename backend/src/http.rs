use std::path::Path;
use std::time::Duration;

use anyhow::{Context, Result};
use futures_util::StreamExt;
use serde_json::Value;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;

use crate::ipc::Event;

/// Shared HTTP client (rustls, no system OpenSSL dependency).
pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .user_agent("MCSS-Backend/1.0")
        .build()
        .expect("failed to build http client")
}

pub async fn get_json(url: &str) -> Result<Value> {
    let resp = client()
        .get(url)
        .send()
        .await
        .with_context(|| format!("GET {url}"))?
        .error_for_status()
        .with_context(|| format!("status for {url}"))?;
    let text = resp.text().await?;
    let json: Value = serde_json::from_str(&text).with_context(|| format!("parse json from {url}"))?;
    Ok(json)
}

pub async fn get_text(url: &str) -> Result<String> {
    let resp = client()
        .get(url)
        .send()
        .await
        .with_context(|| format!("GET {url}"))?
        .error_for_status()
        .with_context(|| format!("status for {url}"))?;
    Ok(resp.text().await?)
}

/// Download a file to `dest`, reporting progress through `on_progress(percent, bytes_done, bytes_total)`.
pub async fn download_file<F>(
    url: &str,
    dest: &Path,
    mut on_progress: F,
) -> Result<()>
where
    F: FnMut(u64, u64),
{
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent).await.ok();
    }
    let resp = client()
        .get(url)
        .send()
        .await
        .with_context(|| format!("GET {url}"))?
        .error_for_status()
        .with_context(|| format!("status for {url}"))?;

    let total = resp.content_length().unwrap_or(0);
    let mut file = File::create(dest)
        .await
        .with_context(|| format!("create {}", dest.display()))?;
    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = 0;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.with_context(|| "download chunk")?;
        file.write_all(&chunk).await?;
        downloaded += chunk.len() as u64;
        let pct = if total > 0 {
            (downloaded * 100 / total) as u64
        } else {
            0
        };
        on_progress(pct, downloaded);
    }
    file.flush().await.ok();
    Ok(())
}

/// Emit a structured event through the broadcast bus.
pub fn emit(event: Event, bus: &tokio::sync::broadcast::Sender<Value>) {
    let _ = bus.send(event.0);
}
