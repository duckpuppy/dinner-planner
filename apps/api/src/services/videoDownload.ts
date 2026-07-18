import { spawn } from 'node:child_process';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const VIDEOS_DIR = process.env.VIDEOS_DIR || join(process.cwd(), 'data', 'videos');

const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp';
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export interface DownloadResult {
  videoFilename: string;
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
    '--write-subs',
    '--write-auto-subs',
    '--sub-langs',
    'en.*,en',
    '--sub-format',
    'vtt',
    '-o',
    outputTemplate,
    url,
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

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
      child.stderr.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString();
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
          reject(
            Object.assign(new Error('Download timed out after 10 minutes'), { code: 'TIMEOUT' })
          );
        } else if (code !== 0) {
          reject(new Error(`yt-dlp exited with code ${code}`));
        } else {
          resolve();
        }
      });
    });
  } finally {
    clearTimeout(timer);
  }

  // Read the .info.json file
  const infoJsonPath = join(VIDEOS_DIR, `${uuid}.info.json`);
  let infoJson: Record<string, unknown> = {};
  try {
    const { readFile } = await import('node:fs/promises');
    const raw = await readFile(infoJsonPath, 'utf-8');
    infoJson = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // info.json may not always be present
  }

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

  // Locate subtitle file — yt-dlp names them as {uuid}.{lang}.vtt
  // When both --write-subs and --write-auto-subs match, prefer the manual
  // (non-auto-generated) subtitle file. yt-dlp marks auto-captions with an
  // "-orig" (or similar) suffix in the language code, e.g. {uuid}.en-orig.vtt
  // vs the manual {uuid}.en.vtt.
  let transcript: string | null = null;
  try {
    const dirFiles = await readdir(VIDEOS_DIR);
    const vttCandidates = dirFiles.filter((f) => f.startsWith(uuid) && f.endsWith('.vtt'));
    const vttFile = vttCandidates.find((f) => !/-orig/.test(f)) ?? vttCandidates[0];
    if (vttFile) {
      const { readFile } = await import('node:fs/promises');
      const vttContent = await readFile(join(VIDEOS_DIR, vttFile), 'utf-8');
      transcript = parseVtt(vttContent);
    }
  } catch {
    // Subtitle file may not exist
  }

  return {
    videoFilename,
    thumbnailFilename: hasThumbnail ? thumbnailFilename : null,
    infoJson,
    videoSize,
    videoDuration,
    transcript,
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
