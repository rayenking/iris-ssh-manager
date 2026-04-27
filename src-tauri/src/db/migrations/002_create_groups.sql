CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    parent_id TEXT REFERENCES groups(id),
    sort_order INTEGER
);
