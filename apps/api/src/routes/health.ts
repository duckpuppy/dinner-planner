import { FastifyPluginAsync } from 'fastify';
import { isSetupRequired } from '../services/setup.js';
import { APP_VERSION } from '../version.js';

// Generated once per process start; changes when the server restarts (e.g. after redeployment)
const INSTANCE_ID = crypto.randomUUID();

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => {
    const setupRequired = await isSetupRequired();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      setupRequired,
      instanceId: INSTANCE_ID,
      version: APP_VERSION,
    };
  });

  fastify.get('/api/v1/health', async () => {
    const setupRequired = await isSetupRequired();
    return {
      status: 'ok',
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
      setupRequired,
    };
  });
};
