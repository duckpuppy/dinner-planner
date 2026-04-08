import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '../db/index.js';
import { downloadVideo, getVideoStorageUsage } from './videoDownload.js';
import { extractRecipeFromMetadata } from './recipeExtraction.js';

export async function createVideoJob(sourceUrl: string, dishId?: string): Promise<string> {
  const id = randomUUID();
  await db.insert(schema.videoJobs).values({
    id,
    sourceUrl,
    dishId: dishId ?? null,
    status: 'pending',
    progress: 0,
  });
  return id;
}

export async function getVideoJob(jobId: string) {
  const [job] = await db.select().from(schema.videoJobs).where(eq(schema.videoJobs.id, jobId));
  return job ?? null;
}

export async function processVideoJob(jobId: string, storageLimit: number): Promise<void> {
  // Fire-and-forget: run async and log errors
  _runJob(jobId, storageLimit).catch((err: unknown) => {
    console.error(`[videoJobs] Unhandled error processing job ${jobId}:`, err);
  });
}

async function _runJob(jobId: string, storageLimit: number): Promise<void> {
  try {
    // 1. Check storage usage against limit
    const usage = await getVideoStorageUsage();
    if (usage >= storageLimit) {
      await db
        .update(schema.videoJobs)
        .set({
          status: 'failed',
          error: `Storage limit exceeded: ${usage} bytes used of ${storageLimit} bytes allowed`,
        })
        .where(eq(schema.videoJobs.id, jobId));
      return;
    }

    // 2. Fetch the job
    const job = await getVideoJob(jobId);
    if (!job) {
      console.error(`[videoJobs] Job ${jobId} not found`);
      return;
    }

    // 3. Update status → downloading
    await db
      .update(schema.videoJobs)
      .set({ status: 'downloading', progress: 0 })
      .where(eq(schema.videoJobs.id, jobId));

    // 4. Download the video, writing progress to DB every ≥5% increase
    let lastDbPct = 0;
    const result = await downloadVideo(job.sourceUrl, (pct) => {
      if (pct - lastDbPct >= 5) {
        lastDbPct = pct;
        void db
          .update(schema.videoJobs)
          .set({ progress: pct })
          .where(eq(schema.videoJobs.id, jobId));
      }
    });

    // 5. Extract recipe from video metadata (title + description) via LLM if configured
    const extraction = await extractRecipeFromMetadata(result.infoJson);
    const extractedRecipe = extraction.recipe ? JSON.stringify(extraction.recipe) : null;

    // 6. Update job with results → complete
    await db
      .update(schema.videoJobs)
      .set({
        status: 'complete',
        progress: 100,
        resultVideoFilename: result.videoFilename,
        resultMetadata: JSON.stringify({
          thumbnailFilename: result.thumbnailFilename,
          infoJson: result.infoJson,
          videoSize: result.videoSize,
          videoDuration: result.videoDuration,
        }),
        extractedRecipe,
      })
      .where(eq(schema.videoJobs.id, jobId));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[videoJobs] Job ${jobId} failed:`, message);
    try {
      await db
        .update(schema.videoJobs)
        .set({ status: 'failed', error: message })
        .where(eq(schema.videoJobs.id, jobId));
    } catch (updateErr: unknown) {
      console.error(`[videoJobs] Failed to update error status for job ${jobId}:`, updateErr);
    }
  }
}
