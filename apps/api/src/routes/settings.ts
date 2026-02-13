import type { FastifyInstance } from 'fastify';
import { getSettings, updateSettings } from '../services/settings.js';
import { updateSettingsSchema } from '@dinner-planner/shared';

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
      return reply.send({ settings });
    }
  );
}
