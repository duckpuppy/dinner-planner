import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createDisplayLinkSchema } from '@dinner-planner/shared';
import * as displayLinksService from '../services/displayLinks.js';
import { logEvent } from '../services/appEvents.js';

/**
 * Family-admin management of kiosk display links. Display keys (dpk_) are
 * read-only and are never accepted here: requireAdmin only accepts a JWT.
 */
export async function displayLinksRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/display-links  {name}
   * Returns the token ONCE; only its sha256 is stored.
   */
  fastify.post(
    '/api/display-links',
    { preHandler: [fastify.requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = createDisplayLinkSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const created = displayLinksService.createDisplayLink(
        request.user.familyId,
        request.user.userId,
        parseResult.data.name
      );

      void logEvent({
        level: 'info',
        category: 'admin',
        message: `Display link "${created.name}" created`,
        details: { displayLinkId: created.id },
        userId: request.user.userId,
      });

      return reply.status(201).send({
        id: created.id,
        name: created.name,
        token: created.token,
        // Relative; the web app prefixes window.location.origin.
        url: `/kiosk?key=${created.token}`,
        createdAt: created.createdAt,
      });
    }
  );

  /**
   * GET /api/display-links
   * Active display links for the caller's family. Never includes tokens.
   */
  fastify.get(
    '/api/display-links',
    { preHandler: [fastify.requireAdmin] },
    async (request: FastifyRequest) => {
      return { displayLinks: displayLinksService.listDisplayLinks(request.user.familyId) };
    }
  );

  /**
   * DELETE /api/display-links/:id
   * Revokes the link. 404 if missing, already revoked, or in another family.
   */
  fastify.delete(
    '/api/display-links/:id',
    { preHandler: [fastify.requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      if (!displayLinksService.revokeDisplayLink(id, request.user.familyId)) {
        return reply.status(404).send({ error: 'Display link not found' });
      }

      void logEvent({
        level: 'warn',
        category: 'admin',
        message: `Display link ${id} revoked`,
        details: { displayLinkId: id },
        userId: request.user.userId,
      });

      return reply.send({ success: true });
    }
  );
}
