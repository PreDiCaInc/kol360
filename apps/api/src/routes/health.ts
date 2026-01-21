import { FastifyPluginAsync } from 'fastify';

// Track process start time for uptime calculation
const processStartTime = Date.now();

interface HealthCheck {
  status: 'ok' | 'error';
  latency_ms?: number;
  error?: string;
}

interface FullHealthResponse {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  uptime_seconds: number;
  timestamp: string;
  checks: Record<string, HealthCheck>;
  memory: {
    used_mb: number;
    total_mb: number;
    heap_used_mb: number;
    heap_total_mb: number;
  };
}

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  // Root health check (simple, no DB)
  fastify.get('/', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Liveness check - is the process running?
  fastify.get('/live', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Readiness check - can handle traffic?
  fastify.get('/ready', async (request, reply) => {
    const checks: Record<string, string> = {};
    let overallStatus: 'ok' | 'error' = 'ok';

    // Check database
    try {
      await fastify.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
      overallStatus = 'error';
    }

    const statusCode = overallStatus === 'ok' ? 200 : 503;
    return reply.status(statusCode).send({
      status: overallStatus,
      checks,
    });
  });

  // Full health check - detailed status (requires auth token in production)
  fastify.get('/full', async (request, reply) => {
    // Require authentication for detailed health checks in production
    if (process.env.NODE_ENV === 'production') {
      const authHeader = request.headers['x-health-token'] || request.headers.authorization;
      const expectedToken = process.env.HEALTH_CHECK_TOKEN;

      if (!expectedToken) {
        return reply.status(503).send({ error: 'Health check not configured' });
      }

      const providedToken = typeof authHeader === 'string'
        ? authHeader.replace('Bearer ', '')
        : '';

      if (providedToken !== expectedToken) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
    }
    const checks: Record<string, HealthCheck> = {};
    let overallStatus: 'ok' | 'degraded' | 'error' = 'ok';

    // Check database with latency
    const dbStart = Date.now();
    try {
      await fastify.prisma.$queryRaw`SELECT 1`;
      checks.database = {
        status: 'ok',
        latency_ms: Date.now() - dbStart,
      };
    } catch (error) {
      checks.database = {
        status: 'error',
        latency_ms: Date.now() - dbStart,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      overallStatus = 'error';
    }

    // Check if any non-critical checks are slow (degraded)
    if (overallStatus === 'ok' && checks.database.latency_ms && checks.database.latency_ms > 500) {
      overallStatus = 'degraded';
    }

    // Memory stats
    const memUsage = process.memoryUsage();
    const totalMem = require('os').totalmem();

    const response: FullHealthResponse = {
      status: overallStatus,
      version: process.env.npm_package_version || '1.0.0',
      uptime_seconds: Math.floor((Date.now() - processStartTime) / 1000),
      timestamp: new Date().toISOString(),
      checks,
      memory: {
        used_mb: Math.round(memUsage.rss / 1024 / 1024),
        total_mb: Math.round(totalMem / 1024 / 1024),
        heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
      },
    };

    const statusCode = overallStatus === 'error' ? 503 : 200;
    return reply.status(statusCode).send(response);
  });
};
