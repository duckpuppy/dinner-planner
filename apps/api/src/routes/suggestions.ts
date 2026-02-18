import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { suggestionsQuerySchema } from '@dinner-planner/shared';
import * as suggestionsService from '../services/suggestions.js';

export async function suggestionsRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/dishes/suggestions
   * Return ranked dish suggestions based on ratings and recency.
   */
  fastify.get(
    '/api/dishes/suggestions',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = suggestionsQuerySchema.safeParse(request.query);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const suggestions = await suggestionsService.getSuggestions(parseResult.data);
      return reply.send({ suggestions });
    }
  );
}
