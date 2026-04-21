import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { loginSchema } from '@dinner-planner/shared';
import { z } from 'zod';
import * as authService from '../services/auth.js';
import * as apiTokenService from '../services/apiTokens.js';
import { config } from '../config.js';
import { logEvent } from '../services/appEvents.js';

// Cookie options for refresh token
// Omit domain so the cookie binds to whatever host the browser is using
// (works for localhost dev, IP address access, and production domains alike)
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

const CLEAR_COOKIE_OPTIONS = {
  path: '/api/auth',
};

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/auth/login
   * Authenticate user and return tokens
   */
  fastify.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = loginSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { username, password } = parseResult.data;

      const result = await authService.login(username, password, (payload) =>
        fastify.jwt.sign(payload, { expiresIn: config.JWT_ACCESS_EXPIRY })
      );

      if (!result) {
        void logEvent({
          level: 'warn',
          category: 'auth',
          message: `Failed login attempt for "${username}"`,
        });
        return reply.status(401).send({
          error: 'Invalid username or password',
        });
      }

      // Set refresh token as httpOnly cookie
      reply.setCookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTIONS);

      void logEvent({
        level: 'info',
        category: 'auth',
        message: `User "${username}" logged in`,
        userId: result.user.id,
      });

      return reply.send({
        user: result.user,
        accessToken: result.accessToken,
      });
    }
  );

  /**
   * POST /api/auth/refresh
   * Refresh access token using refresh token cookie
   */
  fastify.post(
    '/api/auth/refresh',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const refreshToken = request.cookies.refreshToken;

      if (!refreshToken) {
        return reply.status(401).send({
          error: 'No refresh token provided',
        });
      }

      const result = await authService.refreshAccessToken(refreshToken, (payload) =>
        fastify.jwt.sign(payload, { expiresIn: config.JWT_ACCESS_EXPIRY })
      );

      if (!result) {
        // Clear invalid cookie
        reply.clearCookie('refreshToken', CLEAR_COOKIE_OPTIONS);
        return reply.status(401).send({
          error: 'Invalid or expired refresh token',
        });
      }

      return reply.send({
        user: result.user,
        accessToken: result.accessToken,
      });
    }
  );

  /**
   * POST /api/auth/logout
   * Invalidate refresh token and clear cookie
   */
  fastify.post('/api/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const refreshToken = request.cookies.refreshToken;

    if (refreshToken) {
      await authService.logout(refreshToken);
    }

    reply.clearCookie('refreshToken', CLEAR_COOKIE_OPTIONS);

    return reply.send({ success: true });
  });

  /**
   * GET /api/auth/me
   * Get current authenticated user info (requires auth)
   */
  fastify.get(
    '/api/auth/me',
    {
      preHandler: [fastify.authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await authService.getUserById(request.user.userId);

      if (!user) {
        return reply.status(404).send({
          error: 'User not found',
        });
      }

      return reply.send({
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          theme: user.theme,
          homeView: user.homeView,
        },
      });
    }
  );

  const createTokenSchema = z.object({
    name: z.string().min(1).max(100),
    expiresAt: z.string().datetime().optional(),
  });

  /**
   * GET /api/auth/tokens
   * List API tokens for the current admin user
   */
  fastify.get(
    '/api/auth/tokens',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.user.role !== 'admin') {
        return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
      }
      return reply.send({ tokens: apiTokenService.listApiTokens(request.user.userId) });
    }
  );

  /**
   * POST /api/auth/tokens
   * Create a new API token (admin only). Returns the plaintext token once.
   */
  fastify.post(
    '/api/auth/tokens',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.user.role !== 'admin') {
        return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
      }
      const parseResult = createTokenSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }
      const { name, expiresAt } = parseResult.data;
      const { token, id } = apiTokenService.generateApiToken(request.user.userId, name, expiresAt);
      return reply.status(201).send({ id, name, token, expiresAt: expiresAt ?? null });
    }
  );

  /**
   * DELETE /api/auth/tokens/:id
   * Revoke an API token (owner only)
   */
  fastify.delete<{ Params: { id: string } }>(
    '/api/auth/tokens/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const deleted = apiTokenService.revokeApiToken(request.params.id, request.user.userId);
      if (!deleted) {
        return reply.status(404).send({ error: 'Token not found' });
      }
      return reply.send({ success: true });
    }
  );
}
