use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use anyhow::{Context, Result, anyhow};
use russh::Channel;
use russh::client;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt, copy_bidirectional};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{Mutex, mpsc, oneshot};
use tokio::task::JoinHandle;
use uuid::Uuid;

use super::session::SshHandler;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TunnelType {
    Local,
    Remote,
    Dynamic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TunnelStatus {
    Active,
    Stopped,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelInfo {
    pub id: String,
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[serde(rename = "type")]
    pub tunnel_type: TunnelType,
    #[serde(rename = "localPort")]
    pub local_port: Option<u16>,
    #[serde(rename = "remoteHost")]
    pub remote_host: Option<String>,
    #[serde(rename = "remotePort")]
    pub remote_port: Option<u16>,
    #[serde(rename = "localHost")]
    pub local_host: Option<String>,
    pub status: TunnelStatus,
    #[serde(rename = "bytesTransferred")]
    pub bytes_transferred: u64,
    #[serde(rename = "errorMessage")]
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum TunnelConfig {
    Local {
        #[serde(rename = "localPort")]
        local_port: u16,
        #[serde(rename = "remoteHost")]
        remote_host: String,
        #[serde(rename = "remotePort")]
        remote_port: u16,
    },
    Remote {
        #[serde(rename = "remotePort")]
        remote_port: u16,
        #[serde(rename = "localHost")]
        local_host: String,
        #[serde(rename = "localPort")]
        local_port: u16,
    },
    Dynamic {
        #[serde(rename = "localPort")]
        local_port: u16,
    },
}

pub struct TunnelManager {
    state: Arc<Mutex<TunnelState>>,
    handle: Arc<Mutex<client::Handle<SshHandler>>>,
}

struct TunnelState {
    session_id: Option<String>,
    tunnels: HashMap<Uuid, ManagedTunnel>,
    remote_forward_router: Option<JoinHandle<()>>,
}

struct ManagedTunnel {
    spec: TunnelSpec,
    status: TunnelStatus,
    error_message: Option<String>,
    bytes_transferred: Arc<AtomicU64>,
    task: Option<JoinHandle<()>>,
    stop_tx: Option<oneshot::Sender<()>>,
}

enum TunnelSpec {
    Local {
        local_port: u16,
        remote_host: String,
        remote_port: u16,
    },
    Remote {
        remote_port: u16,
        local_host: String,
        local_port: u16,
    },
    Dynamic {
        local_port: u16,
    },
}

pub(crate) struct IncomingForwardedChannel {
    channel: Channel<client::Msg>,
    connected_port: u16,
}

impl TunnelManager {
    pub(crate) fn new(
        handle: Arc<Mutex<client::Handle<SshHandler>>>,
        forwarded_rx: mpsc::UnboundedReceiver<IncomingForwardedChannel>,
    ) -> Self {
        let state = Arc::new(Mutex::new(TunnelState {
            session_id: None,
            tunnels: HashMap::new(),
            remote_forward_router: None,
        }));

        let router_state = Arc::clone(&state);
        let router_task = tokio::spawn(async move {
            Self::run_remote_forward_router(router_state, forwarded_rx).await;
        });

        // Store the router task directly via the Arc<Mutex> — avoid blocking_lock()
        // which panics inside a tokio runtime context.
        {
            let mut guard = state.try_lock().expect("state lock is uncontested during construction");
            guard.remote_forward_router = Some(router_task);
        }

        Self { state, handle }
    }

    pub async fn set_session_id(&self, session_id: String) {
        self.state.lock().await.session_id = Some(session_id);
    }

    pub async fn create_tunnel(&self, config: TunnelConfig) -> Result<String> {
        match config {
            TunnelConfig::Local {
                local_port,
                remote_host,
                remote_port,
            } => {
                self.create_local_forward(local_port, remote_host, remote_port)
                    .await
            }
            TunnelConfig::Remote {
                remote_port,
                local_host,
                local_port,
            } => {
                self.create_remote_forward(remote_port, local_host, local_port)
                    .await
            }
            TunnelConfig::Dynamic { local_port } => self.create_dynamic_forward(local_port).await,
        }
    }

    pub async fn create_local_forward(
        &self,
        local_port: u16,
        remote_host: String,
        remote_port: u16,
    ) -> Result<String> {
        let listener = TcpListener::bind(("127.0.0.1", local_port))
            .await
            .with_context(|| format!("failed to bind local port {local_port}"))?;
        let bound_port = listener.local_addr()?.port();
        let bytes_transferred = Arc::new(AtomicU64::new(0));
        let (stop_tx, stop_rx) = oneshot::channel();
        let tunnel_id = Uuid::new_v4();
        let handle = Arc::clone(&self.handle);
        let state = Arc::clone(&self.state);
        let remote_host_for_task = remote_host.clone();
        let bytes_for_task = Arc::clone(&bytes_transferred);

        let task = tokio::spawn(async move {
            if let Err(error) = Self::run_local_listener(
                handle,
                listener,
                stop_rx,
                remote_host_for_task,
                remote_port,
                bytes_for_task,
            )
            .await
            {
                Self::set_tunnel_error(state, tunnel_id, error.to_string()).await;
            }
        });

        self.state.lock().await.tunnels.insert(
            tunnel_id,
            ManagedTunnel {
                spec: TunnelSpec::Local {
                    local_port: bound_port,
                    remote_host,
                    remote_port,
                },
                status: TunnelStatus::Active,
                error_message: None,
                bytes_transferred,
                task: Some(task),
                stop_tx: Some(stop_tx),
            },
        );

        Ok(tunnel_id.to_string())
    }

    pub async fn create_remote_forward(
        &self,
        remote_port: u16,
        local_host: String,
        local_port: u16,
    ) -> Result<String> {
        let bound_port = {
            let mut handle = self.handle.lock().await;
            handle
                .tcpip_forward("127.0.0.1", u32::from(remote_port))
                .await
                .with_context(|| format!("failed to create remote forward on port {remote_port}"))?
                as u16
        };

        let (stop_tx, stop_rx) = oneshot::channel();
        let tunnel_id = Uuid::new_v4();
        let bytes_transferred = Arc::new(AtomicU64::new(0));
        let handle = Arc::clone(&self.handle);
        let state = Arc::clone(&self.state);

        let task = tokio::spawn(async move {
            let _ = stop_rx.await;

            let cancel_result = {
                let handle = handle.lock().await;
                handle.cancel_tcpip_forward("127.0.0.1", u32::from(bound_port)).await
            };

            if let Err(error) = cancel_result {
                Self::set_tunnel_error(state, tunnel_id, error.to_string()).await;
            }
        });

        self.state.lock().await.tunnels.insert(
            tunnel_id,
            ManagedTunnel {
                spec: TunnelSpec::Remote {
                    remote_port: bound_port,
                    local_host,
                    local_port,
                },
                status: TunnelStatus::Active,
                error_message: None,
                bytes_transferred,
                task: Some(task),
                stop_tx: Some(stop_tx),
            },
        );

        Ok(tunnel_id.to_string())
    }

    pub async fn create_dynamic_forward(&self, local_port: u16) -> Result<String> {
        let listener = TcpListener::bind(("127.0.0.1", local_port))
            .await
            .with_context(|| format!("failed to bind SOCKS port {local_port}"))?;
        let bound_port = listener.local_addr()?.port();
        let bytes_transferred = Arc::new(AtomicU64::new(0));
        let (stop_tx, stop_rx) = oneshot::channel();
        let tunnel_id = Uuid::new_v4();
        let handle = Arc::clone(&self.handle);
        let state = Arc::clone(&self.state);
        let bytes_for_task = Arc::clone(&bytes_transferred);

        let task = tokio::spawn(async move {
            if let Err(error) = Self::run_dynamic_listener(handle, listener, stop_rx, bytes_for_task).await {
                Self::set_tunnel_error(state, tunnel_id, error.to_string()).await;
            }
        });

        self.state.lock().await.tunnels.insert(
            tunnel_id,
            ManagedTunnel {
                spec: TunnelSpec::Dynamic {
                    local_port: bound_port,
                },
                status: TunnelStatus::Active,
                error_message: None,
                bytes_transferred,
                task: Some(task),
                stop_tx: Some(stop_tx),
            },
        );

        Ok(tunnel_id.to_string())
    }

    pub async fn stop_tunnel(&self, tunnel_id: &Uuid) -> Result<()> {
        let mut state = self.state.lock().await;
        let Some(tunnel) = state.tunnels.get_mut(tunnel_id) else {
            return Err(anyhow!("tunnel not found: {tunnel_id}"));
        };

        if matches!(tunnel.status, TunnelStatus::Stopped) {
            return Ok(());
        }

        if let Some(stop_tx) = tunnel.stop_tx.take() {
            let _ = stop_tx.send(());
        }

        if let Some(task) = tunnel.task.take() {
            task.abort();
        }

        tunnel.status = TunnelStatus::Stopped;
        tunnel.error_message = None;
        Ok(())
    }

    pub async fn stop_all(&self) {
        let tunnel_ids = {
            let state = self.state.lock().await;
            state.tunnels.keys().copied().collect::<Vec<_>>()
        };

        for tunnel_id in tunnel_ids {
            let _ = self.stop_tunnel(&tunnel_id).await;
        }
    }

    pub fn stop_all_blocking(&self) {
        let mut state = self.state.blocking_lock();

        for tunnel in state.tunnels.values_mut() {
            if let Some(stop_tx) = tunnel.stop_tx.take() {
                let _ = stop_tx.send(());
            }

            if let Some(task) = tunnel.task.take() {
                task.abort();
            }

            tunnel.status = TunnelStatus::Stopped;
            tunnel.error_message = None;
        }

        if let Some(task) = state.remote_forward_router.take() {
            task.abort();
        }
    }

    pub async fn list_tunnels(&self) -> Vec<TunnelInfo> {
        let state = self.state.lock().await;
        let session_id = state.session_id.clone().unwrap_or_default();

        state
            .tunnels
            .iter()
            .map(|(id, tunnel)| Self::build_tunnel_info(id, tunnel, &session_id))
            .collect()
    }

    pub async fn has_tunnel(&self, tunnel_id: &Uuid) -> bool {
        self.state.lock().await.tunnels.contains_key(tunnel_id)
    }

    async fn run_local_listener(
        handle: Arc<Mutex<client::Handle<SshHandler>>>,
        listener: TcpListener,
        mut stop_rx: oneshot::Receiver<()>,
        remote_host: String,
        remote_port: u16,
        bytes_transferred: Arc<AtomicU64>,
    ) -> Result<()> {
        loop {
            tokio::select! {
                _ = &mut stop_rx => return Ok(()),
                accept_result = listener.accept() => {
                    let (stream, _) = accept_result.context("failed to accept local forward connection")?;
                    let handle = Arc::clone(&handle);
                    let remote_host = remote_host.clone();
                    let bytes_transferred = Arc::clone(&bytes_transferred);

                    tokio::spawn(async move {
                        let _ = Self::bridge_local_connection(handle, stream, remote_host, remote_port, bytes_transferred).await;
                    });
                }
            }
        }
    }

    async fn bridge_local_connection(
        handle: Arc<Mutex<client::Handle<SshHandler>>>,
        stream: TcpStream,
        remote_host: String,
        remote_port: u16,
        bytes_transferred: Arc<AtomicU64>,
    ) -> Result<()> {
        let peer_addr = stream.peer_addr().ok();
        let originator_address = peer_addr
            .map(|addr| addr.ip().to_string())
            .unwrap_or_else(|| "127.0.0.1".to_string());
        let originator_port = peer_addr.map(|addr| u32::from(addr.port())).unwrap_or(0);

        let channel = {
            let handle = handle.lock().await;
            handle
                .channel_open_direct_tcpip(
                    remote_host,
                    u32::from(remote_port),
                    originator_address,
                    originator_port,
                )
                .await
                .context("failed to open direct-tcpip channel")?
        };

        Self::copy_streams(stream, channel, bytes_transferred).await
    }

    async fn run_dynamic_listener(
        handle: Arc<Mutex<client::Handle<SshHandler>>>,
        listener: TcpListener,
        mut stop_rx: oneshot::Receiver<()>,
        bytes_transferred: Arc<AtomicU64>,
    ) -> Result<()> {
        loop {
            tokio::select! {
                _ = &mut stop_rx => return Ok(()),
                accept_result = listener.accept() => {
                    let (stream, _) = accept_result.context("failed to accept SOCKS client")?;
                    let handle = Arc::clone(&handle);
                    let bytes_transferred = Arc::clone(&bytes_transferred);

                    tokio::spawn(async move {
                        let _ = Self::bridge_dynamic_connection(handle, stream, bytes_transferred).await;
                    });
                }
            }
        }
    }

    async fn bridge_dynamic_connection(
        handle: Arc<Mutex<client::Handle<SshHandler>>>,
        mut stream: TcpStream,
        bytes_transferred: Arc<AtomicU64>,
    ) -> Result<()> {
        let target = Self::perform_socks5_handshake(&mut stream).await?;
        let peer_addr = stream.peer_addr().ok();
        let originator_address = peer_addr
            .map(|addr| addr.ip().to_string())
            .unwrap_or_else(|| "127.0.0.1".to_string());
        let originator_port = peer_addr.map(|addr| u32::from(addr.port())).unwrap_or(0);

        let channel = {
            let handle = handle.lock().await;
            handle
                .channel_open_direct_tcpip(
                    target.0,
                    u32::from(target.1),
                    originator_address,
                    originator_port,
                )
                .await
                .context("failed to open dynamic forward channel")?
        };

        Self::copy_streams(stream, channel, bytes_transferred).await
    }

    async fn perform_socks5_handshake(stream: &mut TcpStream) -> Result<(String, u16)> {
        let mut greeting = [0u8; 2];
        stream.read_exact(&mut greeting).await?;

        if greeting[0] != 5 {
            return Err(anyhow!("unsupported SOCKS version: {}", greeting[0]));
        }

        let method_count = usize::from(greeting[1]);
        let mut methods = vec![0u8; method_count];
        stream.read_exact(&mut methods).await?;

        if !methods.contains(&0x00) {
            stream.write_all(&[0x05, 0xFF]).await?;
            return Err(anyhow!("SOCKS5 client does not support no-auth"));
        }

        stream.write_all(&[0x05, 0x00]).await?;

        let mut request_header = [0u8; 4];
        stream.read_exact(&mut request_header).await?;

        if request_header[0] != 5 {
            return Err(anyhow!("invalid SOCKS5 request version"));
        }

        if request_header[1] != 0x01 {
            stream.write_all(&[0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]).await?;
            return Err(anyhow!("only SOCKS5 CONNECT is supported"));
        }

        let address = match request_header[3] {
            0x01 => {
                let mut octets = [0u8; 4];
                stream.read_exact(&mut octets).await?;
                std::net::Ipv4Addr::from(octets).to_string()
            }
            0x03 => {
                let mut length = [0u8; 1];
                stream.read_exact(&mut length).await?;
                let mut host = vec![0u8; usize::from(length[0])];
                stream.read_exact(&mut host).await?;
                String::from_utf8(host).context("invalid SOCKS5 hostname")?
            }
            0x04 => {
                let mut octets = [0u8; 16];
                stream.read_exact(&mut octets).await?;
                std::net::Ipv6Addr::from(octets).to_string()
            }
            atyp => return Err(anyhow!("unsupported SOCKS5 address type: {atyp}")),
        };

        let mut port_bytes = [0u8; 2];
        stream.read_exact(&mut port_bytes).await?;
        let port = u16::from_be_bytes(port_bytes);

        stream
            .write_all(&[0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
            .await?;

        Ok((address, port))
    }

    async fn run_remote_forward_router(
        state: Arc<Mutex<TunnelState>>,
        mut forwarded_rx: mpsc::UnboundedReceiver<IncomingForwardedChannel>,
    ) {
        while let Some(incoming) = forwarded_rx.recv().await {
            let target = {
                let state = state.lock().await;
                state.tunnels.iter().find_map(|(id, tunnel)| match &tunnel.spec {
                    TunnelSpec::Remote {
                        remote_port,
                        local_host,
                        local_port,
                    } if *remote_port == incoming.connected_port && matches!(tunnel.status, TunnelStatus::Active) => {
                        Some((
                            *id,
                            local_host.clone(),
                            *local_port,
                            Arc::clone(&tunnel.bytes_transferred),
                        ))
                    }
                    _ => None,
                })
            };

            let Some((_, local_host, local_port, bytes_transferred)) = target else {
                let _ = incoming.channel.close().await;
                continue;
            };

            tokio::spawn(async move {
                let _ = Self::bridge_remote_connection(
                    incoming.channel,
                    local_host,
                    local_port,
                    bytes_transferred,
                )
                .await;
            });
        }
    }

    async fn bridge_remote_connection(
        channel: Channel<client::Msg>,
        local_host: String,
        local_port: u16,
        bytes_transferred: Arc<AtomicU64>,
    ) -> Result<()> {
        let stream = TcpStream::connect((local_host.as_str(), local_port))
            .await
            .with_context(|| format!("failed to connect to local target {local_host}:{local_port}"))?;

        Self::copy_streams(stream, channel, bytes_transferred).await
    }

    async fn copy_streams(
        stream: TcpStream,
        channel: Channel<client::Msg>,
        bytes_transferred: Arc<AtomicU64>,
    ) -> Result<()> {
        let mut tcp_stream = stream;
        let mut ssh_stream = channel.into_stream();
        let (sent, received) = copy_bidirectional(&mut tcp_stream, &mut ssh_stream)
            .await
            .context("failed to tunnel TCP traffic")?;

        bytes_transferred.fetch_add(sent + received, Ordering::Relaxed);
        let _ = ssh_stream.shutdown().await;
        Ok(())
    }

    fn build_tunnel_info(tunnel_id: &Uuid, tunnel: &ManagedTunnel, session_id: &str) -> TunnelInfo {
        match &tunnel.spec {
            TunnelSpec::Local {
                local_port,
                remote_host,
                remote_port,
            } => TunnelInfo {
                id: tunnel_id.to_string(),
                session_id: session_id.to_string(),
                tunnel_type: TunnelType::Local,
                local_port: Some(*local_port),
                remote_host: Some(remote_host.clone()),
                remote_port: Some(*remote_port),
                local_host: None,
                status: tunnel.status.clone(),
                bytes_transferred: tunnel.bytes_transferred.load(Ordering::Relaxed),
                error_message: tunnel.error_message.clone(),
            },
            TunnelSpec::Remote {
                remote_port,
                local_host,
                local_port,
            } => TunnelInfo {
                id: tunnel_id.to_string(),
                session_id: session_id.to_string(),
                tunnel_type: TunnelType::Remote,
                local_port: Some(*local_port),
                remote_host: None,
                remote_port: Some(*remote_port),
                local_host: Some(local_host.clone()),
                status: tunnel.status.clone(),
                bytes_transferred: tunnel.bytes_transferred.load(Ordering::Relaxed),
                error_message: tunnel.error_message.clone(),
            },
            TunnelSpec::Dynamic { local_port } => TunnelInfo {
                id: tunnel_id.to_string(),
                session_id: session_id.to_string(),
                tunnel_type: TunnelType::Dynamic,
                local_port: Some(*local_port),
                remote_host: None,
                remote_port: None,
                local_host: None,
                status: tunnel.status.clone(),
                bytes_transferred: tunnel.bytes_transferred.load(Ordering::Relaxed),
                error_message: tunnel.error_message.clone(),
            },
        }
    }

    async fn set_tunnel_error(state: Arc<Mutex<TunnelState>>, tunnel_id: Uuid, message: String) {
        if let Some(tunnel) = state.lock().await.tunnels.get_mut(&tunnel_id) {
            tunnel.status = TunnelStatus::Error;
            tunnel.error_message = Some(message);
        }
    }
}

impl SshHandler {
    pub(crate) async fn forward_remote_channel(
        &self,
        channel: Channel<client::Msg>,
        connected_port: u16,
    ) {
        let sender = self.forwarded_channel_sender().await;

        if let Some(sender) = sender {
            let _ = sender.send(IncomingForwardedChannel {
                channel,
                connected_port,
            });
        }
    }
}

pub(crate) fn forwarded_channel_sender(
) -> (
    mpsc::UnboundedSender<IncomingForwardedChannel>,
    mpsc::UnboundedReceiver<IncomingForwardedChannel>,
) {
    mpsc::unbounded_channel()
}

pub(crate) fn parse_tunnel_id(tunnel_id: &str) -> Result<Uuid> {
    Uuid::parse_str(tunnel_id).map_err(Into::into)
}
