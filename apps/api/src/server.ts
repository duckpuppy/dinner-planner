import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import rateLimit from '@fastify/rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from './config.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { usersRoutes } from './routes/users.js';
import { dishesRoutes } from './routes/dishes.js';
import { menusRoutes } from './routes/menus.js';
import { ratingsRoutes } from './routes/ratings.js';
import { historyRoutes } from './routes/history.js';
import { settingsRoutes } from './routes/settings.js';
import { suggestionsRoutes } from './routes/suggestions.js';
import { patternsRoutes } from './routes/patterns.js';
import { photosRoutes } from './routes/photos.js';
import { prepTasksRoutes } from './routes/prepTasks.js';
import { dishNotesRoutes } from './routes/dishNotes.js';
import { pantryRoutes } from './routes/pantry.js';
import { groceryRoutes } from './routes/grocery.js';
import { setupRoutes } from './routes/setup.js';
import { videoJobsRoutes } from './routes/videoJobs.js';
import { startVideoCleanupScheduler } from './services/videoCleanupScheduler.js';
import { restaurantsRoutes } from './routes/restaurants.js';
import { appEventsRoutes } from './routes/appEvents.js';
import { logEvent } from './services/appEvents.js';
import authPlugin from './middleware/auth.js';
import { seedAdmin } from './services/seed.js';
import { productionCspDirectives } from './csp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fastify = Fastify({
  trustProxy: true, // Required for correct client IP detection behind Nginx/reverse proxies
  logger: {
    level: config.NODE_ENV === 'development' ? 'debug' : 'info',
    transport:
      config.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
});

// Register Swagger docs (development only)
if (config.NODE_ENV !== 'production') {
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Dinner Planner API',
        description: 'REST API for the Dinner Planner application',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });
  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list' },
  });
}

// Register plugins
// CSP only enforced in production — Swagger UI uses inline scripts in dev
await fastify.register(helmet, {
  contentSecurityPolicy:
    config.NODE_ENV === 'production' ? { directives: productionCspDirectives } : false,
});

await fastify.register(cors, {
  origin: config.CORS_ORIGIN,
  credentials: true,
});

await fastify.register(cookie);

await fastify.register(jwt, {
  secret: config.JWT_SECRET,
});

// Register rate limiting (disabled in test environment)
if (config.NODE_ENV !== 'test') {
  await fastify.register(rateLimit, {
    // No global limit — per-route only
    global: false,
  });
}

// Register multipart (file uploads)
await fastify.register(multipart);

// Serve uploaded photos at /uploads/ (all environments)
await fastify.register(fastifyStatic, {
  root: join(__dirname, '../../data/uploads'),
  prefix: '/uploads/',
  decorateReply: false,
});

// Serve downloaded videos at /videos/
await fastify.register(fastifyStatic, {
  root: join(__dirname, '../../data/videos'),
  prefix: '/videos/',
  decorateReply: false,
});

// Register auth middleware (must be after jwt)
await fastify.register(authPlugin);

// Register routes
await fastify.register(setupRoutes);
await fastify.register(healthRoutes);
await fastify.register(authRoutes);
await fastify.register(usersRoutes);
await fastify.register(dishesRoutes);
await fastify.register(menusRoutes);
await fastify.register(ratingsRoutes);
await fastify.register(historyRoutes);
await fastify.register(settingsRoutes);
await fastify.register(suggestionsRoutes);
await fastify.register(patternsRoutes);
await fastify.register(photosRoutes);
await fastify.register(prepTasksRoutes);
await fastify.register(dishNotesRoutes);
await fastify.register(pantryRoutes);
await fastify.register(groceryRoutes);
await fastify.register(videoJobsRoutes);
await fastify.register(restaurantsRoutes);
await fastify.register(appEventsRoutes);

// Serve static files in production
if (config.NODE_ENV === 'production') {
  const webDistPath = join(__dirname, '../../web/dist');

  // Serve static assets
  await fastify.register(fastifyStatic, {
    root: webDistPath,
    prefix: '/',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  });

  // SPA fallback - serve index.html for all non-API routes
  fastify.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/') || request.url.startsWith('/health')) {
      reply.code(404).send({ error: 'Not Found' });
    } else {
      reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      reply.sendFile('index.html');
    }
  });
}

// Start server
const start = async () => {
  try {
    // Seed admin user on first run
    await seedAdmin();
    startVideoCleanupScheduler();

    await fastify.listen({ port: config.PORT, host: config.HOST });
    console.log(`Server running at http://${config.HOST}:${config.PORT}`);
    void logEvent({
      level: 'info',
      category: 'system',
      message: `Server started on port ${config.PORT}`,
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
