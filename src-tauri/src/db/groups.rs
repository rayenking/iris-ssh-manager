use anyhow::{Result, anyhow};
use rusqlite::{Connection as SqliteConnection, OptionalExtension, Row, params};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionGroup {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub parent_id: Option<String>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateGroupInput {
    pub name: String,
    pub color: Option<String>,
    pub parent_id: Option<String>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateGroupInput {
    pub name: Option<String>,
    pub color: Option<String>,
    pub parent_id: Option<String>,
    pub sort_order: Option<i64>,
}

pub struct GroupRepo;

impl GroupRepo {
    pub fn list_all(conn: &Mutex<SqliteConnection>) -> Result<Vec<ConnectionGroup>> {
        let conn = conn.lock().map_err(|_| anyhow!("database mutex poisoned"))?;
        list_all_with_conn(&conn)
    }

    pub fn get_by_id(conn: &Mutex<SqliteConnection>, id: &str) -> Result<Option<ConnectionGroup>> {
        let conn = conn.lock().map_err(|_| anyhow!("database mutex poisoned"))?;
        get_by_id_with_conn(&conn, id)
    }

    pub fn create(conn: &Mutex<SqliteConnection>, data: &CreateGroupInput) -> Result<ConnectionGroup> {
        let conn = conn.lock().map_err(|_| anyhow!("database mutex poisoned"))?;
        create_with_conn(&conn, data)
    }

    pub fn update(
        conn: &Mutex<SqliteConnection>,
        id: &str,
        data: &UpdateGroupInput,
    ) -> Result<ConnectionGroup> {
        let conn = conn.lock().map_err(|_| anyhow!("database mutex poisoned"))?;
        update_with_conn(&conn, id, data)
    }

    pub fn delete(conn: &Mutex<SqliteConnection>, id: &str) -> Result<()> {
        let conn = conn.lock().map_err(|_| anyhow!("database mutex poisoned"))?;
        delete_with_conn(&conn, id)
    }
}

fn list_all_with_conn(conn: &SqliteConnection) -> Result<Vec<ConnectionGroup>> {
    let mut stmt = conn.prepare(
        "
        SELECT id, name, color, parent_id, sort_order
        FROM groups
        ORDER BY sort_order IS NULL, sort_order ASC, name COLLATE NOCASE ASC
        ",
    )?;
    let rows = stmt.query_map([], map_group)?;
    let items = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(items)
}

fn get_by_id_with_conn(conn: &SqliteConnection, id: &str) -> Result<Option<ConnectionGroup>> {
    conn.query_row(
        "SELECT id, name, color, parent_id, sort_order FROM groups WHERE id = ?1",
        params![id],
        map_group,
    )
    .optional()
    .map_err(Into::into)
}

fn create_with_conn(conn: &SqliteConnection, data: &CreateGroupInput) -> Result<ConnectionGroup> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO groups (id, name, color, parent_id, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, data.name, data.color, data.parent_id, data.sort_order],
    )?;
    require_group(conn, &id)
}

fn update_with_conn(
    conn: &SqliteConnection,
    id: &str,
    data: &UpdateGroupInput,
) -> Result<ConnectionGroup> {
    let existing = require_group(conn, id)?;
    conn.execute(
        "
        UPDATE groups
        SET name = ?2,
            color = ?3,
            parent_id = ?4,
            sort_order = ?5
        WHERE id = ?1
        ",
        params![
            id,
            data.name.as_deref().unwrap_or(existing.name.as_str()),
            data.color.as_ref().or(existing.color.as_ref()),
            data.parent_id.as_ref().or(existing.parent_id.as_ref()),
            data.sort_order.or(existing.sort_order),
        ],
    )?;
    require_group(conn, id)
}

fn delete_with_conn(conn: &SqliteConnection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM groups WHERE id = ?1", params![id])?;
    Ok(())
}

fn require_group(conn: &SqliteConnection, id: &str) -> Result<ConnectionGroup> {
    get_by_id_with_conn(conn, id)?.ok_or_else(|| anyhow!("group not found: {id}"))
}

fn map_group(row: &Row<'_>) -> rusqlite::Result<ConnectionGroup> {
    Ok(ConnectionGroup {
        id: row.get(0)?,
        name: row.get(1)?,
        color: row.get(2)?,
        parent_id: row.get(3)?,
        sort_order: row.get(4)?,
    })
}
