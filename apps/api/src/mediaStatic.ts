import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { UPLOADS_DIR, VIDEOS_DIR, ensureDataDirs } from './dataPaths.js';

// Files in these directories are named with random UUIDs and never rewritten.
export const MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * Serve uploaded photos (/uploads/) and downloaded videos/thumbnails
 * (/videos/) from the same directories the services write to.
 */
export async function registerMediaStatic(fastify: FastifyInstance): Promise<void> {
  ensureDataDirs();

  const setHeaders = (reply: { header(name: string, value: string): unknown }) => {
    reply.header('Cache-Control', MEDIA_CACHE_CONTROL);
  };

  await fastify.register(fastifyStatic, {
    root: UPLOADS_DIR,
    prefix: '/uploads/',
    decorateReply: false,
    setHeaders,
  });

  await fastify.register(fastifyStatic, {
    root: VIDEOS_DIR,
    prefix: '/videos/',
    decorateReply: false,
    setHeaders,
  });
}
