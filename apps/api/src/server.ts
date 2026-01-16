import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { config } from './config.js';
import { healthRoutes } from './routes/health.js';

const fastify = Fastify({
  logger: {
    level: config.NODE_ENV === 'development' ? 'debug' : 'info',
    transport:
      config.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
});

// Register plugins
await fastify.register(cors, {
  origin: config.CORS_ORIGIN,
  credentials: true,
});

await fastify.register(cookie);

await fastify.register(jwt, {
  secret: config.JWT_SECRET,
});

// Register routes
await fastify.register(healthRoutes);

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: config.PORT, host: config.HOST });
    console.log(`Server running at http://${config.HOST}:${config.PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
