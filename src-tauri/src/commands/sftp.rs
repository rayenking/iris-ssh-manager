use std::path::PathBuf;

use anyhow::{Context, Result, anyhow};
use serde::Serialize;
use tauri::{State, ipc::Channel};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use uuid::Uuid;

use crate::ssh::pool::{SharedSshSession, SshPool};
use crate::ssh::sftp::{FileEntry, SftpSession, list_local_dir};

const TRANSFER_CHUNK_SIZE: usize = 64 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferProgress {
    pub bytes_transferred: u64,
    pub total_bytes: u64,
    pub percentage: f32,
}

#[tauri::command]
pub async fn sftp_list_dir(
    pool: State<'_, SshPool>,
    session_id: String,
    path: String,
) -> Result<Vec<FileEntry>, String> {
    let session = get_session(&pool, &session_id).await?;
    let guard = session.lock().await;
    let sftp = SftpSession::connect(&guard)
        .await
        .map_err(|error| error.to_string())?;

    sftp.list_dir(&path).await.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn sftp_download(
    pool: State<'_, SshPool>,
    session_id: String,
    remote_path: String,
    local_path: String,
    on_progress: Channel<TransferProgress>,
) -> Result<(), String> {
    let session = get_session(&pool, &session_id).await?;
    let guard = session.lock().await;
    let sftp = SftpSession::connect(&guard)
        .await
        .map_err(|error| error.to_string())?;

    let file_info = sftp
        .stat(&remote_path)
        .await
        .map_err(|error| error.to_string())?;
    let total_bytes = file_info.size;
    let mut remote_file = sftp
        .open_reader(&remote_path)
        .await
        .map_err(|error| error.to_string())?;
    let mut local_file = tokio::fs::File::create(&local_path)
        .await
        .with_context(|| format!("failed to create local file: {local_path}"))
        .map_err(|error| error.to_string())?;

    copy_with_progress(&mut remote_file, &mut local_file, total_bytes, on_progress)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn sftp_upload(
    pool: State<'_, SshPool>,
    session_id: String,
    local_path: String,
    remote_path: String,
    on_progress: Channel<TransferProgress>,
) -> Result<(), String> {
    let session = get_session(&pool, &session_id).await?;
    let guard = session.lock().await;
    let sftp = SftpSession::connect(&guard)
        .await
        .map_err(|error| error.to_string())?;

    let local_metadata = tokio::fs::metadata(&local_path)
        .await
        .with_context(|| format!("failed to read local file metadata: {local_path}"))
        .map_err(|error| error.to_string())?;
    let total_bytes = local_metadata.len();
    let mut local_file = tokio::fs::File::open(&local_path)
        .await
        .with_context(|| format!("failed to open local file: {local_path}"))
        .map_err(|error| error.to_string())?;
    let mut remote_file = sftp
        .open_writer(&remote_path)
        .await
        .map_err(|error| error.to_string())?;

    copy_with_progress(&mut local_file, &mut remote_file, total_bytes, on_progress)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn sftp_mkdir(
    pool: State<'_, SshPool>,
    session_id: String,
    path: String,
) -> Result<(), String> {
    let session = get_session(&pool, &session_id).await?;
    let guard = session.lock().await;
    let sftp = SftpSession::connect(&guard)
        .await
        .map_err(|error| error.to_string())?;

    sftp.mkdir(&path).await.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn sftp_delete(
    pool: State<'_, SshPool>,
    session_id: String,
    path: String,
) -> Result<(), String> {
    let session = get_session(&pool, &session_id).await?;
    let guard = session.lock().await;
    let sftp = SftpSession::connect(&guard)
        .await
        .map_err(|error| error.to_string())?;

    sftp.remove(&path).await.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn sftp_rename(
    pool: State<'_, SshPool>,
    session_id: String,
    old: String,
    new: String,
) -> Result<(), String> {
    let session = get_session(&pool, &session_id).await?;
    let guard = session.lock().await;
    let sftp = SftpSession::connect(&guard)
        .await
        .map_err(|error| error.to_string())?;

    sftp.rename(&old, &new).await.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn local_list_dir(path: String) -> Result<Vec<FileEntry>, String> {
    let resolved_path = resolve_local_path(&path)?;
    list_local_dir(&resolved_path)
        .await
        .map_err(|error| error.to_string())
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

fn resolve_local_path(path: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty() || path == "~" {
        return dirs::home_dir().ok_or_else(|| "failed to resolve local home directory".to_string());
    }

    if let Some(stripped) = path.strip_prefix("~/") {
        return dirs::home_dir()
            .map(|home| home.join(stripped))
            .ok_or_else(|| "failed to resolve local home directory".to_string());
    }

    Ok(PathBuf::from(path))
}

async fn copy_with_progress<R, W>(
    reader: &mut R,
    writer: &mut W,
    total_bytes: u64,
    on_progress: Channel<TransferProgress>,
) -> Result<()>
where
    R: AsyncReadExt + Unpin,
    W: AsyncWriteExt + Unpin,
{
    let mut buffer = vec![0; TRANSFER_CHUNK_SIZE];
    let mut transferred = 0_u64;

    send_progress(&on_progress, transferred, total_bytes)?;

    loop {
        let read = reader.read(&mut buffer).await.context("failed during transfer read")?;
        if read == 0 {
            break;
        }

        writer
            .write_all(&buffer[..read])
            .await
            .context("failed during transfer write")?;
        transferred += read as u64;
        send_progress(&on_progress, transferred, total_bytes)?;
    }

    writer.flush().await.context("failed to flush transfer output")?;
    Ok(())
}

fn send_progress(
    channel: &Channel<TransferProgress>,
    bytes_transferred: u64,
    total_bytes: u64,
) -> Result<()> {
    let percentage = if total_bytes == 0 {
        100.0
    } else {
        ((bytes_transferred as f64 / total_bytes as f64) * 100.0) as f32
    };

    channel
        .send(TransferProgress {
            bytes_transferred,
            total_bytes,
            percentage,
        })
        .map_err(|error| anyhow!(error.to_string()))
}
