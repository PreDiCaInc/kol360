import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { prismaPlugin } from './plugins/prisma';
import { authPlugin } from './plugins/auth';
import { loggingPlugin } from './plugins/logging';
import { errorHandlerPlugin } from './plugins/error-handler';
import { healthRoutes } from './routes/health';
import { clientRoutes } from './routes/clients';
import { userRoutes } from './routes/users';
import { hcpRoutes } from './routes/hcps';
import { questionRoutes } from './routes/questions';
import { sectionRoutes } from './routes/sections';
import { surveyTemplateRoutes } from './routes/survey-templates';
// score-config routes removed in Phase 3 PR A (campaign-level scoring teardown).
// Weights now live on KolAnalysis per-analysis; see /admin/kol-analysis dashboard.
import { campaignRoutes } from './routes/campaigns';
import { diseaseAreaRoutes } from './routes/disease-areas';
import { distributionRoutes } from './routes/distribution';
import { surveyTakingRoutes } from './routes/survey-taking';
import { responseRoutes } from './routes/responses';
import { nominationRoutes } from './routes/nominations';
import { dashboardRoutes } from './routes/dashboards';
import { liteClientRoutes } from './routes/lite-client';
// score-calculation routes removed in Phase 3 PR A — calculate-survey / calculate-
// composite / publish-scores all obsoleted by KOL Analysis pooled normalization.
// Disease-area composite recalc (hardcoded weights bug) also retired with the
// service — see Phase 3 plan motivation #2.
import { exportRoutes } from './routes/exports';
import { specialtyRoutes } from './routes/specialties';
import { insightsReportRoutes } from './routes/insights-report';
import { optOutRoutes } from './routes/opt-outs';
import { kolAnalysisRoutes } from './routes/kol-analysis';

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
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // API returns JSON, CSP not applicable
    crossOriginResourcePolicy: { policy: 'same-origin' },
    hsts: { maxAge: 31536000, includeSubDomains: true },
  });
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });
  await fastify.register(rateLimit, {
    max: 5000,
    timeWindow: '1 minute',
  });

  // Database
  await fastify.register(prismaPlugin);

  // Logging (adds trace IDs and request logging)
  await fastify.register(loggingPlugin);

  // Global error handler (must be after logging for trace IDs)
  await fastify.register(errorHandlerPlugin);

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
  // scoreConfigRoutes removed in Phase 3 PR A.
  await fastify.register(campaignRoutes, { prefix: '/api/v1/campaigns' });
  await fastify.register(diseaseAreaRoutes, { prefix: '/api/v1/disease-areas' });
  await fastify.register(specialtyRoutes, { prefix: '/api/v1/specialties' });
  await fastify.register(distributionRoutes, { prefix: '/api/v1' });
  await fastify.register(responseRoutes, { prefix: '/api/v1/campaigns' });
  await fastify.register(nominationRoutes, { prefix: '/api/v1/campaigns' });
  // scoreCalculationRoutes removed in Phase 3 PR A.
  await fastify.register(exportRoutes, { prefix: '/api/v1/campaigns' });
  await fastify.register(dashboardRoutes, { prefix: '/api/v1' });
  await fastify.register(insightsReportRoutes, { prefix: '/api/v1/insights' });
  await fastify.register(optOutRoutes, { prefix: '/api/v1/admin/opt-outs' });
  await fastify.register(kolAnalysisRoutes, { prefix: '/api/v1/admin/kol-analysis' });
  await fastify.register(liteClientRoutes);

  // Public routes (no auth required)
  await fastify.register(surveyTakingRoutes, { prefix: '/api/v1' });

  return fastify;
}
