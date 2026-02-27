CREATE TABLE custom_grocery_items (
  id TEXT PRIMARY KEY,
  week_date TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity REAL,
  unit TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_custom_grocery_items_week ON custom_grocery_items(week_date);
