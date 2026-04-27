use anyhow::{Result, anyhow};
use rusqlite::{Connection as SqliteConnection, OptionalExtension, Row, params};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connection {
    pub id: String,
    pub name: String,
    pub hostname: String,
    pub port: i64,
    pub username: String,
    pub auth_method: String,
    pub private_key_path: Option<String>,
    pub group_id: Option<String>,
    pub color_tag: Option<String>,
    pub startup_command: Option<String>,
    pub last_connected_at: Option<String>,
    pub connection_count: i64,
    pub sort_order: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateConnectionInput {
    pub name: String,
    pub hostname: String,
    pub port: Option<i64>,
    pub username: String,
    pub auth_method: String,
    pub private_key_path: Option<String>,
    pub group_id: Option<String>,
    pub color_tag: Option<String>,
    pub startup_command: Option<String>,
    pub last_connected_at: Option<String>,
    pub connection_count: Option<i64>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UpdateConnectionInput {
    pub name: Option<String>,
    pub hostname: Option<String>,
    pub port: Option<i64>,
    pub username: Option<String>,
    pub auth_method: Option<String>,
    pub private_key_path: Option<String>,
    pub group_id: Option<String>,
    pub color_tag: Option<String>,
    pub startup_command: Option<String>,
    pub last_connected_at: Option<String>,
    pub connection_count: Option<i64>,
    pub sort_order: Option<i64>,
}

pub struct ConnectionRepo;

impl ConnectionRepo {
    pub fn list_all(conn: &Mutex<SqliteConnection>) -> Result<Vec<Connection>> {
        let conn = conn.lock().map_err(|_| anyhow!("database mutex poisoned"))?;
        list_all_with_conn(&conn)
    }

    pub fn get_by_id(conn: &Mutex<SqliteConnection>, id: &str) -> Result<Option<Connection>> {
        let conn = conn.lock().map_err(|_| anyhow!("database mutex poisoned"))?;
        get_by_id_with_conn(&conn, id)
    }

    pub fn create(conn: &Mutex<SqliteConnection>, data: &CreateConnectionInput) -> Result<Connection> {
        let conn = conn.lock().map_err(|_| anyhow!("database mutex poisoned"))?;
        create_with_conn(&conn, data)
    }

    pub fn update(
        conn: &Mutex<SqliteConnection>,
        id: &str,
        data: &UpdateConnectionInput,
    ) -> Result<Connection> {
        let conn = conn.lock().map_err(|_| anyhow!("database mutex poisoned"))?;
        update_with_conn(&conn, id, data)
    }

    pub fn delete(conn: &Mutex<SqliteConnection>, id: &str) -> Result<()> {
        let conn = conn.lock().map_err(|_| anyhow!("database mutex poisoned"))?;
        delete_with_conn(&conn, id)
    }

    pub fn duplicate(conn: &Mutex<SqliteConnection>, id: &str) -> Result<Connection> {
        let conn = conn.lock().map_err(|_| anyhow!("database mutex poisoned"))?;
        duplicate_with_conn(&conn, id)
    }

    pub fn search(conn: &Mutex<SqliteConnection>, query: &str) -> Result<Vec<Connection>> {
        let conn = conn.lock().map_err(|_| anyhow!("database mutex poisoned"))?;
        search_with_conn(&conn, query)
    }
}

fn list_all_with_conn(conn: &SqliteConnection) -> Result<Vec<Connection>> {
    let mut stmt = conn.prepare(
        "
        SELECT id, name, hostname, port, username, auth_method, private_key_path, group_id,
               color_tag, startup_command, last_connected_at, connection_count, sort_order,
               created_at, updated_at
        FROM connections
        ORDER BY sort_order IS NULL, sort_order ASC, name COLLATE NOCASE ASC
        ",
    )?;

    let rows = stmt.query_map([], map_connection)?;
    let items = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(items)
}

fn get_by_id_with_conn(conn: &SqliteConnection, id: &str) -> Result<Option<Connection>> {
    conn.query_row(
        "
        SELECT id, name, hostname, port, username, auth_method, private_key_path, group_id,
               color_tag, startup_command, last_connected_at, connection_count, sort_order,
               created_at, updated_at
        FROM connections
        WHERE id = ?1
        ",
        params![id],
        map_connection,
    )
    .optional()
    .map_err(Into::into)
}

fn create_with_conn(conn: &SqliteConnection, data: &CreateConnectionInput) -> Result<Connection> {
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "
        INSERT INTO connections (
            id, name, hostname, port, username, auth_method, private_key_path, group_id,
            color_tag, startup_command, last_connected_at, connection_count, sort_order,
            created_at, updated_at
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        )
        ",
        params![
            id,
            data.name,
            data.hostname,
            data.port.unwrap_or(22),
            data.username,
            data.auth_method,
            data.private_key_path,
            data.group_id,
            data.color_tag,
            data.startup_command,
            data.last_connected_at,
            data.connection_count.unwrap_or(0),
            data.sort_order,
        ],
    )?;

    require_connection(conn, &id)
}

fn update_with_conn(
    conn: &SqliteConnection,
    id: &str,
    data: &UpdateConnectionInput,
) -> Result<Connection> {
    let existing = require_connection(conn, id)?;

    conn.execute(
        "
        UPDATE connections
        SET name = ?2,
            hostname = ?3,
            port = ?4,
            username = ?5,
            auth_method = ?6,
            private_key_path = ?7,
            group_id = ?8,
            color_tag = ?9,
            startup_command = ?10,
            last_connected_at = ?11,
            connection_count = ?12,
            sort_order = ?13,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?1
        ",
        params![
            id,
            data.name.as_deref().unwrap_or(existing.name.as_str()),
            data.hostname.as_deref().unwrap_or(existing.hostname.as_str()),
            data.port.unwrap_or(existing.port),
            data.username.as_deref().unwrap_or(existing.username.as_str()),
            data.auth_method
                .as_deref()
                .unwrap_or(existing.auth_method.as_str()),
            data.private_key_path.as_ref().or(existing.private_key_path.as_ref()),
            data.group_id.as_ref().or(existing.group_id.as_ref()),
            data.color_tag.as_ref().or(existing.color_tag.as_ref()),
            data.startup_command
                .as_ref()
                .or(existing.startup_command.as_ref()),
            data.last_connected_at
                .as_ref()
                .or(existing.last_connected_at.as_ref()),
            data.connection_count.unwrap_or(existing.connection_count),
            data.sort_order.or(existing.sort_order),
        ],
    )?;

    require_connection(conn, id)
}

fn delete_with_conn(conn: &SqliteConnection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM connections WHERE id = ?1", params![id])?;
    Ok(())
}

fn duplicate_with_conn(conn: &SqliteConnection, id: &str) -> Result<Connection> {
    let existing = require_connection(conn, id)?;
    let duplicated = CreateConnectionInput {
        name: format!("{} (copy)", existing.name),
        hostname: existing.hostname,
        port: Some(existing.port),
        username: existing.username,
        auth_method: existing.auth_method,
        private_key_path: existing.private_key_path,
        group_id: existing.group_id,
        color_tag: existing.color_tag,
        startup_command: existing.startup_command,
        last_connected_at: existing.last_connected_at,
        connection_count: Some(existing.connection_count),
        sort_order: existing.sort_order,
    };

    create_with_conn(conn, &duplicated)
}

fn search_with_conn(conn: &SqliteConnection, query: &str) -> Result<Vec<Connection>> {
    let like_query = format!("%{query}%");
    let mut stmt = conn.prepare(
        "
        SELECT id, name, hostname, port, username, auth_method, private_key_path, group_id,
               color_tag, startup_command, last_connected_at, connection_count, sort_order,
               created_at, updated_at
        FROM connections
        WHERE name LIKE ?1 OR hostname LIKE ?1 OR username LIKE ?1
        ORDER BY sort_order IS NULL, sort_order ASC, name COLLATE NOCASE ASC
        ",
    )?;

    let rows = stmt.query_map(params![like_query], map_connection)?;
    let items = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(items)
}

fn require_connection(conn: &SqliteConnection, id: &str) -> Result<Connection> {
    get_by_id_with_conn(conn, id)?.ok_or_else(|| anyhow!("connection not found: {id}"))
}

fn map_connection(row: &Row<'_>) -> rusqlite::Result<Connection> {
    Ok(Connection {
        id: row.get(0)?,
        name: row.get(1)?,
        hostname: row.get(2)?,
        port: row.get(3)?,
        username: row.get(4)?,
        auth_method: row.get(5)?,
        private_key_path: row.get(6)?,
        group_id: row.get(7)?,
        color_tag: row.get(8)?,
        startup_command: row.get(9)?,
        last_connected_at: row.get(10)?,
        connection_count: row.get(11)?,
        sort_order: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}
