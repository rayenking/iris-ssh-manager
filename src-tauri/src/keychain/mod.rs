pub mod file_store;

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

const SERVICE_NAME: &str = "iris-ssh-manager";

static KEYCHAIN_AVAILABLE: AtomicBool = AtomicBool::new(false);
static USE_FILE_STORE: AtomicBool = AtomicBool::new(false);

fn use_file_store() -> bool {
    USE_FILE_STORE.load(Ordering::SeqCst)
}

pub fn init_keychain(app_data_dir: &Path) -> Result<(), String> {
    file_store::init(app_data_dir)?;

    if cfg!(debug_assertions) {
        USE_FILE_STORE.store(true, Ordering::SeqCst);
        return Ok(());
    }

    match init_os_keychain() {
        Ok(()) => {
            KEYCHAIN_AVAILABLE.store(true, Ordering::SeqCst);
            Ok(())
        }
        Err(e) => {
            log::warn!("OS Keychain unavailable ({e}), falling back to file store");
            USE_FILE_STORE.store(true, Ordering::SeqCst);
            Ok(())
        }
    }
}

fn init_os_keychain() -> Result<(), String> {
    // keyring-rs v3 auto-detects the platform backend, no manual init needed
    Ok(())
}

fn is_os_keychain_available() -> bool {
    KEYCHAIN_AVAILABLE.load(Ordering::SeqCst)
}

pub fn store_credential(connection_id: &str, secret: &str) -> Result<(), String> {
    if use_file_store() {
        return file_store::store_credential(connection_id, secret);
    }
    if !is_os_keychain_available() {
        return Ok(());
    }
    let entry = keyring::Entry::new(SERVICE_NAME, connection_id).map_err(|e| e.to_string())?;
    entry.set_password(secret).map_err(|e| e.to_string())
}

pub fn retrieve_credential(connection_id: &str) -> Result<Option<String>, String> {
    if use_file_store() {
        return file_store::retrieve_credential(connection_id);
    }
    if !is_os_keychain_available() {
        return Ok(None);
    }
    let entry = keyring::Entry::new(SERVICE_NAME, connection_id).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn delete_credential(connection_id: &str) -> Result<(), String> {
    if use_file_store() {
        return file_store::delete_credential(connection_id);
    }
    if !is_os_keychain_available() {
        return Ok(());
    }
    let entry = keyring::Entry::new(SERVICE_NAME, connection_id).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

pub fn has_credential(connection_id: &str) -> bool {
    if use_file_store() {
        return file_store::has_credential(connection_id);
    }
    if !is_os_keychain_available() {
        return false;
    }
    keyring::Entry::new(SERVICE_NAME, connection_id)
        .and_then(|entry| entry.get_password())
        .is_ok()
}
