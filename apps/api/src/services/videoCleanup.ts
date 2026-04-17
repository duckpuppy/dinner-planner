import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { VIDEOS_DIR, deleteVideo } from './videoDownload.js';
import { db, schema } from '../db/index.js';

export interface CleanupResult {
  deletedFiles: string[];
  freedBytes: number;
  errors: string[];
}

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Scan the videos directory and delete any files whose base UUID is not
 * referenced by either a dish (local_video_filename) or a video_job
 * (result_video_filename). Files modified within the last hour are skipped to
 * avoid deleting in-progress downloads.
 */
export async function cleanupOrphanedVideos(): Promise<CleanupResult> {
  const result: CleanupResult = { deletedFiles: [], freedBytes: 0, errors: [] };

  // 1. List all files currently on disk
  let files: string[];
  try {
    files = await readdir(VIDEOS_DIR);
  } catch {
    // Directory doesn't exist — nothing to clean
    return result;
  }

  // 2. Collect all referenced base UUIDs from the DB
  const referencedUUIDs = new Set<string>();

  const dishRows = await db
    .select({ localVideoFilename: schema.dishes.localVideoFilename })
    .from(schema.dishes)
    .all();

  for (const row of dishRows) {
    if (row.localVideoFilename) {
      // Strip extension to get the base UUID
      const base = row.localVideoFilename.replace(/\.[^.]+$/, '');
      referencedUUIDs.add(base);
    }
  }

  const jobRows = await db
    .select({ resultVideoFilename: schema.videoJobs.resultVideoFilename })
    .from(schema.videoJobs)
    .all();

  for (const row of jobRows) {
    if (row.resultVideoFilename) {
      const base = row.resultVideoFilename.replace(/\.[^.]+$/, '');
      referencedUUIDs.add(base);
    }
  }

  // 3. Evaluate each file on disk
  const now = Date.now();

  for (const file of files) {
    const filePath = join(VIDEOS_DIR, file);

    let fileStat: Awaited<ReturnType<typeof stat>>;
    try {
      fileStat = await stat(filePath);
    } catch {
      // Can't stat — skip
      continue;
    }

    if (!fileStat.isFile()) continue;

    // Extract base UUID (everything before the first dot that follows the UUID)
    // Files look like: <uuid>.mp4 / <uuid>.info.json / <uuid>.jpg
    const base = file.replace(/^([^.]+).*$/, '$1');

    if (referencedUUIDs.has(base)) {
      // Referenced — keep it
      continue;
    }

    // Safety: skip recently modified files (in-progress downloads)
    if (now - fileStat.mtimeMs < ONE_HOUR_MS) {
      continue;
    }

    // Orphaned — delete via deleteVideo (handles all companion extensions)
    // Only call deleteVideo once per UUID to avoid redundant calls
    // We track by the original filename since deleteVideo accepts any filename
    // and strips the extension internally.
    try {
      const bytes = fileStat.size;
      await deleteVideo(file);
      result.deletedFiles.push(file);
      result.freedBytes += bytes;
    } catch (err) {
      result.errors.push(`Failed to delete ${file}: ${String(err)}`);
    }
  }

  const mb = (result.freedBytes / 1024 / 1024).toFixed(1);
  console.log(
    `Video cleanup: deleted ${result.deletedFiles.length} orphaned files, freed ${mb} MB`
  );

  return result;
}
