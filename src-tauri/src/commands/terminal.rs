use std::path::PathBuf;
use std::time::Duration;

use tauri::{State, ipc::Channel};
use tokio::task::spawn_blocking;
use tokio::time::timeout;
use uuid::Uuid;

use crate::db::{ConnectionRepo, DbState};
use crate::ssh::{AuthMethod, SshSession};
use crate::ssh::pool::{SharedSshSession, SshPool};

const SSH_CREDENTIAL_TIMEOUT: Duration = Duration::from_secs(5);
const SSH_TRANSPORT_TIMEOUT: Duration = Duration::from_secs(10);
const SSH_AUTH_TIMEOUT: Duration = Duration::from_secs(20);
const SSH_SHELL_TIMEOUT: Duration = Duration::from_secs(15);
const SSH_START_READING_TIMEOUT: Duration = Duration::from_secs(5);

#[tauri::command]
pub async fn ssh_connect(
    db: State<'_, DbState>,
    pool: State<'_, SshPool>,
    connection_id: String,
    on_data: Channel<Vec<u8>>,
    cols: Option<u32>,
    rows: Option<u32>,
) -> Result<String, String> {
    let connection = ConnectionRepo::get_by_id(&db.0, &connection_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("connection not found: {connection_id}"))?;

    let auth = if connection.auth_method == "password" {
        let connection_id = connection_id.clone();
        let connection_name = connection.name.clone();
        let password = timeout(
            SSH_CREDENTIAL_TIMEOUT,
            spawn_blocking(move || crate::keychain::retrieve_credential(&connection_id)),
        )
        .await
        .map_err(|_| format!("Timed out retrieving saved password for connection {}", connection_name))?
        .map_err(|error| format!("Failed to join password lookup task: {error}"))?
        .map_err(|error| format!("keychain error: {error}"))?
        .ok_or_else(|| format!("No saved password found for connection {}", connection_name))?;
        AuthMethod::Password(password)
    } else {
        build_auth_method(&connection.auth_method, connection.private_key_path)?
    };

    let mut session = timeout(
        SSH_TRANSPORT_TIMEOUT,
        SshSession::connect(&connection.hostname, connection.port as u16),
    )
    .await
    .map_err(|_| format!("Timed out connecting to SSH server {}:{}", connection.hostname, connection.port))?
    .map_err(|error| error.to_string())?;

    timeout(
        SSH_AUTH_TIMEOUT,
        session.authenticate(&connection.username, &auth),
    )
    .await
    .map_err(|_| format!("Timed out authenticating as {} on {}:{}", connection.username, connection.hostname, connection.port))?
    .map_err(|error| error.to_string())?;

    timeout(
        SSH_SHELL_TIMEOUT,
        session.open_shell(cols.unwrap_or(80), rows.unwrap_or(24)),
    )
    .await
    .map_err(|_| format!("Timed out opening remote shell on {}:{}", connection.hostname, connection.port))?
    .map_err(|error| error.to_string())?;

    timeout(
        SSH_START_READING_TIMEOUT,
        async { session.start_reading(on_data).map_err(|error| error.to_string()) },
    )
    .await
    .map_err(|_| "Timed out preparing SSH output stream".to_string())??;

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
pub async fn ssh_attach(
    pool: State<'_, SshPool>,
    session_id: String,
    on_data: Channel<Vec<u8>>,
    cols: Option<u32>,
    rows: Option<u32>,
) -> Result<(), String> {
    let session = get_session(&pool, &session_id).await?;
    let mut session = session.lock().await;
    session.attach_reading(on_data).await;

    if let (Some(cols), Some(rows)) = (cols, rows) {
        session.resize(cols, rows).await.map_err(|error| error.to_string())?;
    }

    Ok(())
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
