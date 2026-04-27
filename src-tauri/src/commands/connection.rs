use tauri::State;

use crate::db::{
    ConnectionGroup, ConnectionRepo, CreateConnectionInput, CreateGroupInput, DbConnection, DbState,
    GroupRepo, UpdateConnectionInput, UpdateGroupInput,
};

#[tauri::command]
pub async fn list_connections(db: State<'_, DbState>) -> Result<Vec<DbConnection>, String> {
    ConnectionRepo::list_all(&db.0).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_connection(db: State<'_, DbState>, id: String) -> Result<DbConnection, String> {
    ConnectionRepo::get_by_id(&db.0, &id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("connection not found: {id}"))
}

#[tauri::command]
pub async fn create_connection(
    db: State<'_, DbState>,
    data: CreateConnectionInput,
) -> Result<DbConnection, String> {
    ConnectionRepo::create(&db.0, &data).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn update_connection(
    db: State<'_, DbState>,
    id: String,
    data: UpdateConnectionInput,
) -> Result<DbConnection, String> {
    ConnectionRepo::update(&db.0, &id, &data).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn delete_connection(db: State<'_, DbState>, id: String) -> Result<(), String> {
    ConnectionRepo::delete(&db.0, &id).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn duplicate_connection(
    db: State<'_, DbState>,
    id: String,
) -> Result<DbConnection, String> {
    ConnectionRepo::duplicate(&db.0, &id).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn search_connections(
    db: State<'_, DbState>,
    query: String,
) -> Result<Vec<DbConnection>, String> {
    ConnectionRepo::search(&db.0, &query).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn list_groups(db: State<'_, DbState>) -> Result<Vec<ConnectionGroup>, String> {
    GroupRepo::list_all(&db.0).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn create_group(
    db: State<'_, DbState>,
    data: CreateGroupInput,
) -> Result<ConnectionGroup, String> {
    GroupRepo::create(&db.0, &data).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn update_group(
    db: State<'_, DbState>,
    id: String,
    data: UpdateGroupInput,
) -> Result<ConnectionGroup, String> {
    GroupRepo::update(&db.0, &id, &data).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn delete_group(db: State<'_, DbState>, id: String) -> Result<(), String> {
    GroupRepo::delete(&db.0, &id).map_err(|error| error.to_string())
}
