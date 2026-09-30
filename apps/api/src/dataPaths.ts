import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { config } from './config.js';

/**
 * Single source of truth for where user data (photos, videos) lives on disk.
 *
 * Everything is derived from DATABASE_URL so media always sits next to the
 * SQLite file, i.e. on the same persistent volume (/app/data in Docker).
 */

/** Absolute filesystem path of the SQLite file named by a DATABASE_URL. */
export function resolveDbFilePath(databaseUrl: string, cwd: string = process.cwd()): string {
  const raw = databaseUrl.replace('file:', '');
  return isAbsolute(raw) ? raw : resolve(cwd, raw);
}

/** Absolute directory containing the database file. */
export function resolveDataDir(databaseUrl: string, cwd: string = process.cwd()): string {
  return dirname(resolveDbFilePath(databaseUrl, cwd));
}

export const DATA_DIR = resolveDataDir(config.DATABASE_URL);
export const VIDEOS_DIR = config.VIDEOS_DIR || join(DATA_DIR, 'videos');
export const UPLOADS_DIR = config.UPLOADS_DIR || join(DATA_DIR, 'uploads');

/** Create the media directories if missing (older volumes predate them). */
export function ensureDataDirs(dirs: string[] = [VIDEOS_DIR, UPLOADS_DIR]): void {
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }
}
