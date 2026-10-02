import type { FastifyInstance } from 'fastify';
import { createPantryItemSchema, updatePantryItemSchema } from '@dinner-planner/shared';
import {
  listPantryItems,
  createPantryItem,
  updatePantryItem,
  deletePantryItem,
} from '../services/pantry.js';
import { publish } from '../services/eventBus.js';

export async function pantryRoutes(fastify: FastifyInstance) {
  // GET /api/pantry
  fastify.get('/api/pantry', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const items = await listPantryItems(request.user.familyId);
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
    const result = await createPantryItem(parsed.data, request.user.familyId);
    // null: client-supplied id belongs to another family. 404 (not 403) so we
    // don't disclose that it exists.
    if (!result) return reply.status(404).send({ error: 'Pantry item not found' });
    if (result.created) publish(request.user.familyId, 'pantry.add', result.item);
    return reply.status(result.created ? 201 : 200).send({ item: result.item });
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
      const item = await updatePantryItem(id, parsed.data, request.user.familyId);
      if (!item) return reply.status(404).send({ error: 'Pantry item not found' });
      publish(request.user.familyId, 'pantry.update', item);
      return reply.send({ item });
    }
  );

  // DELETE /api/pantry/:id
  fastify.delete(
    '/api/pantry/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      // Idempotent: 204 whether or not a row was removed (already gone, never
      // existed, or another family's row, which is left untouched).
      const { deleted } = await deletePantryItem(id, request.user.familyId);
      if (deleted) publish(request.user.familyId, 'pantry.delete', { id });
      return reply.status(204).send();
    }
  );
}
