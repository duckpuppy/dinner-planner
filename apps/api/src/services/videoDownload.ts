/**
 * Video download service — wraps yt-dlp as a subprocess.
 */
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { stat, readFile, unlink, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const execFile = promisify(execFileCb);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In Docker the mount is /app/data/videos; in dev fall back to a local path
export const VIDEOS_DIR = process.env.VIDEOS_DIR ?? join(__dirname, '../../data/videos');

const DOWNLOAD_TIMEOUT = 600_000; // 10 minutes in ms

export interface DownloadResult {
  videoFilename: string;
  thumbnailFilename: string | null;
  infoJson: Record<string, unknown>;
  videoSize: number;
  videoDuration: number | null;
}

/**
 * Ensure the videos directory exists. Called on module load and before downloads.
 */
export async function ensureVideosDir(): Promise<void> {
  await mkdir(VIDEOS_DIR, { recursive: true });
}

// Initialise on module import (best-effort; errors surface during download)
ensureVideosDir().catch(() => {});

export function getVideosDir(): string {
  return VIDEOS_DIR;
}

/**
 * Download a video at `url` using yt-dlp and return metadata about the result.
 */
export async function downloadVideo(url: string): Promise<DownloadResult> {
  await ensureVideosDir();

  const uuid = randomUUID();
  const outputTemplate = join(VIDEOS_DIR, `${uuid}.%(ext)s`);
  const ytdlpBin = process.env.YTDLP_PATH ?? 'yt-dlp';

  const args = [
    '--merge-output-format',
    'mp4',
    '--write-info-json',
    '--write-thumbnail',
    '--convert-thumbnails',
    'jpg',
    '--max-filesize',
    '500M',
    '--no-playlist',
    '--socket-timeout',
    '30',
    '--output',
    outputTemplate,
    '--no-progress',
    url,
  ];

  try {
    await execFile(ytdlpBin, args, { timeout: DOWNLOAD_TIMEOUT });
  } catch (err: unknown) {
    const execErr = err as { killed?: boolean; stderr?: string; message?: string };
    if (execErr.killed) {
      throw new Error(`yt-dlp timed out after ${DOWNLOAD_TIMEOUT / 1000}s for URL: ${url}`, {
        cause: err,
      });
    }
    const detail = execErr.stderr?.trim() || execErr.message || String(err);
    throw new Error(`yt-dlp failed: ${detail}`, { cause: err });
  }

  // Read the info.json yt-dlp wrote alongside the video
  const infoJsonPath = join(VIDEOS_DIR, `${uuid}.info.json`);
  let infoJson: Record<string, unknown> = {};
  try {
    const raw = await readFile(infoJsonPath, 'utf-8');
    infoJson = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Non-fatal — metadata just won't be available
  }
  // Clean up info.json — we've read it and will store relevant bits in the DB
  await unlink(infoJsonPath).catch(() => {});

  // Find the actual video file (yt-dlp uses the UUID as a base, but extension varies)
  const files = await readdir(VIDEOS_DIR);
  const videoFile = files.find(
    (f) =>
      f.startsWith(uuid) &&
      !f.endsWith('.info.json') &&
      !f.endsWith('.jpg') &&
      !f.endsWith('.webp') &&
      !f.endsWith('.png')
  );
  if (!videoFile) {
    throw new Error(`yt-dlp finished but no video file found for UUID ${uuid}`);
  }

  const videoPath = join(VIDEOS_DIR, videoFile);
  const fileStat = await stat(videoPath);

  // Find thumbnail if present
  const thumbFile =
    files.find(
      (f) => f.startsWith(uuid) && (f.endsWith('.jpg') || f.endsWith('.webp') || f.endsWith('.png'))
    ) ?? null;

  const duration = typeof infoJson.duration === 'number' ? (infoJson.duration as number) : null;

  return {
    videoFilename: videoFile,
    thumbnailFilename: thumbFile,
    infoJson,
    videoSize: fileStat.size,
    videoDuration: duration,
  };
}

/**
 * Sum the total bytes used by all files in VIDEOS_DIR.
 */
export async function getVideoStorageUsage(): Promise<number> {
  try {
    const files = await readdir(VIDEOS_DIR);
    let total = 0;
    for (const file of files) {
      try {
        const s = await stat(join(VIDEOS_DIR, file));
        if (s.isFile()) {
          total += s.size;
        }
      } catch {
        // Skip files that disappear mid-iteration
      }
    }
    return total;
  } catch {
    return 0;
  }
}

/**
 * Delete the video file and any associated sidecar files (thumbnail, info.json).
 */
export async function deleteVideo(filename: string): Promise<void> {
  // Derive the UUID prefix — everything before the first dot
  const dotIdx = filename.indexOf('.');
  const prefix = dotIdx !== -1 ? filename.slice(0, dotIdx) : filename;

  let files: string[];
  try {
    files = await readdir(VIDEOS_DIR);
  } catch {
    return;
  }

  const toDelete = files.filter((f) => f.startsWith(prefix));
  await Promise.all(toDelete.map((f) => unlink(join(VIDEOS_DIR, f)).catch(() => {})));
}
