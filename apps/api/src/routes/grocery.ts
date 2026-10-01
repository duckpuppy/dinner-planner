import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { addCustomItem, updateCustomItem, deleteCustomItem } from '../services/customGroceries.js';
import { toggleCheck, clearAllChecks, setCheck, clearChecks } from '../services/groceryChecks.js';
import { listStores } from '../services/stores.js';
import {
  createCustomItemSchema,
  createStandingItemSchema,
  updateCustomItemSchema,
} from '@dinner-planner/shared';
import {
  listStandingItems,
  addStandingItem,
  deleteStandingItem,
} from '../services/standingItems.js';

const toggleCheckSchema = z.object({
  weekDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'weekDate must be YYYY-MM-DD'),
  itemKey: z.string().min(1, 'itemKey must not be empty'),
  itemName: z.string().min(1, 'itemName must not be empty'),
});

const weekDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'weekDate must be YYYY-MM-DD');

const setCheckSchema = z.object({
  weekDate: weekDateSchema,
  itemKey: z.string().min(1, 'itemKey must not be empty'),
  itemName: z.string().min(1, 'itemName must not be empty'),
  checked: z.boolean(),
  clientUpdatedAt: z.number().int().nonnegative(),
});

const clearChecksBodySchema = z.object({
  weekDate: weekDateSchema,
  clientUpdatedAt: z.number().int().nonnegative(),
});

const clearChecksQuerySchema = z.object({
  weekDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'weekDate must be YYYY-MM-DD'),
});

export async function groceryRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/stores
   * List all managed stores sorted by name.
   */
  fastify.get('/api/stores', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const stores = await listStores(request.user.familyId);
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

      const { id, weekDate, name, quantity = null, unit = null, storeId } = parsed.data;
      const result = await addCustomItem(
        weekDate,
        name,
        quantity ?? null,
        unit ?? null,
        storeId,
        request.user.familyId,
        id
      );
      // null: client-supplied id belongs to another family -> 404, no disclosure.
      if (!result) return reply.status(404).send({ error: 'Custom grocery item not found' });
      // Future: emit grocery.custom.add here when `result.created` is true.
      return reply.status(result.created ? 201 : 200).send({ item: result.item });
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

      const item = await updateCustomItem(id, parsed.data, request.user.familyId);
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
      // Idempotent: 204 even if already gone or owned by another family.
      const { deleted } = await deleteCustomItem(id, request.user.familyId);
      void deleted; // Future: emit grocery.custom.delete here when `deleted` is true.
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
      const checked = await toggleCheck(weekDate, itemKey, itemName, userId, request.user.familyId);
      return reply.send({ itemKey, checked });
    }
  );

  /**
   * PUT /api/grocery/checks
   * Idempotent per-item last-write-wins set. Loses to any stored write with an
   * equal or newer updatedAt. Returns the winning row plus `changed`.
   */
  fastify.put(
    '/api/grocery/checks',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const parsed = setCheckSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
      }

      const { check, changed } = await setCheck({
        ...parsed.data,
        userId: request.user.userId,
        familyId: request.user.familyId,
      });
      // Future: emit a live-sync event here when `changed` is true.
      return reply.send({ ...check, changed });
    }
  );

  /**
   * POST /api/grocery/checks/clear
   * Clear a week's checks as of clientUpdatedAt; newer checks survive.
   */
  fastify.post(
    '/api/grocery/checks/clear',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const parsed = clearChecksBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
      }

      const cleared = await clearChecks(
        parsed.data.weekDate,
        parsed.data.clientUpdatedAt,
        request.user.familyId
      );
      return reply.send({ cleared });
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

      await clearAllChecks(parsed.data.weekDate, request.user.familyId);
      return reply.status(204).send();
    }
  );

  /**
   * GET /api/grocery/standing
   * List all standing grocery items.
   */
  fastify.get(
    '/api/grocery/standing',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const items = await listStandingItems(request.user.familyId);
      return reply.send({ items });
    }
  );

  /**
   * POST /api/grocery/standing
   * Add a new standing grocery item.
   */
  fastify.post(
    '/api/grocery/standing',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const parsed = createStandingItemSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
      }

      const { id, name, quantity = null, unit = null, category = 'Other', storeId } = parsed.data;
      const userId = request.user.userId;
      const result = await addStandingItem(
        name,
        quantity ?? null,
        unit ?? null,
        category,
        storeId,
        userId,
        request.user.familyId,
        id
      );
      if (!result) return reply.status(404).send({ error: 'Standing item not found' });
      // Future: emit grocery.standing.add here when `result.created` is true.
      return reply.status(result.created ? 201 : 200).send({ item: result.item });
    }
  );

  /**
   * DELETE /api/grocery/standing/:id
   * Delete a standing grocery item.
   */
  fastify.delete(
    '/api/grocery/standing/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      // Idempotent: 204 even if already gone or owned by another family.
      const { deleted } = await deleteStandingItem(id, request.user.familyId);
      void deleted; // Future: emit grocery.standing.delete here when `deleted` is true.
      return reply.status(204).send();
    }
  );
}
