use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedSshHost {
    pub host_alias: String,
    pub hostname: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub identity_file: Option<String>,
    pub proxy_jump: Option<String>,
    pub local_forwards: Vec<String>,
    pub remote_forwards: Vec<String>,
    pub dynamic_forwards: Vec<String>,
}

pub fn default_ssh_config_path() -> Result<PathBuf> {
    let home = dirs::home_dir().context("could not resolve home directory")?;
    Ok(home.join(".ssh").join("config"))
}

pub fn parse_ssh_config(path: &str) -> Result<Vec<ParsedSshHost>> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("failed to read SSH config at {path}"))?;

    let mut hosts: Vec<ParsedSshHost> = Vec::new();
    let mut current: Option<HostBuilder> = None;

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let (key, value) = match split_directive(trimmed) {
            Some(pair) => pair,
            None => continue,
        };

        if key.eq_ignore_ascii_case("Host") {
            if let Some(builder) = current.take() {
                hosts.extend(builder.build());
            }
            current = Some(HostBuilder::new(value));
        } else if let Some(ref mut builder) = current {
            builder.apply(key, value);
        }
    }

    if let Some(builder) = current.take() {
        hosts.extend(builder.build());
    }

    Ok(hosts)
}

fn split_directive(line: &str) -> Option<(&str, &str)> {
    let line = line.trim();

    if let Some(eq_pos) = line.find('=') {
        let key = line[..eq_pos].trim();
        let value = line[eq_pos + 1..].trim();
        if !key.is_empty() && !value.is_empty() {
            return Some((key, value));
        }
    }

    let mut parts = line.splitn(2, char::is_whitespace);
    let key = parts.next()?.trim();
    let value = parts.next()?.trim();
    if key.is_empty() || value.is_empty() {
        return None;
    }
    Some((key, value))
}

fn expand_tilde(path: &str) -> String {
    if path.starts_with("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(&path[2..]).to_string_lossy().into_owned();
        }
    }
    path.to_string()
}

struct HostBuilder {
    aliases: Vec<String>,
    hostname: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    identity_file: Option<String>,
    proxy_jump: Option<String>,
    local_forwards: Vec<String>,
    remote_forwards: Vec<String>,
    dynamic_forwards: Vec<String>,
}

impl HostBuilder {
    fn new(host_line: &str) -> Self {
        let aliases: Vec<String> = host_line
            .split_whitespace()
            .map(|s| s.to_string())
            .collect();

        Self {
            aliases,
            hostname: None,
            port: None,
            username: None,
            identity_file: None,
            proxy_jump: None,
            local_forwards: Vec::new(),
            remote_forwards: Vec::new(),
            dynamic_forwards: Vec::new(),
        }
    }

    fn apply(&mut self, key: &str, value: &str) {
        match key.to_ascii_lowercase().as_str() {
            "hostname" => self.hostname = Some(value.to_string()),
            "port" => self.port = value.parse().ok(),
            "user" => self.username = Some(value.to_string()),
            "identityfile" => self.identity_file = Some(expand_tilde(value)),
            "proxyjump" => self.proxy_jump = Some(value.to_string()),
            "localforward" => self.local_forwards.push(value.to_string()),
            "remoteforward" => self.remote_forwards.push(value.to_string()),
            "dynamicforward" => self.dynamic_forwards.push(value.to_string()),
            _ => {}
        }
    }

    fn build(self) -> Vec<ParsedSshHost> {
        self.aliases
            .into_iter()
            .filter(|alias| alias != "*")
            .filter(|alias| !alias.contains('*') && !alias.contains('?'))
            .map(|alias| ParsedSshHost {
                host_alias: alias,
                hostname: self.hostname.clone(),
                port: self.port,
                username: self.username.clone(),
                identity_file: self.identity_file.clone(),
                proxy_jump: self.proxy_jump.clone(),
                local_forwards: self.local_forwards.clone(),
                remote_forwards: self.remote_forwards.clone(),
                dynamic_forwards: self.dynamic_forwards.clone(),
            })
            .collect()
    }
}
