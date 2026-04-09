import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { importVideoUrlSchema } from '@dinner-planner/shared';
import { createVideoJob, getVideoJob, processVideoJob } from '../services/videoJobs.js';
import { deleteVideo, VIDEOS_DIR } from '../services/videoDownload.js';
import { getSettings } from '../services/settings.js';
import { checkOllamaHealth } from '../services/ollama.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { join } from 'node:path';
import { createReadStream, statSync } from 'node:fs';

export async function videoJobsRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/dishes/import-video-url
   * Accepts { url }, creates a video download job, starts processing asynchronously.
   * Rate limit: 2 req/min per user.
   * Returns { jobId }.
   */
  fastify.post(
    '/api/dishes/import-video-url',
    {
      preHandler: [fastify.authenticate],
      config: {
        rateLimit: {
          max: 2,
          timeWindow: '1 minute',
          keyGenerator: (request: FastifyRequest) => {
            const auth = request.headers.authorization;
            if (auth?.startsWith('Bearer ')) {
              try {
                const payload = JSON.parse(
                  Buffer.from(auth.slice(7).split('.')[1], 'base64url').toString()
                );
                if (payload.userId) return `user-${payload.userId}`;
              } catch {
                // fall through to IP
              }
            }
            return request.ip;
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = importVideoUrlSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Invalid URL',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const settings = await getSettings();
      const storageLimit = (settings.videoStorageLimitMb ?? 10240) * 1024 * 1024;

      const jobId = await createVideoJob(parsed.data.url);
      // Fire-and-forget
      void processVideoJob(jobId, storageLimit);

      return reply.status(202).send({ jobId });
    }
  );

  /**
   * GET /api/jobs/:id
   * Returns the current job status, progress, and results.
   */
  fastify.get(
    '/api/jobs/:id',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const job = await getVideoJob(id);
      if (!job) {
        return reply.status(404).send({ error: 'Job not found' });
      }

      // Parse resultMetadata if stored as JSON string
      let resultMetadata: Record<string, unknown> | null = null;
      if (job.resultMetadata) {
        try {
          resultMetadata = JSON.parse(job.resultMetadata) as Record<string, unknown>;
        } catch {
          resultMetadata = null;
        }
      }

      // Parse extractedRecipe if stored as JSON string
      let extractedRecipe: unknown = null;
      if (job.extractedRecipe) {
        try {
          extractedRecipe = JSON.parse(job.extractedRecipe);
        } catch {
          extractedRecipe = null;
        }
      }

      return reply.send({
        job: {
          ...job,
          resultMetadata,
          extractedRecipe,
        },
      });
    }
  );

  /**
   * GET /api/dishes/:id/video
   * Streams the local video file for a dish.
   * Supports HTTP Range headers for seeking.
   */
  fastify.get(
    '/api/dishes/:id/video',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const [dish] = await db.select().from(schema.dishes).where(eq(schema.dishes.id, id)).limit(1);

      if (!dish) {
        return reply.status(404).send({ error: 'Dish not found' });
      }

      if (!dish.localVideoFilename) {
        return reply.status(404).send({ error: 'No local video for this dish' });
      }

      const videoPath = join(VIDEOS_DIR, dish.localVideoFilename);

      let fileSize: number;
      try {
        fileSize = statSync(videoPath).size;
      } catch {
        return reply.status(404).send({ error: 'Video file not found' });
      }

      const rangeHeader = request.headers['range'];

      void reply.header('Content-Type', 'video/mp4');
      void reply.header('Accept-Ranges', 'bytes');

      if (!rangeHeader) {
        void reply.header('Content-Length', fileSize);
        return reply.status(200).send(createReadStream(videoPath));
      }

      // Parse Range: bytes=start-end
      const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
      if (!match) {
        return reply.status(416).send({ error: 'Invalid Range header' });
      }

      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

      if (start > end || end >= fileSize) {
        void reply.header('Content-Range', `bytes */${fileSize}`);
        return reply.status(416).send({ error: 'Range Not Satisfiable' });
      }

      const chunkSize = end - start + 1;
      void reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      void reply.header('Content-Length', chunkSize);

      return reply.status(206).send(createReadStream(videoPath, { start, end }));
    }
  );

  /**
   * DELETE /api/dishes/:id/video
   * Remove local video: delete file, clear dish DB fields.
   * Auth required (owner or admin).
   */
  fastify.delete(
    '/api/dishes/:id/video',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const [dish] = await db.select().from(schema.dishes).where(eq(schema.dishes.id, id)).limit(1);

      if (!dish) {
        return reply.status(404).send({ error: 'Dish not found' });
      }

      // Only owner or admin may delete
      const isOwner = dish.createdById === request.user.userId;
      const isAdmin = request.user.role === 'admin';
      if (!isOwner && !isAdmin) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      if (dish.localVideoFilename) {
        await deleteVideo(dish.localVideoFilename);
      }

      await db
        .update(schema.dishes)
        .set({
          localVideoFilename: null,
          videoThumbnailFilename: null,
          videoSize: null,
          videoDuration: null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.dishes.id, id));

      return reply.status(204).send();
    }
  );

  /**
   * GET /api/settings/ollama-status
   * Health check for configured Ollama URL.
   * Admin only.
   * Returns { available: boolean, url: string | null }.
   */
  fastify.get(
    '/api/settings/ollama-status',
    { preHandler: [fastify.requireAdmin] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const settings = await getSettings();
      const url = settings.ollamaUrl ?? null;

      if (!url) {
        return reply.send({ available: false, url: null });
      }

      const result = await checkOllamaHealth(url);
      return reply.send({ available: result.available, url });
    }
  );

  const testOllamaBodySchema = z.object({
    url: z.string().min(1).url(),
    model: z.string().optional(),
  });

  /**
   * POST /api/settings/test-ollama
   * Test connectivity to an arbitrary Ollama URL and optionally check model availability.
   * Admin only.
   * Body: { url: string, model?: string }
   * Returns { available: boolean, modelFound: boolean | null }.
   */
  fastify.post(
    '/api/settings/test-ollama',
    { preHandler: [fastify.requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = testOllamaBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Invalid request body', details: parsed.error.flatten() });
      }

      const { url, model } = parsed.data;
      const { available, models } = await checkOllamaHealth(url);

      if (!available) {
        return reply.send({ available: false, modelFound: null });
      }

      if (!model) {
        return reply.send({ available: true, modelFound: null });
      }

      return reply.send({ available: true, modelFound: models.includes(model) });
    }
  );
}
