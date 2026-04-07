/**
 * Video job queue — manages lifecycle of yt-dlp download jobs in SQLite.
 */
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '../db/index.js';
import { downloadVideo, getVideoStorageUsage } from './videoDownload.js';

export type VideoJobRow = typeof schema.videoJobs.$inferSelect;

export async function createVideoJob(sourceUrl: string, dishId?: string): Promise<string> {
  const id = randomUUID();
  await db.insert(schema.videoJobs).values({
    id,
    dishId: dishId ?? null,
    sourceUrl,
    status: 'pending',
    progress: 0,
  });
  return id;
}

export async function getVideoJob(jobId: string): Promise<VideoJobRow | null> {
  const [job] = await db.select().from(schema.videoJobs).where(eq(schema.videoJobs.id, jobId));
  return job ?? null;
}

export async function listVideoJobs(): Promise<VideoJobRow[]> {
  return db.select().from(schema.videoJobs);
}

/**
 * Run the download pipeline for a job.
 *
 * @param jobId        The job to process.
 * @param storageLimitMb  Max allowed total storage in MB (0 = unlimited).
 *
 * Call fire-and-forget:
 *   processVideoJob(id, limit).catch(err => logger.error(err));
 */
export async function processVideoJob(jobId: string, storageLimitMb: number): Promise<void> {
  const job = await getVideoJob(jobId);
  if (!job) {
    throw new Error(`Video job not found: ${jobId}`);
  }

  // Check storage limit before starting
  if (storageLimitMb > 0) {
    const usedBytes = await getVideoStorageUsage();
    const limitBytes = storageLimitMb * 1024 * 1024;
    if (usedBytes >= limitBytes) {
      await updateJob(jobId, {
        status: 'failed',
        error: `Storage limit of ${storageLimitMb} MB reached`,
      });
      return;
    }
  }

  await updateJob(jobId, { status: 'downloading', progress: 0 });

  try {
    const result = await downloadVideo(job.sourceUrl);

    const metadata = {
      title: result.infoJson.title,
      description: result.infoJson.description,
      uploader: result.infoJson.uploader,
      upload_date: result.infoJson.upload_date,
      duration: result.videoDuration,
      filesize: result.videoSize,
      thumbnailFilename: result.thumbnailFilename,
    };

    // Phase 3 will handle LLM extraction; for now jump straight to complete
    await updateJob(jobId, {
      status: 'complete',
      progress: 100,
      resultVideoFilename: result.videoFilename,
      resultMetadata: JSON.stringify(metadata),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await updateJob(jobId, {
      status: 'failed',
      error: message,
    });
    throw err;
  }
}

async function updateJob(
  jobId: string,
  data: Partial<typeof schema.videoJobs.$inferInsert>
): Promise<void> {
  await db
    .update(schema.videoJobs)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(schema.videoJobs.id, jobId));
}
