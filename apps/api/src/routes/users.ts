import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createUserSchema,
  updateUserSchema,
  userPreferencesSchema,
  changePasswordSchema,
} from '@dinner-planner/shared';
import * as usersService from '../services/users.js';
import { z } from 'zod';
import { logEvent } from '../services/appEvents.js';

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function usersRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/users
   * List all users (admin only)
   */
  fastify.get(
    '/api/users',
    { preHandler: [fastify.requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const users = await usersService.getAllUsers();
      return reply.send({ users });
    }
  );

  /**
   * GET /api/users/:id
   * Get user by ID (admin or self)
   */
  fastify.get(
    '/api/users/:id',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      // Non-admins can only view their own profile
      if (request.user.role !== 'admin' && request.user.userId !== id) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      const user = await usersService.getUserById(id);

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      return reply.send({ user });
    }
  );

  /**
   * POST /api/users
   * Create a new user (admin only)
   */
  fastify.post(
    '/api/users',
    { preHandler: [fastify.requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = createUserSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      try {
        const user = await usersService.createUser(parseResult.data);
        void logEvent({
          level: 'info',
          category: 'admin',
          message: `User "${user.username}" created by admin`,
          details: { createdUserId: user.id, role: parseResult.data.role ?? 'member' },
          userId: request.user.userId,
        });
        return reply.status(201).send({ user });
      } catch (error) {
        if (error instanceof Error && error.message === 'Username already exists') {
          return reply.status(409).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  /**
   * PATCH /api/users/:id
   * Update user (admin only)
   */
  fastify.patch(
    '/api/users/:id',
    { preHandler: [fastify.requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parseResult = updateUserSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const user = await usersService.updateUser(id, parseResult.data);

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      void logEvent({
        level: 'info',
        category: 'admin',
        message: `User "${user.username}" updated by admin`,
        details: { updatedUserId: id, changes: Object.keys(parseResult.data) },
        userId: request.user.userId,
      });

      return reply.send({ user });
    }
  );

  /**
   * PATCH /api/users/:id/preferences
   * Update user preferences (own profile only)
   */
  fastify.patch(
    '/api/users/:id/preferences',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      // Users can only update their own preferences
      if (request.user.userId !== id) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      const parseResult = userPreferencesSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const user = await usersService.updateUserPreferences(id, parseResult.data);

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      return reply.send({ user });
    }
  );

  /**
   * POST /api/users/:id/change-password
   * Change own password (authenticated users)
   */
  fastify.post(
    '/api/users/:id/change-password',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      // Users can only change their own password
      if (request.user.userId !== id) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      const parseResult = changePasswordSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const result = await usersService.changePassword(
        id,
        parseResult.data.currentPassword,
        parseResult.data.newPassword
      );

      if (!result.success) {
        return reply.status(400).send({ error: result.error });
      }

      void logEvent({
        level: 'info',
        category: 'auth',
        message: 'User changed their password',
        userId: id,
      });

      return reply.send({ success: true });
    }
  );

  /**
   * POST /api/users/:id/reset-password
   * Reset user password (admin only)
   */
  fastify.post(
    '/api/users/:id/reset-password',
    { preHandler: [fastify.requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const parseResult = resetPasswordSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const result = await usersService.resetPassword(id, parseResult.data.newPassword);

      if (!result.success) {
        return reply.status(404).send({ error: result.error });
      }

      void logEvent({
        level: 'info',
        category: 'admin',
        message: `Password reset for user ${id} by admin`,
        details: { targetUserId: id },
        userId: request.user.userId,
      });

      return reply.send({ success: true });
    }
  );

  /**
   * DELETE /api/users/:id
   * Delete user (admin only)
   */
  fastify.delete(
    '/api/users/:id',
    { preHandler: [fastify.requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const result = await usersService.deleteUser(id, request.user.userId);

      if (!result.success) {
        const status = result.error === 'User not found' ? 404 : 400;
        return reply.status(status).send({ error: result.error });
      }

      void logEvent({
        level: 'warn',
        category: 'admin',
        message: `User ${id} deleted by admin`,
        details: { deletedUserId: id },
        userId: request.user.userId,
      });

      return reply.send({ success: true });
    }
  );
}
