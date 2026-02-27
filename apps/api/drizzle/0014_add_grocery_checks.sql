CREATE TABLE IF NOT EXISTS grocery_checks (
  week_date TEXT NOT NULL,
  item_key  TEXT NOT NULL,
  item_name TEXT NOT NULL,
  checked_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (week_date, item_key)
);
