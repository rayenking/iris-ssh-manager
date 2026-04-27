use std::path::PathBuf;

use tauri::{State, ipc::Channel};
use uuid::Uuid;

use crate::db::{ConnectionRepo, DbState};
use crate::ssh::{AuthMethod, SshSession};
use crate::ssh::pool::{SharedSshSession, SshPool};

#[tauri::command]
pub async fn ssh_connect(
    db: State<'_, DbState>,
    pool: State<'_, SshPool>,
    connection_id: String,
    on_data: Channel<Vec<u8>>,
) -> Result<String, String> {
    let connection = ConnectionRepo::get_by_id(&db.0, &connection_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("connection not found: {connection_id}"))?;

    let auth = if connection.auth_method == "password" {
        let password = crate::keychain::retrieve_credential(&connection_id)
            .map_err(|e| format!("keychain error: {e}"))?
            .unwrap_or_default();
        AuthMethod::Password(password)
    } else {
        build_auth_method(&connection.auth_method, connection.private_key_path)?
    };
    let mut session = SshSession::connect(
        &connection.hostname,
        connection.port as u16,
        &connection.username,
        auth,
    )
    .await
    .map_err(|error| error.to_string())?;

    session
        .open_shell(80, 24)
        .await
        .map_err(|error| error.to_string())?;
    session.start_reading(on_data).map_err(|error| error.to_string())?;

    let session_id = pool.0.add(session).await;
    if let Some(stored_session) = pool.0.get(&session_id).await {
        stored_session
            .lock()
            .await
            .set_session_id(session_id.to_string())
            .await;
    }
    Ok(session_id.to_string())
}

#[tauri::command]
pub async fn ssh_disconnect(
    pool: State<'_, SshPool>,
    session_id: String,
) -> Result<(), String> {
    let session_id = parse_session_id(&session_id)?;
    let session = pool
        .0
        .remove(&session_id)
        .await
        .ok_or_else(|| format!("ssh session not found: {session_id}"))?;

    let result = session
        .lock()
        .await
        .disconnect()
        .await
        .map_err(|error| error.to_string());

    result
}

#[tauri::command]
pub async fn ssh_write(
    pool: State<'_, SshPool>,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let session = get_session(&pool, &session_id).await?;
    let result = session
        .lock()
        .await
        .write(&data)
        .await
        .map_err(|error| error.to_string());

    result
}

#[tauri::command]
pub async fn ssh_resize(
    pool: State<'_, SshPool>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    let session = get_session(&pool, &session_id).await?;
    let result = session
        .lock()
        .await
        .resize(cols, rows)
        .await
        .map_err(|error| error.to_string());

    result
}

fn build_auth_method(auth_method: &str, private_key_path: Option<String>) -> Result<AuthMethod, String> {
    match auth_method {
        "password" => Ok(AuthMethod::Password(String::new())),
        "publicKey" => {
            let key_path = private_key_path
                .map(PathBuf::from)
                .ok_or_else(|| "private_key_path is required for publicKey auth".to_string())?;
            Ok(AuthMethod::PublicKey {
                key_path,
                passphrase: None,
            })
        }
        "agent" => Ok(AuthMethod::Agent),
        other => Err(format!("unsupported auth method: {other}")),
    }
}

async fn get_session(
    pool: &State<'_, SshPool>,
    session_id: &str,
) -> Result<SharedSshSession, String> {
    let session_id = parse_session_id(session_id)?;
    pool.0
        .get(&session_id)
        .await
        .ok_or_else(|| format!("ssh session not found: {session_id}"))
}

fn parse_session_id(session_id: &str) -> Result<Uuid, String> {
    Uuid::parse_str(session_id).map_err(|error| error.to_string())
}
