use serde::Serialize;

const REPO: &str = "rayenking/iris-ssh-manager";
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

#[tauri::command]
pub fn get_current_version() -> String {
    CURRENT_VERSION.to_string()
}
