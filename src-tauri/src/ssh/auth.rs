use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use russh::client;
use russh::client::KeyboardInteractiveAuthResponse;
use russh::keys::{self, PrivateKey};
use tokio::time::timeout;

const AUTH_METHOD_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone)]
pub enum AuthMethod {
    Password(String),
    PublicKey {
        key_path: PathBuf,
        passphrase: Option<String>,
    },
    Agent,
}

pub async fn authenticate<H>(
    session: &mut client::Handle<H>,
    username: &str,
    method: &AuthMethod,
) -> Result<bool>
where
    H: client::Handler,
{
    match method {
        AuthMethod::Password(password) => {
            authenticate_with_password(session, username, password).await
        }
        AuthMethod::PublicKey {
            key_path,
            passphrase,
        } => {
            let key = load_private_key(key_path, passphrase.as_deref())?;
            session
                .authenticate_publickey(username, Arc::new(key))
                .await
                .context("public key authentication failed")
                .map_err(Into::into)
        }
        AuthMethod::Agent => authenticate_with_agent(session, username).await,
    }
}

async fn authenticate_with_password<H>(
    session: &mut client::Handle<H>,
    username: &str,
    password: &str,
) -> Result<bool>
where
    H: client::Handler,
{
    // Try plain password auth first with a short timeout
    let pw_result = timeout(
        AUTH_METHOD_TIMEOUT,
        session.authenticate_password(username, password),
    )
    .await;

    match pw_result {
        Ok(Ok(authenticated)) => return Ok(authenticated),
        Ok(Err(error)) => return Err(error).context("password authentication failed"),
        Err(_) => {
            // Password auth timed out — server likely expects keyboard-interactive
        }
    }

    // Fallback: try keyboard-interactive
    let ki_result = timeout(
        AUTH_METHOD_TIMEOUT,
        session.authenticate_keyboard_interactive_start(username, None),
    )
    .await;

    if let Ok(Ok(response)) = ki_result {
        match response {
            KeyboardInteractiveAuthResponse::Success => return Ok(true),
            KeyboardInteractiveAuthResponse::Failure => return Ok(false),
            KeyboardInteractiveAuthResponse::InfoRequest { prompts, .. } => {
                let responses: Vec<String> = prompts
                    .iter()
                    .map(|_| password.to_string())
                    .collect();

                let reply_result = timeout(
                    AUTH_METHOD_TIMEOUT,
                    session.authenticate_keyboard_interactive_respond(responses),
                )
                .await;

                if let Ok(Ok(reply)) = reply_result {
                    return match reply {
                        KeyboardInteractiveAuthResponse::Success => Ok(true),
                        KeyboardInteractiveAuthResponse::Failure => Ok(false),
                        KeyboardInteractiveAuthResponse::InfoRequest { .. } => Ok(false),
                    };
                }
            }
        }
    }

    // Both methods timed out or failed
    Ok(false)
}

fn load_private_key(path: &PathBuf, passphrase: Option<&str>) -> Result<PrivateKey> {
    keys::load_secret_key(path, passphrase)
        .with_context(|| format!("failed to load SSH private key from {}", path.display()))
}

#[cfg(unix)]
async fn authenticate_with_agent<H>(session: &mut client::Handle<H>, username: &str) -> Result<bool>
where
    H: client::Handler,
{
    let mut agent = keys::agent::client::AgentClient::connect_env()
        .await
        .context("failed to connect to SSH agent via SSH_AUTH_SOCK")?;
    let public_key = agent
        .request_identities()
        .await
        .context("failed to request identities from SSH agent")?
        .into_iter()
        .next()
        .ok_or_else(|| anyhow!("SSH agent has no identities available"))?;

    session
        .authenticate_publickey_with(username, public_key, &mut agent)
        .await
        .map_err(|error| anyhow!(error))
}

#[cfg(windows)]
async fn authenticate_with_agent<H>(session: &mut client::Handle<H>, username: &str) -> Result<bool>
where
    H: client::Handler,
{
    let mut agent = keys::agent::client::AgentClient::connect_pageant().await;
    let public_key = agent
        .request_identities()
        .await
        .context("failed to request identities from Pageant")?
        .into_iter()
        .next()
        .ok_or_else(|| anyhow!("SSH agent has no identities available"))?;

    session
        .authenticate_publickey_with(username, public_key, &mut agent)
        .await
        .map_err(|error| anyhow!(error))
}

#[cfg(not(any(unix, windows)))]
async fn authenticate_with_agent<H>(_: &mut client::Handle<H>, _: &str) -> Result<bool>
where
    H: client::Handler,
{
    Err(anyhow!("SSH agent authentication is not supported on this platform"))
}
