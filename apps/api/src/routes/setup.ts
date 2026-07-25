import type { FastifyInstance } from 'fastify';
import { setupSchema } from '@dinner-planner/shared';
import { createFirstAdmin } from '../services/setup.js';

export async function setupRoutes(fastify: FastifyInstance) {
  // POST /api/setup — unauthenticated, first-run only
  fastify.post('/api/setup', async (request, reply) => {
    const parsed = setupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
    }

    const { username, password, familyName } = parsed.data;
    const result = await createFirstAdmin(username, password, familyName);

    if (!result.success) {
      return reply.status(404).send({ error: 'Setup already completed' });
    }

    return reply.status(201).send({ message: 'Setup complete' });
  });
}
