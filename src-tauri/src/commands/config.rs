use tauri::State;

use crate::config::ssh_config::{self, ParsedSshHost};
use crate::db::{ConnectionRepo, CreateConnectionInput, DbConnection, DbState};

#[tauri::command]
pub async fn parse_ssh_config(config_path: Option<String>) -> Result<Vec<ParsedSshHost>, String> {
    let path = match config_path {
        Some(p) => p,
        None => ssh_config::default_ssh_config_path()
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .into_owned(),
    };

    ssh_config::parse_ssh_config(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_ssh_config(
    db: State<'_, DbState>,
    config_path: Option<String>,
    host_aliases: Vec<String>,
) -> Result<Vec<DbConnection>, String> {
    let path = match config_path {
        Some(p) => p,
        None => ssh_config::default_ssh_config_path()
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .into_owned(),
    };

    let parsed = ssh_config::parse_ssh_config(&path).map_err(|e| e.to_string())?;

    let selected: Vec<&ParsedSshHost> = parsed
        .iter()
        .filter(|h| host_aliases.contains(&h.host_alias))
        .collect();

    let mut created: Vec<DbConnection> = Vec::new();

    for host in selected {
        let auth_method = if host.identity_file.is_some() {
            "publicKey".to_string()
        } else {
            "password".to_string()
        };

        let hostname = host
            .hostname
            .clone()
            .unwrap_or_else(|| host.host_alias.clone());

        let data = CreateConnectionInput {
            name: host.host_alias.clone(),
            hostname,
            port: host.port.map(|p| p as i64),
            username: host.username.clone().unwrap_or_else(|| String::new()),
            auth_method,
            private_key_path: host.identity_file.clone(),
            group_id: None,
            color_tag: None,
            startup_command: None,
            last_connected_at: None,
            connection_count: None,
            sort_order: None,
        };

        let conn = ConnectionRepo::create(&db.0, &data).map_err(|e| e.to_string())?;
        created.push(conn);
    }

    Ok(created)
}
