use std::collections::HashMap;
use tauri::State;
use crate::db::DbState;
use crate::db::settings::SettingsRepo;

#[tauri::command]
pub async fn get_setting(db: State<'_, DbState>, key: String) -> Result<Option<String>, String> {
    SettingsRepo::get(&db.0, &key).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_setting(db: State<'_, DbState>, key: String, value: String) -> Result<(), String> {
    SettingsRepo::set(&db.0, &key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_all_settings(db: State<'_, DbState>) -> Result<HashMap<String, String>, String> {
    SettingsRepo::get_all(&db.0).map_err(|e| e.to_string())
}
