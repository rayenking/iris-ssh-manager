use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

use crate::db::{
    connections::{Connection, ConnectionRepo, CreateConnectionInput},
    groups::{ConnectionGroup, CreateGroupInput, GroupRepo},
    settings::SettingsRepo,
    snippets::{CreateSnippetInput, Snippet, SnippetRepo},
    DbState,
};
use crate::keychain;

const EXPORT_VERSION: u32 = 1;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportData {
    pub version: u32,
    pub exported_at: String,
    pub connections: Vec<Connection>,
    pub groups: Vec<ConnectionGroup>,
    pub snippets: Vec<Snippet>,
    pub settings: HashMap<String, String>,
    pub credentials: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CredentialMap(HashMap<String, String>);

fn encrypt_credentials(data: &str, passphrase: &str) -> Result<String, String> {
    use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
    use aes_gcm::aead::Aead;
    use base64::Engine;
    use base64::engine::general_purpose::STANDARD;
    use pbkdf2::pbkdf2_hmac;
    use rand::RngCore;
    use sha2::Sha256;

    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);

    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(passphrase.as_bytes(), &salt, 100_000, &mut key);

    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, data.as_bytes())
        .map_err(|e| format!("Encryption failed: {e}"))?;

    let mut combined = Vec::with_capacity(16 + 12 + ciphertext.len());
    combined.extend_from_slice(&salt);
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);

    Ok(STANDARD.encode(&combined))
}

fn decrypt_credentials(encrypted: &str, passphrase: &str) -> Result<String, String> {
    use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
    use aes_gcm::aead::Aead;
    use base64::Engine;
    use base64::engine::general_purpose::STANDARD;
    use pbkdf2::pbkdf2_hmac;
    use sha2::Sha256;

    let combined = STANDARD
        .decode(encrypted)
        .map_err(|e| format!("Invalid encrypted data: {e}"))?;

    if combined.len() < 28 {
        return Err("Encrypted data too short".to_string());
    }

    let salt = &combined[..16];
    let nonce_bytes = &combined[16..28];
    let ciphertext = &combined[28..];

    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(passphrase.as_bytes(), salt, 100_000, &mut key);

    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Wrong passphrase or corrupted data".to_string())?;

    String::from_utf8(plaintext).map_err(|e| format!("Invalid UTF-8: {e}"))
}

#[tauri::command]
pub async fn export_data(
    db: State<'_, DbState>,
    include_passwords: bool,
    passphrase: Option<String>,
) -> Result<String, String> {
    let connections = ConnectionRepo::list_all(&db.0).map_err(|e| e.to_string())?;
    let groups = GroupRepo::list_all(&db.0).map_err(|e| e.to_string())?;
    let snippets = SnippetRepo::list_all(&db.0).map_err(|e| e.to_string())?;
    let settings = SettingsRepo::get_all(&db.0).map_err(|e| e.to_string())?;

    let credentials = if include_passwords {
        let pass = passphrase.ok_or("Passphrase required when including passwords")?;
        if pass.len() < 4 {
            return Err("Passphrase must be at least 4 characters".to_string());
        }

        let mut cred_map: HashMap<String, String> = HashMap::new();
        for conn in &connections {
            if let Ok(Some(secret)) = keychain::retrieve_credential(&conn.id) {
                cred_map.insert(conn.id.clone(), secret);
            }
        }

        if cred_map.is_empty() {
            None
        } else {
            let json = serde_json::to_string(&cred_map).map_err(|e| e.to_string())?;
            Some(encrypt_credentials(&json, &pass)?)
        }
    } else {
        None
    };

    let now = chrono::Utc::now().to_rfc3339();
    let export = ExportData {
        version: EXPORT_VERSION,
        exported_at: now,
        connections,
        groups,
        snippets,
        settings,
        credentials,
    };

    serde_json::to_string_pretty(&export).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub connections_count: usize,
    pub groups_count: usize,
    pub snippets_count: usize,
    pub settings_count: usize,
    pub has_credentials: bool,
}

#[tauri::command]
pub async fn preview_import(data: String) -> Result<ImportPreview, String> {
    let export: ExportData = serde_json::from_str(&data)
        .map_err(|e| format!("Invalid backup file: {e}"))?;

    Ok(ImportPreview {
        connections_count: export.connections.len(),
        groups_count: export.groups.len(),
        snippets_count: export.snippets.len(),
        settings_count: export.settings.len(),
        has_credentials: export.credentials.is_some(),
    })
}

#[tauri::command]
pub async fn import_data(
    db: State<'_, DbState>,
    data: String,
    passphrase: Option<String>,
    import_connections: bool,
    import_snippets: bool,
    import_settings: bool,
) -> Result<String, String> {
    let export: ExportData = serde_json::from_str(&data)
        .map_err(|e| format!("Invalid backup file: {e}"))?;

    let mut imported_connections = 0usize;
    let mut imported_groups = 0usize;
    let mut imported_snippets = 0usize;
    let mut imported_settings = 0usize;
    let mut imported_credentials = 0usize;

    let mut old_to_new_group: HashMap<String, String> = HashMap::new();

    if import_connections {
        for group in &export.groups {
            let input = CreateGroupInput {
                name: group.name.clone(),
                color: group.color.clone(),
                parent_id: group.parent_id.as_ref().and_then(|pid| old_to_new_group.get(pid).cloned()),
                sort_order: group.sort_order,
            };
            match GroupRepo::create(&db.0, &input) {
                Ok(new_group) => {
                    old_to_new_group.insert(group.id.clone(), new_group.id);
                    imported_groups += 1;
                }
                Err(_) => {}
            }
        }

        let mut old_to_new_conn: HashMap<String, String> = HashMap::new();

        for conn in &export.connections {
            let input = CreateConnectionInput {
                name: conn.name.clone(),
                hostname: conn.hostname.clone(),
                port: Some(conn.port),
                username: conn.username.clone(),
                auth_method: conn.auth_method.clone(),
                private_key_path: conn.private_key_path.clone(),
                group_id: conn.group_id.as_ref().and_then(|gid| old_to_new_group.get(gid).cloned()),
                color_tag: conn.color_tag.clone(),
                startup_command: conn.startup_command.clone(),
                last_connected_at: conn.last_connected_at.clone(),
                connection_count: Some(conn.connection_count),
                sort_order: conn.sort_order,
            };
            match ConnectionRepo::create(&db.0, &input) {
                Ok(new_conn) => {
                    old_to_new_conn.insert(conn.id.clone(), new_conn.id);
                    imported_connections += 1;
                }
                Err(_) => {}
            }
        }

        if let Some(ref encrypted) = export.credentials {
            if let Some(ref pass) = passphrase {
                match decrypt_credentials(encrypted, pass) {
                    Ok(json) => {
                        if let Ok(cred_map) = serde_json::from_str::<HashMap<String, String>>(&json) {
                            for (old_id, secret) in &cred_map {
                                if let Some(new_id) = old_to_new_conn.get(old_id) {
                                    if keychain::store_credential(new_id, secret).is_ok() {
                                        imported_credentials += 1;
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => return Err(format!("Failed to decrypt credentials: {e}")),
                }
            }
        }
    }

    if import_snippets {
        for snippet in &export.snippets {
            let input = CreateSnippetInput {
                name: snippet.name.clone(),
                command: snippet.command.clone(),
                category: snippet.category.clone(),
                variables: snippet.variables.clone(),
                sort_order: snippet.sort_order,
                scope: snippet.scope.clone(),
                connection_ids: snippet.connection_ids.clone(),
            };
            if SnippetRepo::create(&db.0, &input).is_ok() {
                imported_snippets += 1;
            }
        }
    }

    if import_settings {
        for (key, value) in &export.settings {
            if SettingsRepo::set(&db.0, key, value).is_ok() {
                imported_settings += 1;
            }
        }
    }

    Ok(format!(
        "Imported {} connections, {} groups, {} snippets, {} settings, {} credentials",
        imported_connections, imported_groups, imported_snippets, imported_settings, imported_credentials
    ))
}
