import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { appEventsQuerySchema } from '@dinner-planner/shared';
import * as appEventsService from '../services/appEvents.js';

export async function appEventsRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/admin/events
   * List events with filtering and pagination (admin only)
   */
  fastify.get(
    '/api/admin/events',
    { preHandler: [fastify.requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = appEventsQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }
      const result = await appEventsService.listEvents(parseResult.data);
      return reply.send(result);
    }
  );

  /**
   * GET /api/admin/events/stats
   * Get event statistics (admin only)
   */
  fastify.get(
    '/api/admin/events/stats',
    { preHandler: [fastify.requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const stats = await appEventsService.getEventStats();
      return reply.send({ stats });
    }
  );
}
