CREATE TABLE IF NOT EXISTS standing_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  quantity REAL,
  unit TEXT,
  category TEXT NOT NULL DEFAULT 'Other',
  store_id TEXT REFERENCES stores(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
