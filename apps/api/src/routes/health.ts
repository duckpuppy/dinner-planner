import { FastifyPluginAsync } from 'fastify';
import { isSetupRequired } from '../services/setup.js';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => {
    const setupRequired = await isSetupRequired();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      setupRequired,
    };
  });

  fastify.get('/api/v1/health', async () => {
    const setupRequired = await isSetupRequired();
    return {
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      setupRequired,
    };
  });
};
