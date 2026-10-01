import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ServerResponse } from 'node:http';
import { eventBus as defaultBus, type EventBus, type BusEvent } from '../services/eventBus.js';

export interface EventsRouteOptions {
  /** Heartbeat comment interval. Default 25s (under common 30s proxy timeouts). */
  heartbeatMs?: number;
  /** Bus to use. Defaults to the process-wide bus. */
  bus?: EventBus;
}

export const DEFAULT_HEARTBEAT_MS = 25_000;
// setTimeout overflows (and fires immediately) above 2^31-1 ms.
const MAX_TIMER_MS = 2_147_483_647;

function frame(event: BusEvent): string {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

function headerValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * GET /api/events: family-scoped Server-Sent Events stream.
 *
 * The reply is hijacked and written to `reply.raw`, which bypasses Fastify's
 * onSend/serialization (so nothing can buffer or compress it). Headers that
 * onRequest hooks already placed on the reply (CORS, helmet, rate-limit) live
 * in `reply.getHeaders()`; they are copied into `writeHead` explicitly because
 * hijacking skips Fastify's own header flush.
 */
export async function eventsRoutes(fastify: FastifyInstance, opts: EventsRouteOptions = {}) {
  const heartbeatMs = opts.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const bus = opts.bus ?? defaultBus;
  const openStreams = new Set<() => void>();

  // preClose (not onClose): Fastify's own onClose hook awaits server.close(), which
  // never resolves while SSE sockets are open, so a later onClose hook would not run.
  fastify.addHook('preClose', async () => {
    for (const end of [...openStreams]) end();
  });

  fastify.get('/api/events', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const familyId = request.user.familyId;
    const query = request.query as { lastEventId?: string };
    const lastEventId = headerValue(request.headers['last-event-id']) ?? query.lastEventId;

    // Replay is computed before subscribing, but both happen synchronously
    // below, so no event can slip between the replay and the live feed.
    const replay = lastEventId ? bus.since(familyId, lastEventId) : null;

    const sseHeaders = {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    };
    const carried: Record<string, unknown> = { ...reply.getHeaders() };
    delete carried['content-length'];
    delete carried['transfer-encoding'];
    delete carried['content-encoding'];

    reply.hijack();
    const res: ServerResponse = reply.raw;
    res.writeHead(200, { ...carried, ...sseHeaders } as Record<string, string | string[]>);
    // Defeat Nagle so small frames go out immediately.
    request.raw.socket?.setNoDelay(true);

    let closed = false;
    const write = (chunk: string) => {
      if (!closed && !res.writableEnded && !res.destroyed) res.write(chunk);
    };

    write('retry: 3000\n\n');
    if (replay === 'reset') {
      write('event: reset\ndata:\n\n');
    } else if (replay) {
      for (const event of replay) write(frame(event));
    }

    const unsubscribe = bus.subscribe(familyId, (event) => write(frame(event)));
    const heartbeat = setInterval(() => write(': ping\n\n'), heartbeatMs);

    // End when the access token expires so the client reconnects with a fresh one.
    // API tokens (dp_...) carry no exp and stay open.
    let expiryTimer: NodeJS.Timeout | undefined;
    const exp = (request as FastifyRequest & { user: { exp?: number } }).user.exp;
    if (typeof exp === 'number') {
      expiryTimer = setTimeout(
        () => end(),
        Math.min(Math.max(exp * 1000 - Date.now(), 0), MAX_TIMER_MS)
      );
    }

    function end() {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      if (expiryTimer) clearTimeout(expiryTimer);
      unsubscribe();
      openStreams.delete(end);
      if (!res.writableEnded) res.end();
    }

    openStreams.add(end);
    request.raw.on('close', end);
    res.on('close', end);
  });
}
