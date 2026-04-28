use std::collections::HashMap;
use std::env;
use std::io::{Read, Write};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use portable_pty::{Child, CommandBuilder, MasterPty, PtySize, native_pty_system};
use tauri::{State, ipc::Channel};
use tokio::sync::{Mutex, RwLock, mpsc};
use tokio::task::JoinHandle;
use uuid::Uuid;

const READ_BATCH_LIMIT: usize = 8 * 1024;

type SharedLocalShellSession = Arc<Mutex<LocalShellSession>>;

pub struct LocalShellSession {
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Arc<Mutex<Box<dyn Child + Send>>>,
    reader_task: Option<JoinHandle<()>>,
    stream_task: Option<JoinHandle<()>>,
}

impl LocalShellSession {
    fn new(
        master: Box<dyn MasterPty + Send>,
        writer: Box<dyn Write + Send>,
        child: Box<dyn Child + Send>,
        reader_task: JoinHandle<()>,
        stream_task: JoinHandle<()>,
    ) -> Self {
        Self {
            master: Arc::new(Mutex::new(master)),
            writer: Arc::new(Mutex::new(writer)),
            child: Arc::new(Mutex::new(child)),
            reader_task: Some(reader_task),
            stream_task: Some(stream_task),
        }
    }

    async fn write(&self, data: &[u8]) -> Result<()> {
        let mut writer = self.writer.lock().await;
        writer
            .write_all(data)
            .context("failed to write data to local shell")?;
        writer.flush().context("failed to flush local shell writer")?;
        Ok(())
    }

    async fn resize(&self, cols: u32, rows: u32) -> Result<()> {
        self.master
            .lock()
            .await
            .resize(pty_size(cols, rows))
            .context("failed to resize local PTY")?;
        Ok(())
    }

    async fn disconnect(&mut self) -> Result<()> {
        if let Some(task) = self.reader_task.take() {
            task.abort();
        }

        if let Some(task) = self.stream_task.take() {
            task.abort();
        }

        self.child
            .lock()
            .await
            .kill()
            .context("failed to kill local shell process")?;

        Ok(())
    }
}

impl Drop for LocalShellSession {
    fn drop(&mut self) {
        if let Some(task) = self.reader_task.take() {
            task.abort();
        }

        if let Some(task) = self.stream_task.take() {
            task.abort();
        }

        let child = Arc::clone(&self.child);
        tokio::spawn(async move {
            let _ = child.lock().await.kill();
        });
    }
}

#[derive(Default)]
pub struct LocalShellPool {
    sessions: Arc<RwLock<HashMap<Uuid, SharedLocalShellSession>>>,
}

impl LocalShellPool {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn add(&self, session: LocalShellSession) -> Uuid {
        let id = Uuid::new_v4();
        self.sessions
            .write()
            .await
            .insert(id, Arc::new(Mutex::new(session)));
        id
    }

    pub async fn get(&self, id: &Uuid) -> Option<SharedLocalShellSession> {
        self.sessions.read().await.get(id).cloned()
    }

    pub async fn remove(&self, id: &Uuid) -> Option<SharedLocalShellSession> {
        self.sessions.write().await.remove(id)
    }
}

#[tauri::command]
pub async fn local_shell_open(
    pool: State<'_, LocalShellPool>,
    on_data: Channel<Vec<u8>>,
    cols: u32,
    rows: u32,
) -> Result<String, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(pty_size(cols, rows))
        .map_err(|error| error.to_string())?;

    let command = CommandBuilder::new(default_shell());
    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| error.to_string())?;

    drop(pair.slave);

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| error.to_string())?;

    let (output_tx, mut output_rx) = mpsc::unbounded_channel::<Vec<u8>>();
    let reader_task = tokio::task::spawn_blocking(move || {
        let mut reader = reader;
        let mut buffer = [0_u8; 4096];

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(read_count) => {
                    if output_tx.send(buffer[..read_count].to_vec()).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    let stream_task = tokio::spawn(async move {
        let mut buffer = Vec::with_capacity(READ_BATCH_LIMIT);
        let flush_interval = Duration::from_millis(8);

        loop {
            if buffer.is_empty() {
                match output_rx.recv().await {
                    Some(chunk) => buffer.extend_from_slice(&chunk),
                    None => break,
                }
            } else {
                match tokio::time::timeout(flush_interval, output_rx.recv()).await {
                    Ok(Some(chunk)) => buffer.extend_from_slice(&chunk),
                    Ok(None) => break,
                    Err(_) => {
                        if on_data.send(std::mem::take(&mut buffer)).is_err() {
                            break;
                        }
                        continue;
                    }
                }
            }

            if buffer.len() >= READ_BATCH_LIMIT && on_data.send(std::mem::take(&mut buffer)).is_err() {
                break;
            }
        }

        if !buffer.is_empty() {
            let _ = on_data.send(buffer);
        }
    });

    let session = LocalShellSession::new(pair.master, writer, child, reader_task, stream_task);
    let session_id = pool.add(session).await;

    Ok(session_id.to_string())
}

#[tauri::command]
pub async fn local_shell_write(
    pool: State<'_, LocalShellPool>,
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
pub async fn local_shell_resize(
    pool: State<'_, LocalShellPool>,
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

#[tauri::command]
pub async fn local_shell_disconnect(
    pool: State<'_, LocalShellPool>,
    session_id: String,
) -> Result<(), String> {
    let session_id = parse_session_id(&session_id)?;
    let session = pool
        .remove(&session_id)
        .await
        .ok_or_else(|| format!("local shell session not found: {session_id}"))?;

    let result = session
        .lock()
        .await
        .disconnect()
        .await
        .map_err(|error| error.to_string());

    result
}

async fn get_session(
    pool: &State<'_, LocalShellPool>,
    session_id: &str,
) -> Result<SharedLocalShellSession, String> {
    let session_id = parse_session_id(session_id)?;
    pool.get(&session_id)
        .await
        .ok_or_else(|| format!("local shell session not found: {session_id}"))
}

fn parse_session_id(session_id: &str) -> Result<Uuid, String> {
    Uuid::parse_str(session_id).map_err(|error| error.to_string())
}

fn pty_size(cols: u32, rows: u32) -> PtySize {
    PtySize {
        rows: rows.clamp(1, u16::MAX as u32) as u16,
        cols: cols.clamp(1, u16::MAX as u32) as u16,
        pixel_width: 0,
        pixel_height: 0,
    }
}

fn default_shell() -> String {
    env::var("SHELL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            if cfg!(windows) {
                "cmd.exe".to_string()
            } else {
                "/bin/bash".to_string()
            }
        })
}
