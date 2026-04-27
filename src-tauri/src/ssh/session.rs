use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use russh::client;
use russh::{Channel, ChannelId, Disconnect};
use tauri::ipc::Channel as TauriChannel;
use tokio::sync::mpsc;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use super::auth::{authenticate, AuthMethod};
use super::tunnel::{TunnelManager, forwarded_channel_sender};

const READ_BATCH_LIMIT: usize = 8 * 1024;

#[derive(Default)]
pub(crate) struct SharedHandlerState {
    shell_channel_id: Option<ChannelId>,
    output_tx: Option<mpsc::UnboundedSender<Vec<u8>>>,
    forwarded_channel_tx: Option<mpsc::UnboundedSender<super::tunnel::IncomingForwardedChannel>>,
}

#[derive(Clone, Default)]
pub(crate) struct SshHandler {
    pub(crate) shared: Arc<Mutex<SharedHandlerState>>,
}

#[async_trait]
impl client::Handler for SshHandler {
    type Error = anyhow::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }

    async fn data(
        &mut self,
        channel: ChannelId,
        data: &[u8],
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        self.forward_data(channel, data).await;
        Ok(())
    }

    async fn extended_data(
        &mut self,
        channel: ChannelId,
        _ext: u32,
        data: &[u8],
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        self.forward_data(channel, data).await;
        Ok(())
    }

    async fn server_channel_open_forwarded_tcpip(
        &mut self,
        channel: Channel<client::Msg>,
        _connected_address: &str,
        connected_port: u32,
        _originator_address: &str,
        _originator_port: u32,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        self.forward_remote_channel(channel, connected_port as u16).await;
        Ok(())
    }
}

impl SshHandler {
    async fn forward_data(&self, channel: ChannelId, data: &[u8]) {
        let sender = {
            let state = self.shared.lock().await;
            if state.shell_channel_id != Some(channel) {
                return;
            }
            state.output_tx.clone()
        };

        if let Some(sender) = sender {
            let _ = sender.send(data.to_vec());
        }
    }

    pub(crate) async fn forwarded_channel_sender(
        &self,
    ) -> Option<mpsc::UnboundedSender<super::tunnel::IncomingForwardedChannel>> {
        self.shared.lock().await.forwarded_channel_tx.clone()
    }
}

pub struct SshSession {
    pub(crate) handle: Option<Arc<Mutex<client::Handle<SshHandler>>>>,
    shell_channel: Option<Channel<client::Msg>>,
    handler_state: Arc<Mutex<SharedHandlerState>>,
    output_rx: Option<mpsc::UnboundedReceiver<Vec<u8>>>,
    read_task: Option<JoinHandle<()>>,
    tunnel_manager: Arc<TunnelManager>,
    pub host: String,
    pub port: u16,
    pub username: String,
}

impl SshSession {
    pub async fn connect(
        host: &str,
        port: u16,
        username: &str,
        auth: AuthMethod,
    ) -> Result<SshSession> {
        let config = Arc::new(client::Config {
            inactivity_timeout: Some(Duration::from_secs(30)),
            ..Default::default()
        });

        let handler = SshHandler::default();
        let handler_state = handler.shared.clone();
        let (output_tx, output_rx) = mpsc::unbounded_channel();
        let (forwarded_channel_tx, forwarded_channel_rx) = forwarded_channel_sender();
        {
            let mut state = handler_state.lock().await;
            state.output_tx = Some(output_tx);
            state.forwarded_channel_tx = Some(forwarded_channel_tx);
        }

        let mut handle = client::connect(config, (host, port), handler)
            .await
            .with_context(|| format!("failed to connect to SSH server {host}:{port}"))?;

        let authenticated = authenticate(&mut handle, username, &auth).await?;
        if !authenticated {
            return Err(anyhow!("SSH authentication was rejected by the server"));
        }

        let handle = Arc::new(Mutex::new(handle));
        let tunnel_manager = Arc::new(TunnelManager::new(Arc::clone(&handle), forwarded_channel_rx));

        Ok(Self {
            handle: Some(handle),
            shell_channel: None,
            handler_state,
            output_rx: Some(output_rx),
            read_task: None,
            tunnel_manager,
            host: host.to_string(),
            port,
            username: username.to_string(),
        })
    }

    pub async fn open_shell(&mut self, cols: u32, rows: u32) -> Result<()> {
        if self.shell_channel.is_some() {
            return Ok(());
        }

        let handle = Arc::clone(
            self
            .handle
            .as_ref()
            .ok_or_else(|| anyhow!("SSH session handle is not available"))?,
        );

        let channel = handle
            .lock()
            .await
            .channel_open_session()
            .await
            .context("failed to open SSH session channel")?;

        channel
            .request_pty(true, "xterm-256color", cols, rows, 0, 0, &[])
            .await
            .context("failed to request PTY")?;
        channel
            .request_shell(true)
            .await
            .context("failed to request remote shell")?;

        self.handler_state.lock().await.shell_channel_id = Some(channel.id());
        self.shell_channel = Some(channel);
        Ok(())
    }

    pub fn start_reading(&mut self, channel: TauriChannel<Vec<u8>>) -> Result<()> {
        let mut receiver = self
            .output_rx
            .take()
            .ok_or_else(|| anyhow!("output reader has already been started"))?;

        self.read_task = Some(tokio::spawn(async move {
            let mut buffer = Vec::with_capacity(READ_BATCH_LIMIT);
            let flush_interval = Duration::from_millis(8);

            loop {
                if buffer.is_empty() {
                    match receiver.recv().await {
                        Some(chunk) => buffer.extend_from_slice(&chunk),
                        None => break,
                    }
                } else {
                    match tokio::time::timeout(flush_interval, receiver.recv()).await {
                        Ok(Some(chunk)) => {
                            buffer.extend_from_slice(&chunk);
                        }
                        Ok(None) => break,
                        Err(_) => {
                            if channel.send(std::mem::take(&mut buffer)).is_err() {
                                break;
                            }
                            continue;
                        }
                    }
                }

                if buffer.len() >= READ_BATCH_LIMIT {
                    if channel.send(std::mem::take(&mut buffer)).is_err() {
                        break;
                    }
                }
            }

            if !buffer.is_empty() {
                let _ = channel.send(buffer);
            }
        }));

        Ok(())
    }

    pub async fn resize(&self, cols: u32, rows: u32) -> Result<()> {
        let channel = self
            .shell_channel
            .as_ref()
            .ok_or_else(|| anyhow!("shell channel is not open"))?;

        channel
            .window_change(cols, rows, 0, 0)
            .await
            .context("failed to resize remote PTY")
            .map_err(Into::into)
    }

    pub async fn write(&self, data: &[u8]) -> Result<()> {
        let channel = self
            .shell_channel
            .as_ref()
            .ok_or_else(|| anyhow!("shell channel is not open"))?;

        channel
            .data(data)
            .await
            .context("failed to write data to remote shell")
            .map_err(Into::into)
    }

    pub fn tunnel_manager(&self) -> Arc<TunnelManager> {
        Arc::clone(&self.tunnel_manager)
    }

    pub async fn set_session_id(&self, session_id: String) {
        self.tunnel_manager.set_session_id(session_id).await;
    }

    pub async fn disconnect(&mut self) -> Result<()> {
        if let Some(task) = self.read_task.take() {
            task.abort();
        }

        self.tunnel_manager.stop_all().await;

        if let Some(channel) = self.shell_channel.take() {
            let _ = channel.eof().await;
            let _ = channel.close().await;
        }

        {
            let mut state = self.handler_state.lock().await;
            state.shell_channel_id = None;
            state.forwarded_channel_tx = None;
        }

        if let Some(handle) = self.handle.take() {
            handle
                .lock()
                .await
                .disconnect(Disconnect::ByApplication, "disconnect", "en-US")
                .await
                .context("failed to disconnect SSH session")?;
        }

        Ok(())
    }

}

impl Drop for SshSession {
    fn drop(&mut self) {
        if let Some(task) = self.read_task.take() {
            task.abort();
        }

        {
            let mut state = self.handler_state.blocking_lock();
            state.shell_channel_id = None;
            state.forwarded_channel_tx = None;
        }

        self.tunnel_manager.stop_all_blocking();

        let shell_channel = self.shell_channel.take();
        let handle = self.handle.take();

        if shell_channel.is_none() && handle.is_none() {
            return;
        }

        tokio::spawn(async move {
            if let Some(channel) = shell_channel {
                let _ = channel.eof().await;
                let _ = channel.close().await;
            }

            if let Some(handle) = handle {
                let _ = handle
                    .lock()
                    .await
                    .disconnect(Disconnect::ByApplication, "drop", "en-US")
                    .await;
            }
        });
    }
}
