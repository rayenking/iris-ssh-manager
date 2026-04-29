ALTER TABLE snippets ADD COLUMN scope TEXT DEFAULT 'global';
ALTER TABLE snippets ADD COLUMN connection_ids TEXT;
