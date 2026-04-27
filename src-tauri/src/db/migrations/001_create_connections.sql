CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    hostname TEXT NOT NULL,
    port INTEGER DEFAULT 22,
    username TEXT NOT NULL,
    auth_method TEXT NOT NULL,
    private_key_path TEXT,
    group_id TEXT,
    color_tag TEXT,
    startup_command TEXT,
    last_connected_at TEXT,
    connection_count INTEGER DEFAULT 0,
    sort_order INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
