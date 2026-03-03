ALTER TABLE ingredients ADD COLUMN category TEXT NOT NULL DEFAULT 'Other';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ingredient_stores (
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  PRIMARY KEY (ingredient_id, store_id)
);
--> statement-breakpoint
ALTER TABLE custom_grocery_items ADD COLUMN store_id TEXT REFERENCES stores(id) ON DELETE SET NULL;
