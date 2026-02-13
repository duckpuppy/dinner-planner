import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { config } from './config.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { usersRoutes } from './routes/users.js';
import { dishesRoutes } from './routes/dishes.js';
import { menusRoutes } from './routes/menus.js';
import { ratingsRoutes } from './routes/ratings.js';
import { historyRoutes } from './routes/history.js';
import { settingsRoutes } from './routes/settings.js';
import authPlugin from './middleware/auth.js';
import { seedAdmin } from './services/seed.js';

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

// Register auth middleware (must be after jwt)
await fastify.register(authPlugin);

// Register routes
await fastify.register(healthRoutes);
await fastify.register(authRoutes);
await fastify.register(usersRoutes);
await fastify.register(dishesRoutes);
await fastify.register(menusRoutes);
await fastify.register(ratingsRoutes);
await fastify.register(historyRoutes);
await fastify.register(settingsRoutes);

// Start server
const start = async () => {
  try {
    // Seed admin user on first run
    await seedAdmin();

    await fastify.listen({ port: config.PORT, host: config.HOST });
    console.log(`Server running at http://${config.HOST}:${config.PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
