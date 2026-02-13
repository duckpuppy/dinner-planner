import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createRatingSchema, updateRatingSchema } from '@dinner-planner/shared';
import * as ratingsService from '../services/ratings.js';

export async function ratingsRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/preparations/:id/ratings
   * Get all ratings for a preparation
   */
  fastify.get(
    '/api/preparations/:id/ratings',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const ratings = await ratingsService.getRatingsForPreparation(id);
      return reply.send({ ratings });
    }
  );

  /**
   * POST /api/preparations/:id/ratings
   * Create a rating for a preparation
   */
  fastify.post(
    '/api/preparations/:id/ratings',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parseResult = createRatingSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      try {
        const rating = await ratingsService.createRating(id, request.user.userId, parseResult.data);
        return reply.status(201).send({ rating });
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'Preparation not found') {
            return reply.status(404).send({ error: error.message });
          }
          if (error.message === 'You have already rated this preparation') {
            return reply.status(409).send({ error: error.message });
          }
        }
        throw error;
      }
    }
  );

  /**
   * PATCH /api/ratings/:id
   * Update a rating
   */
  fastify.patch(
    '/api/ratings/:id',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parseResult = updateRatingSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      try {
        const rating = await ratingsService.updateRating(id, request.user.userId, parseResult.data);

        if (!rating) {
          return reply.status(404).send({ error: 'Rating not found' });
        }

        return reply.send({ rating });
      } catch (error) {
        if (error instanceof Error && error.message === 'You can only edit your own ratings') {
          return reply.status(403).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  /**
   * DELETE /api/ratings/:id
   * Delete a rating
   */
  fastify.delete(
    '/api/ratings/:id',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const result = await ratingsService.deleteRating(
        id,
        request.user.userId,
        request.user.role === 'admin'
      );

      if (!result.success) {
        const status = result.error === 'Rating not found' ? 404 : 403;
        return reply.status(status).send({ error: result.error });
      }

      return reply.send({ success: true });
    }
  );

  /**
   * GET /api/dishes/:id/rating-stats
   * Get aggregate rating stats for a dish
   */
  fastify.get(
    '/api/dishes/:id/rating-stats',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const stats = await ratingsService.getDishRatingStats(id);
      return reply.send({ stats });
    }
  );
}
