import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createDishSchema,
  updateDishSchema,
  dishQuerySchema,
  importRecipeUrlSchema,
} from '@dinner-planner/shared';
import * as dishesService from '../services/dishes.js';
import { importRecipeFromUrl, SsrfBlockedError } from '../services/recipeImport.js';

export async function dishesRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/dishes/import-url
   * Fetch a recipe URL and parse schema.org Recipe JSON-LD into a dish preview.
   * Does not save — returns parsed data for user review.
   */
  fastify.post(
    '/api/dishes/import-url',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = importRecipeUrlSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Invalid URL',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      try {
        const recipe = await importRecipeFromUrl(parsed.data.url);
        return reply.send({ recipe });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to import recipe';
        const status = err instanceof SsrfBlockedError ? 400 : 422;
        return reply.status(status).send({ error: msg });
      }
    }
  );

  /**
   * GET /api/dishes
   * List dishes with filtering and pagination
   */
  fastify.get(
    '/api/dishes',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = dishQuerySchema.safeParse(request.query);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const result = await dishesService.getDishes(parseResult.data);
      return reply.send(result);
    }
  );

  /**
   * GET /api/dishes/:id
   * Get dish by ID
   */
  fastify.get(
    '/api/dishes/:id',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const dish = await dishesService.getDishById(id);

      if (!dish) {
        return reply.status(404).send({ error: 'Dish not found' });
      }

      return reply.send({ dish });
    }
  );

  /**
   * POST /api/dishes
   * Create a new dish
   */
  fastify.post(
    '/api/dishes',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = createDishSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const dish = await dishesService.createDish(parseResult.data, request.user.userId);
      return reply.status(201).send({ dish });
    }
  );

  /**
   * PATCH /api/dishes/:id
   * Update a dish
   */
  fastify.patch(
    '/api/dishes/:id',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parseResult = updateDishSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const dish = await dishesService.updateDish(id, parseResult.data);

      if (!dish) {
        return reply.status(404).send({ error: 'Dish not found' });
      }

      return reply.send({ dish });
    }
  );

  /**
   * POST /api/dishes/:id/archive
   * Archive a dish
   */
  fastify.post(
    '/api/dishes/:id/archive',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const dish = await dishesService.archiveDish(id);

      if (!dish) {
        return reply.status(404).send({ error: 'Dish not found' });
      }

      return reply.send({ dish });
    }
  );

  /**
   * POST /api/dishes/:id/unarchive
   * Unarchive a dish
   */
  fastify.post(
    '/api/dishes/:id/unarchive',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const dish = await dishesService.unarchiveDish(id);

      if (!dish) {
        return reply.status(404).send({ error: 'Dish not found' });
      }

      return reply.send({ dish });
    }
  );

  /**
   * DELETE /api/dishes/:id
   * Permanently delete a dish (admin only)
   */
  fastify.delete(
    '/api/dishes/:id',
    { preHandler: [fastify.requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const result = await dishesService.deleteDish(id);

      if (!result.success) {
        return reply.status(404).send({ error: result.error });
      }

      return reply.send({ success: true });
    }
  );

  /**
   * GET /api/tags
   * Get all tags with dish counts
   */
  fastify.get(
    '/api/tags',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tags = await dishesService.getAllTags();
      return reply.send({ tags });
    }
  );
}
