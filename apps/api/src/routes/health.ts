import { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  // Liveness check
  fastify.get('/live', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Readiness check
  fastify.get('/ready', async () => {
    try {
      await fastify.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', checks: { database: 'ok' } };
    } catch (error) {
      return { status: 'error', checks: { database: 'error' } };
    }
  });
};
