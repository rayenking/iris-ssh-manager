use tauri::State;
use uuid::Uuid;

use crate::ssh::pool::SshPool;
use crate::ssh::tunnel::{TunnelConfig, TunnelInfo, parse_tunnel_id};

#[tauri::command]
pub async fn create_tunnel(
    pool: State<'_, SshPool>,
    session_id: String,
    config: TunnelConfig,
) -> Result<String, String> {
    let session_id = parse_session_id(&session_id)?;
    let session = pool
        .0
        .get(&session_id)
        .await
        .ok_or_else(|| format!("ssh session not found: {session_id}"))?;

    let tunnel_manager = session.lock().await.tunnel_manager();
    tunnel_manager
        .create_tunnel(config)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn stop_tunnel(pool: State<'_, SshPool>, tunnel_id: String) -> Result<(), String> {
    let tunnel_id = parse_tunnel_id(&tunnel_id).map_err(|error| error.to_string())?;
    let sessions = pool.0.list_active().await;

    for session_id in sessions {
        let Some(session) = pool.0.get(&session_id).await else {
            continue;
        };

        let tunnel_manager = session.lock().await.tunnel_manager();

        if tunnel_manager.has_tunnel(&tunnel_id).await {
            return tunnel_manager
                .stop_tunnel(&tunnel_id)
                .await
                .map_err(|error| error.to_string());
        }
    }

    Err(format!("tunnel not found: {tunnel_id}"))
}

#[tauri::command]
pub async fn list_tunnels(
    pool: State<'_, SshPool>,
    session_id: String,
) -> Result<Vec<TunnelInfo>, String> {
    let session_id = parse_session_id(&session_id)?;
    let session = pool
        .0
        .get(&session_id)
        .await
        .ok_or_else(|| format!("ssh session not found: {session_id}"))?;

    let tunnel_manager = session.lock().await.tunnel_manager();
    Ok(tunnel_manager.list_tunnels().await)
}

#[tauri::command]
pub async fn remove_tunnel(pool: State<'_, SshPool>, tunnel_id: String) -> Result<(), String> {
    let tunnel_id = parse_tunnel_id(&tunnel_id).map_err(|error| error.to_string())?;
    let sessions = pool.0.list_active().await;

    for session_id in sessions {
        let Some(session) = pool.0.get(&session_id).await else {
            continue;
        };

        let tunnel_manager = session.lock().await.tunnel_manager();

        if tunnel_manager.has_tunnel(&tunnel_id).await {
            return tunnel_manager
                .remove_tunnel(&tunnel_id)
                .await
                .map_err(|error| error.to_string());
        }
    }

    Err(format!("tunnel not found: {tunnel_id}"))
}

fn parse_session_id(session_id: &str) -> Result<Uuid, String> {
    Uuid::parse_str(session_id).map_err(|error| error.to_string())
}
