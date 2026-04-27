use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use anyhow::{Context, Result, anyhow};
use rusqlite::{Connection, OptionalExtension, params};

pub mod connections;
pub mod groups;
pub mod settings;
pub mod snippets;

pub use connections::{Connection as DbConnection, ConnectionRepo, CreateConnectionInput, UpdateConnectionInput};
pub use groups::{ConnectionGroup, CreateGroupInput, GroupRepo, UpdateGroupInput};
pub use settings::SettingsRepo;
pub use snippets::{CreateSnippetInput, Snippet, SnippetRepo, UpdateSnippetInput};

pub struct DbState(pub Mutex<Connection>);

const MIGRATIONS: [(&str, &str); 5] = [
    (
        "001_create_connections.sql",
        include_str!("migrations/001_create_connections.sql"),
    ),
    (
        "002_create_groups.sql",
        include_str!("migrations/002_create_groups.sql"),
    ),
    (
        "003_create_settings.sql",
        include_str!("migrations/003_create_settings.sql"),
    ),
    (
        "004_create_snippets.sql",
        include_str!("migrations/004_create_snippets.sql"),
    ),
    (
        "005_create_migrations.sql",
        include_str!("migrations/005_create_migrations.sql"),
    ),
];

pub fn default_app_data_dir() -> Result<PathBuf> {
    let data_dir = dirs::data_dir().context("failed to resolve OS app data directory")?;
    Ok(data_dir.join("iris-ssh-manager"))
}

pub fn init_db(app_data_dir: &Path) -> Result<Connection> {
    fs::create_dir_all(app_data_dir).with_context(|| {
        format!(
            "failed to create database directory at {}",
            app_data_dir.display()
        )
    })?;

    let db_path = app_data_dir.join("iris-ssh-manager.db");
    let connection = Connection::open(&db_path)
        .with_context(|| format!("failed to open database at {}", db_path.display()))?;

    connection
        .pragma_update(None, "journal_mode", "WAL")
        .context("failed to enable WAL mode")?;

    run_migrations(&connection)?;

    Ok(connection)
}

fn run_migrations(conn: &Connection) -> Result<()> {
    ensure_migrations_table(conn)?;

    for (name, sql) in MIGRATIONS {
        let already_applied = conn
            .query_row(
                "SELECT 1 FROM _migrations WHERE name = ?1 LIMIT 1",
                params![name],
                |row| row.get::<_, i64>(0),
            )
            .optional()?
            .is_some();

        if already_applied {
            continue;
        }

        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(sql)
            .with_context(|| format!("failed to apply migration {name}"))?;
        tx.execute(
            "INSERT INTO _migrations (name, applied_at) VALUES (?1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            params![name],
        )
        .with_context(|| format!("failed to record migration {name}"))?;
        tx.commit()?;
    }

    Ok(())
}

fn ensure_migrations_table(conn: &Connection) -> Result<()> {
    let exists = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_migrations' LIMIT 1",
            [],
            |row| row.get::<_, i64>(0),
        )
        .optional()?
        .is_some();

    if exists {
        return Ok(());
    }

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS _migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
        );
        ",
    )
    .map_err(|err| anyhow!(err))?;

    Ok(())
}
