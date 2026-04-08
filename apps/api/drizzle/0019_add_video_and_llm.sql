-- Add local video storage columns to dishes
ALTER TABLE dishes ADD COLUMN local_video_filename TEXT;
-->statement-breakpoint
ALTER TABLE dishes ADD COLUMN video_thumbnail_filename TEXT;
-->statement-breakpoint
ALTER TABLE dishes ADD COLUMN video_size INTEGER;
-->statement-breakpoint
ALTER TABLE dishes ADD COLUMN video_duration INTEGER;
-->statement-breakpoint
-- Add LLM/video settings to app_settings
ALTER TABLE app_settings ADD COLUMN ollama_url TEXT;
-->statement-breakpoint
ALTER TABLE app_settings ADD COLUMN ollama_model TEXT DEFAULT 'gemma4-e4b';
-->statement-breakpoint
ALTER TABLE app_settings ADD COLUMN llm_mode TEXT DEFAULT 'disabled';
-->statement-breakpoint
ALTER TABLE app_settings ADD COLUMN n8n_webhook_url TEXT;
-->statement-breakpoint
ALTER TABLE app_settings ADD COLUMN video_storage_limit_mb INTEGER DEFAULT 10240;
-->statement-breakpoint
-- Job queue for async video operations
CREATE TABLE video_jobs (
  id TEXT PRIMARY KEY,
  dish_id TEXT REFERENCES dishes(id) ON DELETE SET NULL,
  source_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  result_video_filename TEXT,
  result_metadata TEXT,
  extracted_recipe TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
