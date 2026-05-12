use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use russh::client;
use russh::{Channel, ChannelId, Disconnect};
use tauri::ipc::Channel as TauriChannel;
use tokio::sync::mpsc;
use tokio::sync::mpsc::UnboundedReceiver;
use tokio::sync::mpsc::UnboundedSender;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use super::auth::{AuthMethod, authenticate};
use super::tunnel::{TunnelManager, forwarded_channel_sender};

const READ_BATCH_LIMIT: usize = 8 * 1024;

#[derive(Default)]
pub(crate) struct SharedHandlerState {
    shell_channel_id: Option<ChannelId>,
    output_tx: Option<UnboundedSender<Vec<u8>>>,
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

    async fn channel_eof(
        &mut self,
        channel: ChannelId,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        self.forward_eof(channel).await;
        Ok(())
    }

    async fn channel_close(
        &mut self,
        channel: ChannelId,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        self.forward_eof(channel).await;
        Ok(())
    }
}

impl SshHandler {
    async fn shell_output_sender(&self, channel: ChannelId) -> Option<UnboundedSender<Vec<u8>>> {
        let state = self.shared.lock().await;
        if state.shell_channel_id != Some(channel) {
            return None;
        }
        state.output_tx.clone()
    }

    async fn forward_data(&self, channel: ChannelId, data: &[u8]) {
        if let Some(sender) = self.shell_output_sender(channel).await {
            let _ = sender.send(data.to_vec());
        }
    }

    async fn forward_eof(&self, channel: ChannelId) {
        if let Some(sender) = self.shell_output_sender(channel).await {
            let _ = sender.send(Vec::new());
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
    output_rx: Option<UnboundedReceiver<Vec<u8>>>,
    read_task: Option<JoinHandle<()>>,
    tunnel_manager: Arc<TunnelManager>,
    pub host: String,
    pub port: u16,
    pub username: String,
}

fn spawn_reader_task(mut receiver: UnboundedReceiver<Vec<u8>>, channel: TauriChannel<Vec<u8>>) -> JoinHandle<()> {
    tokio::spawn(async move {
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

        let _ = channel.send(Vec::new());
    })
}

async fn create_output_binding(handler_state: &Arc<Mutex<SharedHandlerState>>) -> UnboundedReceiver<Vec<u8>> {
    let (output_tx, output_rx) = mpsc::unbounded_channel();
    handler_state.lock().await.output_tx = Some(output_tx);
    output_rx
}

impl SshSession {
    pub async fn connect(host: &str, port: u16) -> Result<SshSession> {
        let config = Arc::new(client::Config {
            inactivity_timeout: None,
            keepalive_interval: Some(Duration::from_secs(15)),
            keepalive_max: 3,
            ..Default::default()
        });

        let handler = SshHandler::default();
        let handler_state = handler.shared.clone();
        let output_rx = create_output_binding(&handler_state).await;
        let (forwarded_channel_tx, forwarded_channel_rx) = forwarded_channel_sender();
        {
            let mut state = handler_state.lock().await;
            state.forwarded_channel_tx = Some(forwarded_channel_tx);
        }

        let handle = client::connect(config, (host, port), handler)
            .await
            .with_context(|| format!("failed to connect to SSH server {host}:{port}"))?;

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
            username: String::new(),
        })
    }

    pub async fn authenticate(&mut self, username: &str, auth: &AuthMethod) -> Result<()> {
        let handle = Arc::clone(
            self
                .handle
                .as_ref()
                .ok_or_else(|| anyhow!("SSH session handle is not available"))?,
        );

        let mut handle = handle.lock().await;
        let authenticated = authenticate(&mut handle, username, auth).await?;
        if !authenticated {
            return Err(anyhow!("SSH authentication was rejected by the server"));
        }

        self.username = username.to_string();
        Ok(())
    }

    pub fn set_username(&mut self, username: &str) {
        self.username = username.to_string();
    }

    pub fn username(&self) -> &str {
        &self.username
    }

    pub fn host(&self) -> &str {
        &self.host
    }

    pub fn port(&self) -> u16 {
        self.port
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
        let receiver = self
            .output_rx
            .take()
            .ok_or_else(|| anyhow!("output reader has already been started"))?;

        self.read_task = Some(spawn_reader_task(receiver, channel));
        Ok(())
    }

    pub fn detach_reading(&mut self) {
        if let Some(task) = self.read_task.take() {
            task.abort();
        }
    }

    pub async fn attach_reading(&mut self, channel: TauriChannel<Vec<u8>>) {
        self.detach_reading();
        let receiver = create_output_binding(&self.handler_state).await;
        self.output_rx = Some(receiver);
        let next_receiver = self.output_rx.take().expect("output receiver must exist after binding");
        self.read_task = Some(spawn_reader_task(next_receiver, channel));
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
