import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { validateApiToken } from '../services/apiTokens.js';

// Extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireSuperAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: string;
      username: string;
      role: 'admin' | 'member';
      familyId: string;
      isSuperAdmin: boolean;
    };
    user: {
      userId: string;
      username: string;
      role: 'admin' | 'member';
      familyId: string;
      isSuperAdmin: boolean;
    };
  }
}

async function authPlugin(fastify: FastifyInstance) {
  /**
   * Decorator to verify JWT token
   * Extracts user info and adds to request.user
   */
  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    // API token fast-path: dp_-prefixed tokens skip JWT verification
    if (token?.startsWith('dp_')) {
      const user = validateApiToken(token);
      if (!user) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid or expired API token',
        });
      }
      request.user = user;
      return;
    }

    try {
      await request.jwtVerify();
    } catch {
      reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired access token',
      });
    }
  });

  /**
   * Decorator to require admin role
   * Must be used after authenticate
   */
  fastify.decorate('requireAdmin', async function (request: FastifyRequest, reply: FastifyReply) {
    // First authenticate
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired access token',
      });
    }

    // Then check role
    if (request.user.role !== 'admin') {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Admin access required',
      });
    }
  });

  /**
   * Decorator to require instance-wide super-admin access.
   * Fully independent of the family-scoped `requireAdmin`/`role` check above.
   * Must be used after authenticate (this decorator authenticates itself).
   */
  fastify.decorate(
    'requireSuperAdmin',
    async function (request: FastifyRequest, reply: FastifyReply) {
      // First authenticate
      try {
        await request.jwtVerify();
      } catch {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid or expired access token',
        });
      }

      // Then check super-admin flag
      if (request.user.isSuperAdmin !== true) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Super-admin access required',
        });
      }
    }
  );
}

export default fp(authPlugin, {
  name: 'auth-plugin',
  dependencies: ['@fastify/jwt'],
});
