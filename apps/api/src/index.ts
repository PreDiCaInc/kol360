import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { prismaPlugin } from './plugins/prisma';
import { authPlugin } from './plugins/auth';
import { healthRoutes } from './routes/health';
import { clientRoutes } from './routes/clients';
import { userRoutes } from './routes/users';
import { hcpRoutes } from './routes/hcps';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty' }
      : undefined,
  },
});

async function main() {
  // Security plugins
  await fastify.register(helmet);
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Database
  await fastify.register(prismaPlugin);

  // Authentication
  await fastify.register(authPlugin);

  // Routes
  await fastify.register(healthRoutes, { prefix: '/health' });

  // API v1 routes
  await fastify.register(clientRoutes, { prefix: '/api/v1/clients' });
  await fastify.register(userRoutes, { prefix: '/api/v1/users' });
  await fastify.register(hcpRoutes, { prefix: '/api/v1/hcps' });

  // Start server
  const port = parseInt(process.env.PORT || '3001', 10);
  const host = process.env.HOST || '0.0.0.0';

  try {
    await fastify.listen({ port, host });
    console.log(`Server running at http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
