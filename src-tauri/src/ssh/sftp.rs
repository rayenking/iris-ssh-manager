use std::path::Path;

use anyhow::{Context, Result, anyhow};
use chrono::{DateTime, Utc};
use russh_sftp::client::{SftpSession as RusshSftpSession, fs::File, fs::Metadata};
use serde::Serialize;

use super::session::SshSession;

const DIRECTORY_MODE_MASK: u32 = 0o170000;
const DIRECTORY_MODE_VALUE: u32 = 0o040000;

#[derive(Debug, Clone, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub size: u64,
    pub permissions: String,
    pub modified: String,
    pub is_dir: bool,
}

pub struct SftpSession {
    inner: RusshSftpSession,
}

impl SftpSession {
    pub async fn connect(session: &SshSession) -> Result<Self> {
        let handle = session
            .handle
            .as_ref()
            .ok_or_else(|| anyhow!("SSH session handle is not available"))?;

        let channel = handle
            .lock()
            .await
            .channel_open_session()
            .await
            .context("failed to open SSH session channel for SFTP")?;

        channel
            .request_subsystem(true, "sftp")
            .await
            .context("failed to request SFTP subsystem")?;

        let inner = RusshSftpSession::new(channel.into_stream())
            .await
            .context("failed to initialize SFTP session")?;

        Ok(Self { inner })
    }

    pub async fn list_dir(&self, path: &str) -> Result<Vec<FileEntry>> {
        let entries = self
            .inner
            .read_dir(path)
            .await
            .with_context(|| format!("failed to read remote directory: {path}"))?;

        Ok(entries
            .filter_map(|entry| {
                let name = entry.file_name();
                if name == "." || name == ".." {
                    return None;
                }

                Some(file_entry_from_metadata(name, entry.metadata()))
            })
            .collect())
    }

    pub async fn read_file(&self, path: &str) -> Result<Vec<u8>> {
        self.inner
            .read(path)
            .await
            .with_context(|| format!("failed to read remote file: {path}"))
            .map_err(Into::into)
    }

    pub async fn write_file(&self, path: &str, data: &[u8]) -> Result<()> {
        self.inner
            .write(path, data)
            .await
            .with_context(|| format!("failed to write remote file: {path}"))?;

        Ok(())
    }

    pub async fn mkdir(&self, path: &str) -> Result<()> {
        self.inner
            .create_dir(path)
            .await
            .with_context(|| format!("failed to create remote directory: {path}"))?;

        Ok(())
    }

    pub async fn remove(&self, path: &str) -> Result<()> {
        let metadata = self
            .inner
            .metadata(path)
            .await
            .with_context(|| format!("failed to stat remote path for removal: {path}"))?;

        if is_directory(&metadata) {
            self.inner
                .remove_dir(path)
                .await
                .with_context(|| format!("failed to remove remote directory: {path}"))?;
        } else {
            self.inner
                .remove_file(path)
                .await
                .with_context(|| format!("failed to remove remote file: {path}"))?;
        }

        Ok(())
    }

    pub async fn rename(&self, old: &str, new: &str) -> Result<()> {
        self.inner
            .rename(old, new)
            .await
            .with_context(|| format!("failed to rename remote path from {old} to {new}"))?;

        Ok(())
    }

    pub async fn chmod(&self, path: &str, mode: u32) -> Result<()> {
        let mut metadata = self
            .inner
            .metadata(path)
            .await
            .with_context(|| format!("failed to stat remote path before chmod: {path}"))?;
        metadata.permissions = Some(mode);

        self.inner
            .set_metadata(path, metadata)
            .await
            .with_context(|| format!("failed to chmod remote path: {path}"))?;

        Ok(())
    }

    pub async fn stat(&self, path: &str) -> Result<FileEntry> {
        let metadata = self
            .inner
            .metadata(path)
            .await
            .with_context(|| format!("failed to stat remote path: {path}"))?;

        let name = Path::new(path)
            .file_name()
            .and_then(|part| part.to_str())
            .filter(|part| !part.is_empty())
            .unwrap_or(path)
            .to_string();

        Ok(file_entry_from_metadata(name, metadata))
    }

    pub async fn open_reader(&self, path: &str) -> Result<File> {
        self.inner
            .open(path)
            .await
            .with_context(|| format!("failed to open remote file for reading: {path}"))
            .map_err(Into::into)
    }

    pub async fn open_writer(&self, path: &str) -> Result<File> {
        self.inner
            .create(path)
            .await
            .with_context(|| format!("failed to open remote file for writing: {path}"))
            .map_err(Into::into)
    }
}

pub async fn list_local_dir(path: &Path) -> Result<Vec<FileEntry>> {
    let mut directory = tokio::fs::read_dir(path)
        .await
        .with_context(|| format!("failed to read local directory: {}", path.display()))?;
    let mut entries = Vec::new();

    while let Some(entry) = directory
        .next_entry()
        .await
        .context("failed to iterate local directory")?
    {
        let metadata = entry
            .metadata()
            .await
            .with_context(|| format!("failed to read metadata for {}", entry.path().display()))?;

        entries.push(FileEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            size: metadata.len(),
            permissions: format_local_permissions(&metadata),
            modified: system_time_to_iso(metadata.modified().ok()),
            is_dir: metadata.is_dir(),
        });
    }

    Ok(entries)
}

fn file_entry_from_metadata(name: String, metadata: Metadata) -> FileEntry {
    FileEntry {
        name,
        size: metadata.size.unwrap_or_default(),
        permissions: format_permissions(metadata.permissions),
        modified: unix_timestamp_to_iso(metadata.mtime),
        is_dir: is_directory(&metadata),
    }
}

fn is_directory(metadata: &Metadata) -> bool {
    metadata
        .permissions
        .map(|mode| mode & DIRECTORY_MODE_MASK == DIRECTORY_MODE_VALUE)
        .unwrap_or(false)
}

fn format_permissions(mode: Option<u32>) -> String {
    mode.map(|value| format!("{:o}", value & 0o7777))
        .unwrap_or_else(|| "—".to_string())
}

fn unix_timestamp_to_iso(timestamp: Option<u32>) -> String {
    timestamp
        .and_then(|value| DateTime::<Utc>::from_timestamp(value as i64, 0))
        .map(|value| value.to_rfc3339())
        .unwrap_or_else(|| "—".to_string())
}

fn system_time_to_iso(time: Option<std::time::SystemTime>) -> String {
    time.map(DateTime::<Utc>::from)
        .map(|value| value.to_rfc3339())
        .unwrap_or_else(|| "—".to_string())
}

fn format_local_permissions(metadata: &std::fs::Metadata) -> String {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        return format!("{:o}", metadata.permissions().mode() & 0o7777);
    }

    #[cfg(not(unix))]
    {
        if metadata.permissions().readonly() {
            return "readonly".to_string();
        }

        "rw".to_string()
    }
}
