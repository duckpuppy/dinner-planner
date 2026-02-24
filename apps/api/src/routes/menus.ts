import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { updateDinnerEntrySchema, createPreparationSchema } from '@dinner-planner/shared';
import * as menusService from '../services/menus.js';
import * as groceriesService from '../services/groceries.js';
import { z } from 'zod';

const dateParamSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (use YYYY-MM-DD)'),
});

const completedSchema = z.object({
  completed: z.boolean(),
});

const skippedSchema = z.object({
  skipped: z.boolean(),
});

export async function menusRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/menus/week/:date
   * Get weekly menu for the week containing the specified date
   */
  fastify.get(
    '/api/menus/week/:date',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = dateParamSchema.safeParse(request.params);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Invalid date format',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const menu = await menusService.getOrCreateWeekMenu(parseResult.data.date);
      return reply.send({ menu });
    }
  );

  /**
   * GET /api/menus/week/:date/groceries
   * Get aggregated grocery list for the week containing the given date
   */
  fastify.get(
    '/api/menus/week/:date/groceries',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = dateParamSchema.safeParse(request.params);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Invalid date format',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const result = await groceriesService.getWeekGroceries(parseResult.data.date);
      return reply.send(result);
    }
  );

  /**
   * GET /api/menus/today
   * Get today's dinner entry
   */
  fastify.get(
    '/api/menus/today',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const entry = await menusService.getTodayEntry();

      if (!entry) {
        return reply.status(404).send({ error: 'No entry for today' });
      }

      return reply.send({ entry });
    }
  );

  /**
   * PATCH /api/entries/:id
   * Update a dinner entry
   */
  fastify.patch(
    '/api/entries/:id',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parseResult = updateDinnerEntrySchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const entry = await menusService.updateDinnerEntry(id, parseResult.data);

      if (!entry) {
        return reply.status(404).send({ error: 'Entry not found' });
      }

      return reply.send({ entry });
    }
  );

  /**
   * PATCH /api/entries/:id/completed
   * Mark entry as completed or not
   */
  fastify.patch(
    '/api/entries/:id/completed',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parseResult = completedSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const entry = await menusService.markEntryCompleted(id, parseResult.data.completed);

      if (!entry) {
        return reply.status(404).send({ error: 'Entry not found' });
      }

      return reply.send({ entry });
    }
  );

  /**
   * PATCH /api/entries/:id/skip
   * Mark entry as skipped or not
   */
  fastify.patch(
    '/api/entries/:id/skip',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parseResult = skippedSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const entry = await menusService.setSkipped(id, parseResult.data.skipped);

      if (!entry) {
        return reply.status(404).send({ error: 'Entry not found' });
      }

      return reply.send({ entry });
    }
  );

  /**
   * POST /api/preparations
   * Log a preparation
   */
  fastify.post(
    '/api/preparations',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Default preparerIds to the authenticated user if not provided
      const body = request.body as Record<string, unknown>;
      const prepData = {
        ...body,
        preparerIds:
          Array.isArray(body.preparerIds) && body.preparerIds.length > 0
            ? body.preparerIds
            : [request.user.userId],
      };

      const parseResult = createPreparationSchema.safeParse(prepData);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const preparation = await menusService.logPreparation(parseResult.data);
      return reply.status(201).send({ preparation });
    }
  );

  /**
   * GET /api/dishes/:id/preparations
   * Get preparation history for a dish
   */
  fastify.get(
    '/api/dishes/:id/preparations',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const preparations = await menusService.getDishPreparations(id);
      return reply.send({ preparations });
    }
  );

  /**
   * DELETE /api/preparations/:id
   * Delete a preparation
   */
  fastify.delete(
    '/api/preparations/:id',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const result = await menusService.deletePreparation(id);

      if (!result.success) {
        return reply.status(404).send({ error: result.error });
      }

      return reply.send({ success: true });
    }
  );

  /**
   * GET /api/entries/recent-completed
   * Get recently completed entries (last 14 days) with a main dish.
   * Used by the leftovers picker.
   */
  fastify.get(
    '/api/entries/recent-completed',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const entries = await menusService.getRecentCompleted();
      return reply.send({ entries });
    }
  );
}
