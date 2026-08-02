import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { paginationSchema } from '@dinner-planner/shared';
import * as historyService from '../services/history.js';
import { z } from 'zod';

const historyQuerySchema = paginationSchema.extend({
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  search: z.string().optional(),
});

export async function historyRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/history
   * Get meal history with optional filtering
   */
  fastify.get(
    '/api/history',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = historyQuerySchema.safeParse(request.query);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const result = await historyService.getHistory(parseResult.data, request.user.familyId);
      return reply.send(result);
    }
  );

  /**
   * GET /api/dishes/:id/history
   * Get preparation history for a specific dish
   */
  fastify.get(
    '/api/dishes/:id/history',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const result = await historyService.getDishHistory(id, request.user.familyId);
      return reply.send(result);
    }
  );

  /**
   * DELETE /api/history/:id
   * Delete a history entry (and all related preparations/ratings)
   */
  fastify.delete(
    '/api/history/:id',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const result = await historyService.deleteHistoryEntry(id, request.user.familyId);
      if (!result.success) {
        return reply.status(404).send({ error: 'History entry not found' });
      }
      return reply.send(result);
    }
  );
}
