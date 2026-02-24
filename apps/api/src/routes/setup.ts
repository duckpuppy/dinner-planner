import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createFirstAdmin } from '../services/setup.js';

const setupBodySchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8),
});

export async function setupRoutes(fastify: FastifyInstance) {
  // POST /api/setup — unauthenticated, first-run only
  fastify.post('/api/setup', async (request, reply) => {
    const parsed = setupBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
    }

    const { username, password } = parsed.data;
    const result = await createFirstAdmin(username, password);

    if (!result.success) {
      return reply.status(404).send({ error: 'Setup already completed' });
    }

    return reply.status(201).send({ message: 'Setup complete' });
  });
}
