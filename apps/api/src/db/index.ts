import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { config } from '../config.js';

// Extract file path from DATABASE_URL (format: file:./path/to/db)
const dbPath = config.DATABASE_URL.replace('file:', '');

// Ensure data directory exists
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

export { schema };
