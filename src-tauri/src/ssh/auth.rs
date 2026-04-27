use std::path::PathBuf;
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use russh::client;
use russh::keys::{self, PrivateKey};

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
        AuthMethod::Password(password) => session
            .authenticate_password(username, password)
            .await
            .context("password authentication failed")
            .map_err(Into::into),
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
