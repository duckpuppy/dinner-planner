import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { addCustomItem, updateCustomItem, deleteCustomItem } from '../services/customGroceries.js';
import { toggleCheck, clearAllChecks } from '../services/groceryChecks.js';
import { listStores } from '../services/stores.js';

const toggleCheckSchema = z.object({
  weekDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'weekDate must be YYYY-MM-DD'),
  itemKey: z.string().min(1, 'itemKey must not be empty'),
  itemName: z.string().min(1, 'itemName must not be empty'),
});

const clearChecksQuerySchema = z.object({
  weekDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'weekDate must be YYYY-MM-DD'),
});

const createCustomItemSchema = z.object({
  weekDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'weekDate must be YYYY-MM-DD'),
  name: z.string().min(1, 'name must not be empty'),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  storeId: z.string().optional(),
});

const updateCustomItemSchema = z
  .object({
    name: z.string().min(1, 'name must not be empty').optional(),
    quantity: z.number().nullable().optional(),
    unit: z.string().nullable().optional(),
    storeId: z.string().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export async function groceryRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/stores
   * List all managed stores sorted by name.
   */
  fastify.get('/api/stores', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const stores = await listStores();
    return reply.send({ stores: stores.map((s) => ({ id: s.id, name: s.name })) });
  });

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

      const { weekDate, name, quantity = null, unit = null, storeId } = parsed.data;
      const item = await addCustomItem(weekDate, name, quantity ?? null, unit ?? null, storeId);
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

  /**
   * POST /api/grocery/checks/toggle
   * Toggle a grocery check on or off for the authenticated user.
   */
  fastify.post(
    '/api/grocery/checks/toggle',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const parsed = toggleCheckSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
      }

      const { weekDate, itemKey, itemName } = parsed.data;
      const userId = request.user.userId;
      const checked = await toggleCheck(weekDate, itemKey, itemName, userId);
      return reply.send({ itemKey, checked });
    }
  );

  /**
   * DELETE /api/grocery/checks
   * Clear all grocery checks for a week.
   * Query param: weekDate (YYYY-MM-DD)
   */
  fastify.delete(
    '/api/grocery/checks',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const parsed = clearChecksQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
      }

      await clearAllChecks(parsed.data.weekDate);
      return reply.status(204).send();
    }
  );
}
