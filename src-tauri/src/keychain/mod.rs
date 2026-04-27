use keyring::Entry;

const SERVICE_NAME: &str = "iris-ssh-manager";

pub fn store_credential(connection_id: &str, secret: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, connection_id).map_err(|e| e.to_string())?;
    entry.set_password(secret).map_err(|e| e.to_string())
}

pub fn retrieve_credential(connection_id: &str) -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE_NAME, connection_id).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn delete_credential(connection_id: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, connection_id).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

pub fn has_credential(connection_id: &str) -> bool {
    Entry::new(SERVICE_NAME, connection_id)
        .and_then(|entry| entry.get_password())
        .is_ok()
}
