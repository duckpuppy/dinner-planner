import { FastifyPluginAsync } from 'fastify';
import { isSetupRequired } from '../services/setup.js';

const BOOT_ID = Date.now().toString();

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => {
    const setupRequired = await isSetupRequired();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      setupRequired,
      bootId: BOOT_ID,
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
