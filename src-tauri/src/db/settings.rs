use anyhow::{Result, anyhow};
use rusqlite::{Connection as SqliteConnection, OptionalExtension, params};
use std::collections::HashMap;
use std::sync::Mutex;

pub struct SettingsRepo;

impl SettingsRepo {
    pub fn get(conn: &Mutex<SqliteConnection>, key: &str) -> Result<Option<String>> {
        let conn = conn.lock().map_err(|_| anyhow!("database mutex poisoned"))?;
        conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn set(conn: &Mutex<SqliteConnection>, key: &str, value: &str) -> Result<()> {
        let conn = conn.lock().map_err(|_| anyhow!("database mutex poisoned"))?;
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn get_all(conn: &Mutex<SqliteConnection>) -> Result<HashMap<String, String>> {
        let conn = conn.lock().map_err(|_| anyhow!("database mutex poisoned"))?;
        let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
        let rows = stmt.query_map([], |row| {
            let key: String = row.get(0)?;
            let value: Option<String> = row.get(1)?;
            Ok((key, value.unwrap_or_default()))
        })?;

        let entries = rows.collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(entries.into_iter().collect())
    }
}
