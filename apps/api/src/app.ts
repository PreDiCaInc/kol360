import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { prismaPlugin } from './plugins/prisma';
import { authPlugin } from './plugins/auth';
import { loggingPlugin } from './plugins/logging';
import { healthRoutes } from './routes/health';
import { clientRoutes } from './routes/clients';
import { userRoutes } from './routes/users';
import { hcpRoutes } from './routes/hcps';
import { questionRoutes } from './routes/questions';
import { sectionRoutes } from './routes/sections';
import { surveyTemplateRoutes } from './routes/survey-templates';
import { scoreConfigRoutes } from './routes/score-config';
import { campaignRoutes } from './routes/campaigns';
import { diseaseAreaRoutes } from './routes/disease-areas';
import { distributionRoutes } from './routes/distribution';
import { surveyTakingRoutes } from './routes/survey-taking';
import { responseRoutes } from './routes/responses';
import { nominationRoutes } from './routes/nominations';
import { dashboardRoutes } from './routes/dashboards';
import { liteClientRoutes } from './routes/lite-client';
import { exportRoutes } from './routes/exports';

export function buildApp() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty' }
        : undefined,
    },
  });

  return fastify;
}

export async function configureApp(fastify: ReturnType<typeof Fastify>) {
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

  // Logging (adds trace IDs and request logging)
  await fastify.register(loggingPlugin);

  // Authentication
  await fastify.register(authPlugin);

  // Routes
  await fastify.register(healthRoutes, { prefix: '/health' });

  // API v1 routes
  await fastify.register(clientRoutes, { prefix: '/api/v1/clients' });
  await fastify.register(userRoutes, { prefix: '/api/v1/users' });
  await fastify.register(hcpRoutes, { prefix: '/api/v1/hcps' });
  await fastify.register(questionRoutes, { prefix: '/api/v1/questions' });
  await fastify.register(sectionRoutes, { prefix: '/api/v1/sections' });
  await fastify.register(surveyTemplateRoutes, { prefix: '/api/v1/survey-templates' });
  await fastify.register(scoreConfigRoutes, { prefix: '/api/v1' });
  await fastify.register(campaignRoutes, { prefix: '/api/v1/campaigns' });
  await fastify.register(diseaseAreaRoutes, { prefix: '/api/v1/disease-areas' });
  await fastify.register(distributionRoutes, { prefix: '/api/v1' });
  await fastify.register(responseRoutes, { prefix: '/api/v1/campaigns' });
  await fastify.register(nominationRoutes, { prefix: '/api/v1/campaigns' });
  await fastify.register(exportRoutes, { prefix: '/api/v1/campaigns' });
  await fastify.register(dashboardRoutes, { prefix: '/api/v1' });
  await fastify.register(liteClientRoutes);

  // Public routes (no auth required)
  await fastify.register(surveyTakingRoutes, { prefix: '/api/v1' });

  return fastify;
}
