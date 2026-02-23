import type { FastifyInstance } from 'fastify';
import { createPantryItemSchema, updatePantryItemSchema } from '@dinner-planner/shared';
import {
  listPantryItems,
  createPantryItem,
  updatePantryItem,
  deletePantryItem,
} from '../services/pantry.js';

export async function pantryRoutes(fastify: FastifyInstance) {
  // GET /api/pantry
  fastify.get('/api/pantry', { preHandler: [fastify.authenticate] }, async (_request, reply) => {
    const items = await listPantryItems();
    return reply.send({ items });
  });

  // POST /api/pantry
  fastify.post('/api/pantry', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const parsed = createPantryItemSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
    }
    const item = await createPantryItem(parsed.data);
    return reply.status(201).send(item);
  });

  // PATCH /api/pantry/:id
  fastify.patch(
    '/api/pantry/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updatePantryItemSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
      }
      const item = await updatePantryItem(id, parsed.data);
      if (!item) return reply.status(404).send({ error: 'Pantry item not found' });
      return reply.send(item);
    }
  );

  // DELETE /api/pantry/:id
  fastify.delete(
    '/api/pantry/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await deletePantryItem(id);
      if (!result.success) return reply.status(404).send({ error: 'Pantry item not found' });
      return reply.status(204).send();
    }
  );
}
