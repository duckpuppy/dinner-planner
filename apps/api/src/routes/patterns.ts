import type { FastifyInstance } from 'fastify';
import { createPatternSchema, updatePatternSchema } from '@dinner-planner/shared';
import {
  listPatterns,
  getPattern,
  createPattern,
  updatePattern,
  deletePattern,
  applyPatternsToWeek,
} from '../services/patterns.js';
import { getOrCreateWeekMenu } from '../services/menus.js';

export async function patternsRoutes(fastify: FastifyInstance) {
  // GET /api/patterns
  fastify.get('/api/patterns', { preHandler: [fastify.authenticate] }, async (_request, reply) => {
    const patterns = await listPatterns();
    return reply.send({ patterns });
  });

  // POST /api/patterns
  fastify.post('/api/patterns', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const parsed = createPatternSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
    }
    const pattern = await createPattern(parsed.data, request.user.userId);
    return reply.status(201).send({ pattern });
  });

  // GET /api/patterns/:id
  fastify.get(
    '/api/patterns/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const pattern = await getPattern(id);
      if (!pattern) return reply.status(404).send({ error: 'Pattern not found' });
      return reply.send({ pattern });
    }
  );

  // PATCH /api/patterns/:id
  fastify.patch(
    '/api/patterns/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updatePatternSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
      }
      const pattern = await updatePattern(id, parsed.data);
      if (!pattern) return reply.status(404).send({ error: 'Pattern not found' });
      return reply.send({ pattern });
    }
  );

  // DELETE /api/patterns/:id
  fastify.delete(
    '/api/patterns/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const deleted = await deletePattern(id);
      if (!deleted) return reply.status(404).send({ error: 'Pattern not found' });
      return reply.status(204).send();
    }
  );

  // POST /api/menus/week/:date/apply-patterns
  fastify.post(
    '/api/menus/week/:date/apply-patterns',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { date } = request.params as { date: string };
      const { applied } = await applyPatternsToWeek(date);
      // Return the updated week menu
      const menu = await getOrCreateWeekMenu(date);
      return reply.send({ applied, menu });
    }
  );
}
