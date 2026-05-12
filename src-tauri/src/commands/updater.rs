use serde::Serialize;
use std::path::PathBuf;
use tauri::ipc::Channel;

const REPO: &str = "rayenking/irisx";
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub has_update: bool,
    pub release_url: String,
    pub release_notes: String,
    pub download_url: String,
}

fn parse_version(v: &str) -> Option<(u32, u32, u32)> {
    let v = v.strip_prefix('v').unwrap_or(v);
    let parts: Vec<&str> = v.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    Some((
        parts[0].parse().ok()?,
        parts[1].parse().ok()?,
        parts[2].parse().ok()?,
    ))
}

fn is_newer(latest: &str, current: &str) -> bool {
    match (parse_version(latest), parse_version(current)) {
        (Some(l), Some(c)) => l > c,
        _ => false,
    }
}

fn platform_asset_pattern() -> &'static str {
    if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "aarch64.dmg"
        } else {
            "x64.dmg"
        }
    } else if cfg!(target_os = "windows") {
        "x64-setup.exe"
    } else {
        "amd64.deb"
    }
}

#[tauri::command]
pub async fn check_for_updates() -> Result<UpdateInfo, String> {
    let url = format!("https://api.github.com/repos/{REPO}/releases/latest");

    let client = reqwest::Client::builder()
        .user_agent("iris-ssh-manager")
        .build()
        .map_err(|e| e.to_string())?;

    let resp: serde_json::Value = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let latest_tag = resp["tag_name"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let latest_version = latest_tag.strip_prefix('v').unwrap_or(&latest_tag).to_string();
    let release_url = resp["html_url"].as_str().unwrap_or("").to_string();
    let release_notes = resp["body"].as_str().unwrap_or("").to_string();

    let pattern = platform_asset_pattern();
    let download_url = resp["assets"]
        .as_array()
        .and_then(|assets| {
            assets.iter().find_map(|a| {
                let name = a["name"].as_str().unwrap_or("");
                if name.ends_with(pattern) {
                    a["browser_download_url"].as_str().map(|s| s.to_string())
                } else {
                    None
                }
            })
        })
        .unwrap_or_default();

    Ok(UpdateInfo {
        current_version: CURRENT_VERSION.to_string(),
        latest_version: latest_version.clone(),
        has_update: is_newer(&latest_version, CURRENT_VERSION),
        release_url,
        release_notes,
        download_url,
    })
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total: u64,
    pub percentage: f32,
}

#[tauri::command]
pub async fn download_update(
    download_url: String,
    on_progress: Channel<DownloadProgress>,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("iris-ssh-manager")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let total = resp.content_length().unwrap_or(0);
    let filename = download_url
        .split('/')
        .last()
        .unwrap_or("update")
        .to_string();

    let temp_dir = std::env::temp_dir().join("iris-ssh-manager-updates");
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let file_path = temp_dir.join(&filename);

    let mut file = tokio::fs::File::create(&file_path)
        .await
        .map_err(|e| e.to_string())?;

    use tokio::io::AsyncWriteExt;
    let mut stream = resp.bytes_stream();
    use futures_util::StreamExt;
    let mut downloaded: u64 = 0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        let percentage = if total > 0 {
            (downloaded as f32 / total as f32) * 100.0
        } else {
            0.0
        };
        let _ = on_progress.send(DownloadProgress {
            downloaded,
            total,
            percentage,
        });
    }

    file.flush().await.map_err(|e| e.to_string())?;

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn install_update(app: tauri::AppHandle, file_path: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err("Update file not found".to_string());
    }

    let current_exe = std::env::current_exe()
        .map_err(|e| format!("Cannot find current exe: {e}"))?;
    let exe_path = current_exe.to_string_lossy().to_string();

    #[cfg(target_os = "linux")]
    {
        if file_path.ends_with(".deb") {
            let status = std::process::Command::new("pkexec")
                .args(["dpkg", "-i", &file_path])
                .status()
                .map_err(|e| format!("Failed to install: {e}"))?;

            if !status.success() {
                return Err("dpkg install failed — you may need to run on a Debian-based system".to_string());
            }

            std::process::Command::new(&exe_path)
                .spawn()
                .map_err(|e| format!("Failed to restart app: {e}"))?;
        } else if file_path.ends_with(".AppImage") {
            std::fs::set_permissions(&path, std::os::unix::fs::PermissionsExt::from_mode(0o755))
                .map_err(|e| format!("Failed to set permissions: {e}"))?;
            std::fs::copy(&path, &current_exe)
                .map_err(|e| format!("Failed to replace binary: {e}"))?;

            std::process::Command::new(&exe_path)
                .spawn()
                .map_err(|e| format!("Failed to restart app: {e}"))?;
        } else {
            return Err("Unsupported update format".to_string());
        }
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&file_path)
            .spawn()
            .map_err(|e| format!("Failed to open DMG: {e}"))?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &file_path])
            .spawn()
            .map_err(|e| format!("Failed to run installer: {e}"))?;
    }

    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(2));
        app.exit(0);
    });

    Ok(())
}

#[tauri::command]
pub fn get_current_version() -> String {
    CURRENT_VERSION.to_string()
}
