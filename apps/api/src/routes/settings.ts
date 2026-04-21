import type { FastifyInstance } from 'fastify';
import { getSettings, updateSettings } from '../services/settings.js';
import { updateSettingsSchema } from '@dinner-planner/shared';
import { logEvent } from '../services/appEvents.js';

export async function settingsRoutes(fastify: FastifyInstance) {
  // GET /api/settings
  fastify.get('/api/settings', async (request, reply) => {
    const settings = await getSettings();
    return reply.send({ settings });
  });

  // PATCH /api/settings (admin only)
  fastify.patch(
    '/api/settings',
    {
      preHandler: [fastify.requireAdmin],
    },
    async (request, reply) => {
      const data = updateSettingsSchema.parse(request.body);
      const settings = await updateSettings(data);
      void logEvent({
        level: 'info',
        category: 'admin',
        message: 'Application settings updated',
        details: { changedFields: Object.keys(data) },
        userId: request.user.userId,
      });
      return reply.send({ settings });
    }
  );
}
