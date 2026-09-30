import type { FastifyCorsOptions } from '@fastify/cors';

/**
 * CORS options. `origins` is the parsed CORS_ORIGIN list (a single origin is a
 * one-element array). Kept out of server.ts so it can be unit-tested without
 * starting the server.
 */
export function buildCorsOptions(origins: string[]): FastifyCorsOptions {
  return {
    origin: origins,
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Client-Platform'],
  };
}
