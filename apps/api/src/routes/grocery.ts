import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { addCustomItem, updateCustomItem, deleteCustomItem } from '../services/customGroceries.js';

const createCustomItemSchema = z.object({
  weekDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'weekDate must be YYYY-MM-DD'),
  name: z.string().min(1, 'name must not be empty'),
  quantity: z.number().optional(),
  unit: z.string().optional(),
});

const updateCustomItemSchema = z
  .object({
    name: z.string().min(1, 'name must not be empty').optional(),
    quantity: z.number().nullable().optional(),
    unit: z.string().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export async function groceryRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/grocery/custom
   * Add a custom grocery item for a week.
   */
  fastify.post(
    '/api/grocery/custom',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const parsed = createCustomItemSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
      }

      const { weekDate, name, quantity = null, unit = null } = parsed.data;
      const item = await addCustomItem(weekDate, name, quantity ?? null, unit ?? null);
      return reply.status(201).send({ item });
    }
  );

  /**
   * PATCH /api/grocery/custom/:id
   * Update a custom grocery item.
   */
  fastify.patch(
    '/api/grocery/custom/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateCustomItemSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
      }

      const item = await updateCustomItem(id, parsed.data);
      if (!item) return reply.status(404).send({ error: 'Custom grocery item not found' });
      return reply.send({ item });
    }
  );

  /**
   * DELETE /api/grocery/custom/:id
   * Delete a custom grocery item.
   */
  fastify.delete(
    '/api/grocery/custom/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const deleted = await deleteCustomItem(id);
      if (!deleted) return reply.status(404).send({ error: 'Custom grocery item not found' });
      return reply.status(204).send();
    }
  );
}
