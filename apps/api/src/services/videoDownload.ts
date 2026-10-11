import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { VIDEOS_DIR } from '../dataPaths.js';
import { isVideoCommentsEnabled, VIDEO_IMPORT_MAX_COMMENTS } from './videoImportConfig.js';
import { appendTail, buildExitError, YtdlpError } from './ytdlpErrors.js';

export { VIDEOS_DIR };

const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp';
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const METADATA_TIMEOUT_MS = 60 * 1000; // 60 seconds

export interface DownloadResult {
  /** null when only metadata could be fetched (metadata-only fallback) */
  videoFilename: string | null;
  thumbnailFilename: string | null;
  infoJson: Record<string, unknown>;
  videoSize: number;
  videoDuration: number | null;
  transcript: string | null;
}

export async function ensureVideosDir(): Promise<void> {
  await mkdir(VIDEOS_DIR, { recursive: true });
}

const PROGRESS_RE = /\[download\]\s+([\d.]+)%/;

const SUBTITLE_ARGS = [
  '--write-subs',
  '--write-auto-subs',
  '--sub-langs',
  'en.*,en',
  '--sub-format',
  'vtt',
];

/**
 * Optional comment-fetching flags (VIDEO_IMPORT_COMMENTS=true).
 * `youtube:max_comments` is `max-comments,max-parents,max-replies,max-replies-per-thread,max-depth`
 * (yt-dlp README, "EXTRACTOR ARGUMENTS > youtube"). yt-dlp's TikTok extractor does not
 * support comments, so this is effectively YouTube-only.
 */
function commentArgs(): string[] {
  if (!isVideoCommentsEnabled()) return [];
  const n = VIDEO_IMPORT_MAX_COMMENTS;
  return ['--write-comments', '--extractor-args', `youtube:max_comments=${n},${n},0,0,1`];
}

/** Spawn yt-dlp, capturing a bounded stderr tail. Rejects with YtdlpError on failure/timeout. */
async function runYtdlp(
  args: string[],
  timeoutMs: number,
  onProgress?: (percent: number) => void
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(YTDLP_PATH, args);

      let lastPct = -1;
      const parseLine = (line: string) => {
        if (!onProgress) return;
        const match = PROGRESS_RE.exec(line);
        if (match) {
          const pct = Math.min(99, Math.floor(parseFloat(match[1])));
          if (pct > lastPct) {
            lastPct = pct;
            onProgress(pct);
          }
        }
      };

      let stderrBuf = '';
      let stderrTail = '';
      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderrTail = appendTail(stderrTail, text);
        stderrBuf += text;
        const lines = stderrBuf.split('\n');
        stderrBuf = lines.pop() ?? '';
        lines.forEach(parseLine);
      });

      // Some yt-dlp versions write progress to stdout
      child.stdout.on('data', (chunk: Buffer) => {
        chunk.toString().split('\n').forEach(parseLine);
      });

      controller.signal.addEventListener('abort', () => child.kill('SIGTERM'));

      child.on('error', reject);
      child.on('close', (code) => {
        if (controller.signal.aborted) {
          const secs = Math.round(timeoutMs / 1000);
          const label = secs >= 120 ? `${Math.round(secs / 60)} minutes` : `${secs} seconds`;
          const msg = `Download timed out after ${label}`;
          reject(new YtdlpError(msg, 'TIMEOUT', msg));
        } else if (code !== 0) {
          reject(buildExitError(code, stderrTail));
        } else {
          resolve();
        }
      });
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readInfoJson(uuid: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(join(VIDEOS_DIR, `${uuid}.info.json`), 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // info.json may not always be present
    return {};
  }
}

async function readTranscript(uuid: string): Promise<string | null> {
  // Locate subtitle file — yt-dlp names them as {uuid}.{lang}.vtt
  // When both --write-subs and --write-auto-subs match, prefer the manual
  // (non-auto-generated) subtitle file. yt-dlp marks auto-captions with an
  // "-orig" (or similar) suffix in the language code, e.g. {uuid}.en-orig.vtt
  // vs the manual {uuid}.en.vtt.
  try {
    const dirFiles = await readdir(VIDEOS_DIR);
    const vttCandidates = dirFiles.filter((f) => f.startsWith(uuid) && f.endsWith('.vtt'));
    const vttFile = vttCandidates.find((f) => !/-orig/.test(f)) ?? vttCandidates[0];
    if (vttFile) {
      const vttContent = await readFile(join(VIDEOS_DIR, vttFile), 'utf-8');
      return parseVtt(vttContent);
    }
  } catch {
    // Subtitle file may not exist
  }
  return null;
}

export async function downloadVideo(
  url: string,
  onProgress?: (percent: number) => void
): Promise<DownloadResult> {
  await ensureVideosDir();

  const uuid = randomUUID();
  const outputTemplate = join(VIDEOS_DIR, `${uuid}.%(ext)s`);

  const args = [
    '--newline',
    '--progress',
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
    ...SUBTITLE_ARGS,
    ...commentArgs(),
    '-o',
    outputTemplate,
    url,
  ];

  await runYtdlp(args, DOWNLOAD_TIMEOUT_MS, onProgress);

  const infoJson = await readInfoJson(uuid);

  // Locate the output video file
  const videoFilename = `${uuid}.mp4`;
  const videoPath = join(VIDEOS_DIR, videoFilename);

  let videoSize = 0;
  try {
    const s = await stat(videoPath);
    videoSize = s.size;
  } catch {
    // File may not exist if download failed silently
  }

  const videoDuration = typeof infoJson.duration === 'number' ? infoJson.duration : null;

  // Locate thumbnail
  const thumbnailFilename = `${uuid}.jpg`;
  const thumbnailPath = join(VIDEOS_DIR, thumbnailFilename);
  let hasThumbnail: boolean;
  try {
    await stat(thumbnailPath);
    hasThumbnail = true;
  } catch {
    hasThumbnail = false;
  }

  const transcript = await readTranscript(uuid);

  return {
    videoFilename,
    thumbnailFilename: hasThumbnail ? thumbnailFilename : null,
    infoJson,
    videoSize,
    videoDuration,
    transcript,
  };
}

/**
 * Metadata-only pass (no video file): used as a fallback when the full download fails.
 * Throws if yt-dlp fails or produces no info.json.
 */
export async function fetchMetadataOnly(url: string): Promise<DownloadResult> {
  await ensureVideosDir();

  const uuid = randomUUID();
  const outputTemplate = join(VIDEOS_DIR, `${uuid}.%(ext)s`);

  const args = [
    '--skip-download',
    '--write-info-json',
    '--no-playlist',
    '--socket-timeout',
    '30',
    ...SUBTITLE_ARGS,
    ...commentArgs(),
    '-o',
    outputTemplate,
    url,
  ];

  await runYtdlp(args, METADATA_TIMEOUT_MS);

  const infoJson = await readInfoJson(uuid);
  if (Object.keys(infoJson).length === 0) {
    const msg = 'yt-dlp produced no metadata';
    throw new YtdlpError(msg, 'YTDLP_FAILED', msg);
  }

  return {
    videoFilename: null,
    thumbnailFilename: null,
    infoJson,
    videoSize: 0,
    videoDuration: typeof infoJson.duration === 'number' ? infoJson.duration : null,
    transcript: await readTranscript(uuid),
  };
}

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
        // Skip files that can't be stat'd
      }
    }
    return total;
  } catch {
    return 0;
  }
}

export async function deleteVideo(filename: string): Promise<void> {
  const base = filename.replace(/\.[^.]+$/, '');
  // Note: .vtt/.srt are intentionally NOT in this list — actual subtitle
  // filenames are {base}.{lang}.vtt (e.g. {uuid}.en.vtt), which never match
  // a flat `${base}${ext}` join. The readdir-based loop below is the sole
  // mechanism that actually cleans up subtitle files.
  const extensions = ['.mp4', '.info.json', '.jpg', '.webm', '.mkv'];
  for (const ext of extensions) {
    try {
      await unlink(join(VIDEOS_DIR, `${base}${ext}`));
    } catch {
      // Ignore missing files
    }
  }

  // Also clean up subtitle files which have language codes in the name
  // Pattern: {base}.{lang}.vtt or {base}.{lang}.srt
  try {
    const dirFiles = await readdir(VIDEOS_DIR);
    for (const f of dirFiles) {
      if (f.startsWith(base) && (f.endsWith('.vtt') || f.endsWith('.srt'))) {
        try {
          await unlink(join(VIDEOS_DIR, f));
        } catch {
          // Ignore
        }
      }
    }
  } catch {
    // Ignore
  }
}

const VTT_TIMESTAMP_RE = /^\d{2}:\d{2}/;

/**
 * Parse WebVTT content to plain text, stripping timestamps,
 * formatting tags, and deduplicating lines (yt-dlp auto-subs
 * often repeat lines across overlapping cue windows).
 */
export function parseVtt(vttContent: string): string {
  const lines = vttContent.split('\n');
  const textLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip WEBVTT header, NOTE lines, cue timing lines, and blank lines
    if (
      line.startsWith('WEBVTT') ||
      line.startsWith('NOTE') ||
      line.startsWith('Kind:') ||
      line.startsWith('Language:') ||
      VTT_TIMESTAMP_RE.test(line) ||
      line.trim() === ''
    ) {
      continue;
    }

    // Cue identifier lines are numeric-only AND, in valid VTT, always
    // immediately followed by a timestamp line. Content-shape-only
    // matching (numeric text) would wrongly drop a legitimate standalone
    // numeric caption (e.g. an oven temp like "350") that isn't actually
    // a cue identifier.
    if (/^[\d]+$/.test(line.trim()) && VTT_TIMESTAMP_RE.test(lines[i + 1] ?? '')) {
      continue;
    }

    // Strip VTT formatting tags like <c>, </c>, <b>, etc.
    const cleaned = line
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();

    // Only dedupe against the immediately preceding output line (a sliding
    // window of 1) — yt-dlp auto-subs repeat lines across overlapping cue
    // windows, but a global dedupe set would also collapse two genuinely
    // distinct, non-adjacent occurrences of the same line elsewhere in the
    // transcript (e.g. a repeated instruction used twice).
    if (cleaned && cleaned !== textLines[textLines.length - 1]) {
      textLines.push(cleaned);
    }
  }

  const result = textLines.join(' ').trim();
  return result || '';
}
