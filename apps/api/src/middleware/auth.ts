import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

// Extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: string;
      username: string;
      role: 'admin' | 'member';
    };
    user: {
      userId: string;
      username: string;
      role: 'admin' | 'member';
    };
  }
}

async function authPlugin(fastify: FastifyInstance) {
  /**
   * Decorator to verify JWT token
   * Extracts user info and adds to request.user
   */
  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
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
}

export default fp(authPlugin, {
  name: 'auth-plugin',
  dependencies: ['@fastify/jwt'],
});
