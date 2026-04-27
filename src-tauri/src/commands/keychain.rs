#[tauri::command]
pub async fn store_credential(connection_id: String, secret: String) -> Result<(), String> {
    crate::keychain::store_credential(&connection_id, &secret)
}

#[tauri::command]
pub async fn retrieve_credential(connection_id: String) -> Result<Option<String>, String> {
    crate::keychain::retrieve_credential(&connection_id)
}

#[tauri::command]
pub async fn delete_credential(connection_id: String) -> Result<(), String> {
    crate::keychain::delete_credential(&connection_id)
}

#[tauri::command]
pub async fn has_credential(connection_id: String) -> Result<bool, String> {
    Ok(crate::keychain::has_credential(&connection_id))
}
