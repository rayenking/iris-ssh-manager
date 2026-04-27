use anyhow::{Result, anyhow};
use rusqlite::{Connection as SqliteConnection, OptionalExtension, Row, params};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snippet {
    pub id: String,
    pub name: String,
    pub command: String,
    pub category: Option<String>,
    pub variables: Option<String>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSnippetInput {
    pub name: String,
    pub command: String,
    pub category: Option<String>,
    pub variables: Option<String>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UpdateSnippetInput {
    pub name: Option<String>,
    pub command: Option<String>,
    pub category: Option<String>,
    pub variables: Option<String>,
    pub sort_order: Option<i64>,
}

pub struct SnippetRepo;

impl SnippetRepo {
    pub fn list_all(conn: &Mutex<SqliteConnection>) -> Result<Vec<Snippet>> {
        let conn = conn.lock().map_err(|_| anyhow!("database mutex poisoned"))?;
        list_all_with_conn(&conn)
    }

    pub fn get_by_id(conn: &Mutex<SqliteConnection>, id: &str) -> Result<Option<Snippet>> {
        let conn = conn.lock().map_err(|_| anyhow!("database mutex poisoned"))?;
        get_by_id_with_conn(&conn, id)
    }

    pub fn create(conn: &Mutex<SqliteConnection>, data: &CreateSnippetInput) -> Result<Snippet> {
        let conn = conn.lock().map_err(|_| anyhow!("database mutex poisoned"))?;
        create_with_conn(&conn, data)
    }

    pub fn update(
        conn: &Mutex<SqliteConnection>,
        id: &str,
        data: &UpdateSnippetInput,
    ) -> Result<Snippet> {
        let conn = conn.lock().map_err(|_| anyhow!("database mutex poisoned"))?;
        update_with_conn(&conn, id, data)
    }

    pub fn delete(conn: &Mutex<SqliteConnection>, id: &str) -> Result<()> {
        let conn = conn.lock().map_err(|_| anyhow!("database mutex poisoned"))?;
        delete_with_conn(&conn, id)
    }
}

fn list_all_with_conn(conn: &SqliteConnection) -> Result<Vec<Snippet>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, command, category, variables, sort_order FROM snippets ORDER BY sort_order IS NULL, sort_order ASC, name COLLATE NOCASE ASC",
    )?;
    let rows = stmt.query_map([], map_snippet)?;
    let items = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(items)
}

fn get_by_id_with_conn(conn: &SqliteConnection, id: &str) -> Result<Option<Snippet>> {
    conn.query_row(
        "SELECT id, name, command, category, variables, sort_order FROM snippets WHERE id = ?1",
        params![id],
        map_snippet,
    )
    .optional()
    .map_err(Into::into)
}

fn create_with_conn(conn: &SqliteConnection, data: &CreateSnippetInput) -> Result<Snippet> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO snippets (id, name, command, category, variables, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, data.name, data.command, data.category, data.variables, data.sort_order],
    )?;
    require_snippet(conn, &id)
}

fn update_with_conn(
    conn: &SqliteConnection,
    id: &str,
    data: &UpdateSnippetInput,
) -> Result<Snippet> {
    let existing = require_snippet(conn, id)?;
    conn.execute(
        "
        UPDATE snippets
        SET name = ?2,
            command = ?3,
            category = ?4,
            variables = ?5,
            sort_order = ?6
        WHERE id = ?1
        ",
        params![
            id,
            data.name.as_deref().unwrap_or(existing.name.as_str()),
            data.command.as_deref().unwrap_or(existing.command.as_str()),
            data.category.as_ref().or(existing.category.as_ref()),
            data.variables.as_ref().or(existing.variables.as_ref()),
            data.sort_order.or(existing.sort_order),
        ],
    )?;
    require_snippet(conn, id)
}

fn delete_with_conn(conn: &SqliteConnection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM snippets WHERE id = ?1", params![id])?;
    Ok(())
}

fn require_snippet(conn: &SqliteConnection, id: &str) -> Result<Snippet> {
    get_by_id_with_conn(conn, id)?.ok_or_else(|| anyhow!("snippet not found: {id}"))
}

fn map_snippet(row: &Row<'_>) -> rusqlite::Result<Snippet> {
    Ok(Snippet {
        id: row.get(0)?,
        name: row.get(1)?,
        command: row.get(2)?,
        category: row.get(3)?,
        variables: row.get(4)?,
        sort_order: row.get(5)?,
    })
}
