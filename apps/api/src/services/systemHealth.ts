import { eq, and, sql, gte, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { getVideoStorageUsage } from './videoDownload.js';
import { config } from '../config.js';

export interface SystemHealth {
  videoStorage: {
    usedBytes: number;
    usedMb: number;
    limitMb: number;
    percentUsed: number;
  };
  videoJobs: {
    pending: number;
    downloading: number;
    complete: number;
    failed: number;
    total: number;
  };
  cleanup: {
    lastRun: string | null; // ISO date of most recent cleanup event
    lastResult: {
      deletedFiles: number;
      freedBytes: number;
      errors: number;
    } | null;
    schedulerEnabled: boolean;
    schedulerConfig: string; // e.g., "daily at 03:00" or "every 6h" or "disabled"
  };
  events: {
    errorsLast24h: number;
    warningsLast24h: number;
    errorsLast7d: number;
  };
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Video storage
  const usedBytes = await getVideoStorageUsage();
  const usedMb = usedBytes / (1024 * 1024);
  const limitMb = config.VIDEO_STORAGE_LIMIT_MB;
  const percentUsed = limitMb > 0 ? (usedMb / limitMb) * 100 : 0;

  // 2. Video job counts by status
  const jobRows = await db
    .select({
      status: schema.videoJobs.status,
      count: sql<number>`count(*)`,
    })
    .from(schema.videoJobs)
    .groupBy(schema.videoJobs.status);

  const jobCounts: Record<string, number> = {
    pending: 0,
    downloading: 0,
    complete: 0,
    failed: 0,
  };
  let jobTotal = 0;
  for (const row of jobRows) {
    const status = row.status;
    if (status in jobCounts) {
      jobCounts[status] = row.count;
    }
    jobTotal += row.count;
  }

  // 3. Cleanup info — most recent cleanup event
  const cleanupRows = await db
    .select({
      createdAt: schema.appEvents.createdAt,
      details: schema.appEvents.details,
    })
    .from(schema.appEvents)
    .where(eq(schema.appEvents.category, 'cleanup'))
    .orderBy(desc(schema.appEvents.createdAt))
    .limit(1);

  let lastRun: string | null = null;
  let lastResult: SystemHealth['cleanup']['lastResult'] = null;

  if (cleanupRows.length > 0) {
    const row = cleanupRows[0];
    lastRun = row.createdAt;
    if (row.details) {
      try {
        const parsed = JSON.parse(row.details) as Record<string, unknown>;
        const deletedFiles =
          typeof parsed.deletedFiles === 'number'
            ? parsed.deletedFiles
            : Array.isArray(parsed.deletedFiles)
              ? parsed.deletedFiles.length
              : 0;
        const freedBytes = typeof parsed.freedBytes === 'number' ? parsed.freedBytes : 0;
        const errors =
          typeof parsed.errors === 'number'
            ? parsed.errors
            : Array.isArray(parsed.errors)
              ? parsed.errors.length
              : 0;
        lastResult = { deletedFiles, freedBytes, errors };
      } catch {
        // Malformed details — leave lastResult null
      }
    }
  }

  // Scheduler config string
  const intervalHours = config.VIDEO_CLEANUP_INTERVAL_HOURS;
  const cleanupTime = config.VIDEO_CLEANUP_TIME;
  let schedulerEnabled: boolean;
  let schedulerConfig: string;

  if (intervalHours === 0) {
    schedulerEnabled = false;
    schedulerConfig = 'disabled';
  } else if (intervalHours === 24) {
    schedulerEnabled = true;
    schedulerConfig = `daily at ${cleanupTime}`;
  } else {
    schedulerEnabled = true;
    schedulerConfig = `every ${intervalHours}h`;
  }

  // 4. Event counts for error/warning time windows
  const errorsLast24hRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.appEvents)
    .where(and(eq(schema.appEvents.level, 'error'), gte(schema.appEvents.createdAt, since24h)));

  const warningsLast24hRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.appEvents)
    .where(and(eq(schema.appEvents.level, 'warn'), gte(schema.appEvents.createdAt, since24h)));

  const errorsLast7dRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.appEvents)
    .where(and(eq(schema.appEvents.level, 'error'), gte(schema.appEvents.createdAt, since7d)));

  return {
    videoStorage: {
      usedBytes,
      usedMb: Math.round(usedMb * 100) / 100,
      limitMb,
      percentUsed: Math.round(percentUsed * 100) / 100,
    },
    videoJobs: {
      pending: jobCounts.pending,
      downloading: jobCounts.downloading,
      complete: jobCounts.complete,
      failed: jobCounts.failed,
      total: jobTotal,
    },
    cleanup: {
      lastRun,
      lastResult,
      schedulerEnabled,
      schedulerConfig,
    },
    events: {
      errorsLast24h: errorsLast24hRows[0]?.count ?? 0,
      warningsLast24h: warningsLast24hRows[0]?.count ?? 0,
      errorsLast7d: errorsLast7dRows[0]?.count ?? 0,
    },
  };
}
