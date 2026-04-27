use tauri::State;
use crate::db::DbState;
use crate::db::snippets::{CreateSnippetInput, Snippet, SnippetRepo, UpdateSnippetInput};

#[tauri::command]
pub async fn list_snippets(db: State<'_, DbState>) -> Result<Vec<Snippet>, String> {
    SnippetRepo::list_all(&db.0).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_snippet(db: State<'_, DbState>, data: CreateSnippetInput) -> Result<Snippet, String> {
    SnippetRepo::create(&db.0, &data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_snippet(
    db: State<'_, DbState>,
    id: String,
    data: UpdateSnippetInput,
) -> Result<Snippet, String> {
    SnippetRepo::update(&db.0, &id, &data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_snippet(db: State<'_, DbState>, id: String) -> Result<(), String> {
    SnippetRepo::delete(&db.0, &id).map_err(|e| e.to_string())
}
