import { cleanupOrphanedVideos } from './videoCleanup.js';
import { config } from '../config.js';
import { logEvent } from './appEvents.js';

let schedulerTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Start a scheduled orphaned-video cleanup job.
 *
 * Env vars (consumed via config):
 *   VIDEO_CLEANUP_INTERVAL_HOURS — hours between cleanups (default 24, 0 to disable)
 *   VIDEO_CLEANUP_TIME           — HH:MM in 24h format for daily runs (default "03:00")
 *                                  Only used when interval is exactly 24.
 */
export function startVideoCleanupScheduler(): void {
  const intervalHours = config.VIDEO_CLEANUP_INTERVAL_HOURS;

  if (intervalHours <= 0 || isNaN(intervalHours)) {
    console.log('Video cleanup scheduler disabled (VIDEO_CLEANUP_INTERVAL_HOURS=0)');
    return;
  }

  void logEvent({
    level: 'info',
    category: 'system',
    message: `Video cleanup scheduler started: ${intervalHours === 24 ? `daily at ${config.VIDEO_CLEANUP_TIME}` : `every ${intervalHours}h`}`,
  });

  if (intervalHours === 24) {
    scheduleDailyAt(config.VIDEO_CLEANUP_TIME);
  } else {
    const intervalMs = intervalHours * 60 * 60 * 1000;
    console.log(`Video cleanup scheduler: every ${intervalHours}h`);
    schedulerTimer = setInterval(runCleanup, intervalMs);
  }
}

export function stopVideoCleanupScheduler(): void {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

function scheduleDailyAt(timeStr: string): void {
  const [hours, minutes] = timeStr.split(':').map(Number);

  const now = new Date();
  const next = new Date();
  next.setHours(hours, minutes, 0, 0);

  // If the scheduled time has already passed today, push to tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  const delayMs = next.getTime() - now.getTime();
  console.log(
    `Video cleanup scheduler: daily at ${timeStr} (next run in ${Math.round(delayMs / 60000)} minutes)`
  );

  schedulerTimer = setTimeout(() => {
    void runCleanup();
    // After the first run, repeat every 24 hours
    schedulerTimer = setInterval(runCleanup, 24 * 60 * 60 * 1000);
  }, delayMs);
}

async function runCleanup(): Promise<void> {
  try {
    console.log('Video cleanup: starting scheduled cleanup...');
    const result = await cleanupOrphanedVideos();
    if (result.deletedFiles.length > 0) {
      console.log(
        `Video cleanup: deleted ${result.deletedFiles.length} files, freed ${(result.freedBytes / 1024 / 1024).toFixed(1)} MB`
      );
    } else {
      console.log('Video cleanup: no orphaned files found');
    }
    if (result.errors.length > 0) {
      console.warn(`Video cleanup: ${result.errors.length} errors:`, result.errors);
    }
  } catch (err) {
    console.error('Video cleanup: scheduler error:', err);
  }
}
