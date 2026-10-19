import { and, eq, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '../db/index.js';
import {
  downloadVideo,
  fetchMetadataOnly,
  getVideoStorageUsage,
  type DownloadResult,
} from './videoDownload.js';
import { extractRecipeFromMetadata, type ExtractionStatus } from './recipeExtraction.js';
import { buildLinkMeta, followLinks, type LinkMeta, type LinkStage } from './linkedRecipe.js';
import { YtdlpError } from './ytdlpErrors.js';
import { logEvent } from './appEvents.js';
import {
  parseUserInput,
  pastedLinkFailure,
  resolvePastedLink,
  type UserInput,
} from './userInputExtraction.js';

export const NO_VIDEO_WARNING =
  'Video could not be downloaded; recipe extracted from the post description';

export async function createVideoJob(
  sourceUrl: string,
  dishId?: string,
  familyId?: string
): Promise<string> {
  const id = randomUUID();
  await db.insert(schema.videoJobs).values({
    id,
    sourceUrl,
    dishId: dishId ?? null,
    familyId: familyId ?? null,
    status: 'pending',
    progress: 0,
  });
  return id;
}

export async function getVideoJob(jobId: string) {
  const [job] = await db.select().from(schema.videoJobs).where(eq(schema.videoJobs.id, jobId));
  return job ?? null;
}

/** Family-scoped lookup. Returns null for unknown jobs AND jobs owned by another family. */
export async function getVideoJobForFamily(jobId: string, familyId: string) {
  const [job] = await db
    .select()
    .from(schema.videoJobs)
    .where(and(eq(schema.videoJobs.id, jobId), eq(schema.videoJobs.familyId, familyId)));
  return job ?? null;
}

interface ExtractionOutcome {
  extractedRecipe: string | null;
  extractionStatus: ExtractionStatus;
  extractionError: string | null;
  /** Stored in resultMetadata, not a column: where the recipe came from + link results */
  linkMeta: LinkMeta | null;
}

/**
 * Run recipe extraction and return the columns to persist. Never throws: an
 * unexpected extraction crash is recorded as extractionStatus='failed'.
 *
 * `userInput` (dinner-22c.3) is what the user pasted in the review step: a pasted
 * `recipeUrl` replaces auto-discovered links; `extraText` is added to the model input
 * (link discovery from the caption still runs).
 */
async function runExtraction(
  sourceUrl: string,
  infoJson: Record<string, unknown>,
  transcript: string | null,
  userInput?: UserInput | null
): Promise<ExtractionOutcome> {
  try {
    // Link-following stage (dinner-22c.4): a recipe linked from the post wins over the LLM.
    let link: LinkStage;
    if (userInput?.recipeUrl) {
      const pasted = await resolvePastedLink(userInput.recipeUrl, sourceUrl);
      if (!pasted.ok) {
        if (!userInput.extraText) {
          return {
            extractedRecipe: null,
            extractionStatus: pasted.status,
            extractionError: pasted.error,
            linkMeta: buildLinkMeta({ recipe: null, outcomes: [], linkedPage: null }, false),
          };
        }
        link = await followLinks(sourceUrl, infoJson, transcript);
      } else {
        link = pasted.stage;
        const failure = pastedLinkFailure(link);
        if (failure && !userInput.extraText) {
          return {
            extractedRecipe: null,
            extractionStatus: failure.status,
            extractionError: failure.error,
            linkMeta: buildLinkMeta(link, false),
          };
        }
      }
    } else {
      link = await followLinks(sourceUrl, infoJson, transcript);
    }
    if (link.recipe) {
      return {
        extractedRecipe: JSON.stringify(link.recipe),
        extractionStatus: 'llm',
        extractionError: null,
        linkMeta: buildLinkMeta(link, true),
      };
    }
    const extraction = await extractRecipeFromMetadata(infoJson, transcript, {
      linkedPage: link.linkedPage,
      extraText: userInput?.extraText,
    });
    let extractedRecipe: string | null = null;
    if (extraction.recipe) {
      // Patch sourceUrl and videoUrl from job data — LLM always outputs these as null
      extraction.recipe.sourceUrl = sourceUrl;
      extraction.recipe.videoUrl = sourceUrl;
      extractedRecipe = JSON.stringify(extraction.recipe);
    }
    return {
      extractedRecipe,
      extractionStatus: extraction.status ?? (extraction.recipe ? 'llm' : 'failed'),
      extractionError: extraction.error ?? null,
      linkMeta: buildLinkMeta(link, extraction.recipe !== null),
    };
  } catch (err) {
    console.error('[videoJobs] extraction crashed:', err);
    return {
      extractedRecipe: null,
      extractionStatus: 'failed',
      extractionError: 'Recipe extraction failed unexpectedly',
      linkMeta: null,
    };
  }
}

/** An 'extracting' job not touched for this long is treated as orphaned (e.g. server restart). */
const STALE_EXTRACTING_MINUTES = 10;

/**
 * Atomically move a completed job to status='extracting' so only one re-extraction
 * runs at a time. Returns false if the job is not claimable (not complete, or already
 * extracting and not stale).
 */
export async function claimReextract(jobId: string, userInput?: UserInput): Promise<boolean> {
  // When the caller supplies input, persist it under resultMetadata.userInput in the same
  // atomic UPDATE so later plain retries and page reloads reuse it.
  const metadataPatch = userInput
    ? {
        resultMetadata: sql`json_set(${schema.videoJobs.resultMetadata}, '$.userInput', json(${JSON.stringify(userInput)}))`,
      }
    : {};
  const claimed = await db
    .update(schema.videoJobs)
    .set({
      status: 'extracting',
      updatedAt: sql`datetime('now')` as unknown as string,
      ...metadataPatch,
    })
    .where(
      and(
        eq(schema.videoJobs.id, jobId),
        or(
          eq(schema.videoJobs.status, 'complete'),
          and(
            eq(schema.videoJobs.status, 'extracting'),
            sql`${schema.videoJobs.updatedAt} < datetime('now', ${`-${STALE_EXTRACTING_MINUTES} minutes`})`
          )
        )
      )
    )
    .returning({ id: schema.videoJobs.id });
  return claimed.length > 0;
}

/**
 * Fire-and-forget: re-run extraction from the stored infoJson + transcript (no
 * re-download) for a job previously claimed with claimReextract. Always returns the
 * job to status='complete', recording the outcome in extractionStatus/extractionError.
 */
export function processReextract(jobId: string): void {
  _runReextract(jobId).catch((err: unknown) => {
    console.error(`[videoJobs] Unhandled error re-extracting job ${jobId}:`, err);
  });
}

async function _runReextract(jobId: string): Promise<void> {
  let outcome: ExtractionOutcome;
  let storedMeta: Record<string, unknown> = {};
  try {
    const job = await getVideoJob(jobId);
    let infoJson: Record<string, unknown> | null = null;
    try {
      const meta = JSON.parse(job?.resultMetadata ?? '') as {
        infoJson?: Record<string, unknown>;
      };
      storedMeta = meta;
      infoJson = meta.infoJson ?? {};
    } catch {
      infoJson = null;
    }
    outcome =
      job && infoJson
        ? await runExtraction(
            job.sourceUrl,
            infoJson,
            job.transcript ?? null,
            parseUserInput(storedMeta.userInput)
          )
        : {
            extractedRecipe: null,
            extractionStatus: 'failed',
            extractionError: 'No stored post metadata to extract from',
            linkMeta: null,
          };
  } catch (err) {
    console.error(`[videoJobs] Re-extraction of job ${jobId} crashed:`, err);
    outcome = {
      extractedRecipe: null,
      extractionStatus: 'failed',
      extractionError: 'Recipe extraction failed unexpectedly',
      linkMeta: null,
    };
  }
  // Whatever happened, release the 'extracting' state. Merge (never replace) resultMetadata
  // so infoJson, userInput and any other stored keys survive.
  const { linkMeta, ...columns } = outcome;
  await db
    .update(schema.videoJobs)
    .set({
      ...columns,
      ...(linkMeta ? { resultMetadata: JSON.stringify({ ...storedMeta, ...linkMeta }) } : {}),
      status: 'complete',
    })
    .where(eq(schema.videoJobs.id, jobId));
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

    void logEvent({
      level: 'info',
      category: 'video',
      message: `Video download started: ${job.sourceUrl}`,
      details: { jobId: job.id, sourceUrl: job.sourceUrl },
    });

    // 4. Download the video, writing progress to DB every ≥5% increase.
    //    If the full download fails (other than a timeout), fall back to a
    //    metadata-only pass so the recipe can still be extracted from the post text.
    let lastDbPct = 0;
    let result: DownloadResult;
    let warning: string | null = null;
    try {
      result = await downloadVideo(job.sourceUrl, (pct) => {
        if (pct - lastDbPct >= 5) {
          lastDbPct = pct;
          void db
            .update(schema.videoJobs)
            .set({ progress: pct })
            .where(eq(schema.videoJobs.id, jobId));
        }
      });
    } catch (downloadErr: unknown) {
      if (downloadErr instanceof YtdlpError && downloadErr.code === 'TIMEOUT') throw downloadErr;
      if (downloadErr instanceof YtdlpError) {
        console.warn(`[videoJobs] Job ${jobId} download failed: ${downloadErr.detail}`);
      }
      try {
        result = await fetchMetadataOnly(job.sourceUrl);
      } catch (metaErr: unknown) {
        console.warn(
          `[videoJobs] Job ${jobId} metadata-only fallback failed:`,
          metaErr instanceof YtdlpError ? metaErr.detail : metaErr
        );
        throw downloadErr;
      }
      warning = NO_VIDEO_WARNING;
      void logEvent({
        level: 'warn',
        category: 'video',
        message: `Video download failed; used metadata-only fallback: ${job.sourceUrl}`,
        details: {
          jobId,
          error: downloadErr instanceof YtdlpError ? downloadErr.detail : String(downloadErr),
        },
      });
    }

    // 5. Extract recipe from video metadata (title + description + transcript) via LLM if configured
    const { linkMeta, ...outcome } = await runExtraction(
      job.sourceUrl,
      result.infoJson,
      result.transcript
    );

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
          ...linkMeta,
        }),
        transcript: result.transcript ?? null,
        warning,
        ...outcome,
      })
      .where(eq(schema.videoJobs.id, jobId));

    void logEvent({
      level: 'info',
      category: 'video',
      message: `Video download completed: ${job.sourceUrl}`,
      details: {
        jobId: job.id,
        filename: result.videoFilename,
        videoSize: result.videoSize,
        extractionStatus: outcome.extractionStatus,
        extractionError: outcome.extractionError,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[videoJobs] Job ${jobId} failed:`, message);
    void logEvent({
      level: 'error',
      category: 'video',
      message: `Video download failed: job ${jobId}`,
      details: {
        jobId,
        error: String(err),
        detail: err instanceof YtdlpError ? err.detail : undefined,
      },
    });
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
