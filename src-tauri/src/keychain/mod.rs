use keyring_core::Entry;
use std::sync::atomic::{AtomicBool, Ordering};

const SERVICE_NAME: &str = "iris-ssh-manager";

static KEYCHAIN_AVAILABLE: AtomicBool = AtomicBool::new(false);

/// Initialize the platform-specific credential store.
/// Must be called once at app startup before any keychain operations.
pub fn init_keychain() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let store = apple_native_keyring_store::keychain::Store::new()
            .map_err(|e| format!("Failed to initialize keychain: {e}"))?;
        keyring_core::set_default_store(store);
    }
    #[cfg(target_os = "windows")]
    {
        let store = windows_native_keyring_store::Store::new()
            .map_err(|e| format!("Failed to initialize keychain: {e}"))?;
        keyring_core::set_default_store(store);
    }
    #[cfg(target_os = "linux")]
    {
        let store = dbus_secret_service_keyring_store::Store::new()
            .map_err(|e| format!("Failed to initialize keychain: {e}"))?;
        keyring_core::set_default_store(store);
    }
    KEYCHAIN_AVAILABLE.store(true, Ordering::SeqCst);
    Ok(())
}

fn is_available() -> bool {
    KEYCHAIN_AVAILABLE.load(Ordering::SeqCst)
}

pub fn store_credential(connection_id: &str, secret: &str) -> Result<(), String> {
    if !is_available() {
        return Ok(()); // silently skip when keychain unavailable
    }
    let entry = Entry::new(SERVICE_NAME, connection_id).map_err(|e| e.to_string())?;
    entry.set_password(secret).map_err(|e| e.to_string())
}

pub fn retrieve_credential(connection_id: &str) -> Result<Option<String>, String> {
    if !is_available() {
        return Ok(None);
    }
    let entry = Entry::new(SERVICE_NAME, connection_id).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring_core::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn delete_credential(connection_id: &str) -> Result<(), String> {
    if !is_available() {
        return Ok(());
    }
    let entry = Entry::new(SERVICE_NAME, connection_id).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring_core::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

pub fn has_credential(connection_id: &str) -> bool {
    if !is_available() {
        return false;
    }
    Entry::new(SERVICE_NAME, connection_id)
        .and_then(|entry| entry.get_password())
        .is_ok()
}
