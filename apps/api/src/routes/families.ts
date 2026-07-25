import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createFamilySchema, updateFamilySchema } from '@dinner-planner/shared';
import * as familiesService from '../services/families.js';
import { logEvent } from '../services/appEvents.js';

/**
 * Family entity CRUD.
 *
 * Membership management (inviting/removing members) is intentionally NOT
 * duplicated here -- it's already covered by the family-scoped user
 * management endpoints in routes/users.ts (POST/PATCH/DELETE /api/users),
 * which create/update/remove users within request.user.familyId. "Admin of
 * my family" is simply request.user.familyId + the existing global
 * role === 'admin' check; there is no separate family-admin role.
 */
export async function familiesRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/families/me
   * Get the current user's own family
   */
  fastify.get(
    '/api/families/me',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const family = await familiesService.getFamilyById(request.user.familyId);

      if (!family) {
        return reply.status(404).send({ error: 'Family not found' });
      }

      return reply.send({ family });
    }
  );

  /**
   * POST /api/families
   * Create a new family. The creating user is reassigned into it as admin.
   * This is how additional families get created after first-run setup
   * (setup itself creates the very first family).
   */
  fastify.post(
    '/api/families',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = createFamilySchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const family = await familiesService.createFamily(parseResult.data, request.user.userId);

      void logEvent({
        level: 'info',
        category: 'admin',
        message: `Family "${family.name}" created`,
        details: { familyId: family.id },
        userId: request.user.userId,
      });

      return reply.status(201).send({ family });
    }
  );

  /**
   * PATCH /api/families/:id
   * Rename a family (admin-of-that-family only)
   */
  fastify.patch(
    '/api/families/:id',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      if (request.user.familyId !== id || request.user.role !== 'admin') {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      const parseResult = updateFamilySchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const family = await familiesService.updateFamily(id, parseResult.data);

      if (!family) {
        return reply.status(404).send({ error: 'Family not found' });
      }

      void logEvent({
        level: 'info',
        category: 'admin',
        message: `Family "${family.name}" renamed`,
        details: { familyId: family.id },
        userId: request.user.userId,
      });

      return reply.send({ family });
    }
  );
}
