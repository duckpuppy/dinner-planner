import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { adminReassignUserSchema } from '@dinner-planner/shared';
import * as adminService from '../services/admin.js';
import { logEvent } from '../services/appEvents.js';

/**
 * Instance-wide super-admin routes. All handlers here are deliberately
 * cross-family (unscoped by request.user.familyId) -- gated entirely by
 * fastify.requireSuperAdmin, which is fully independent of the family-scoped
 * `role: 'admin'` check used by requireAdmin elsewhere in the codebase.
 */
export async function adminRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/admin/families
   * List every family in the instance with a member count (super-admin only)
   */
  fastify.get(
    '/api/admin/families',
    { preHandler: [fastify.requireSuperAdmin] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const families = await adminService.listAllFamilies();
      return reply.send({ families });
    }
  );

  /**
   * GET /api/admin/users
   * List every user across every family in the instance (super-admin only)
   */
  fastify.get(
    '/api/admin/users',
    { preHandler: [fastify.requireSuperAdmin] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const users = await adminService.listAllUsers();
      return reply.send({ users });
    }
  );

  /**
   * PATCH /api/admin/users/:id
   * Reassign a user's family and/or role, unconditionally (super-admin
   * only). This is the repair path for a family that's already orphaned
   * (zero admins) -- see services/admin.ts for why the
   * isSoleAdminOrphaningFamily safeguard does NOT apply here.
   */
  fastify.patch(
    '/api/admin/users/:id',
    { preHandler: [fastify.requireSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parseResult = adminReassignUserSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const result = await adminService.reassignUser(id, parseResult.data);

      if (!result.success) {
        const error = result.code === 'user_not_found' ? 'User not found' : 'Family not found';
        return reply.status(404).send({ error });
      }

      void logEvent({
        level: 'warn',
        category: 'admin',
        message: `User "${result.user.username}" reassigned by super-admin`,
        details: { targetUserId: id, changes: Object.keys(parseResult.data) },
        userId: request.user.userId,
      });

      return reply.send({ user: result.user });
    }
  );
}
