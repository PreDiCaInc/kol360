import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export const prismaPlugin = fp(async (fastify) => {
  const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'info', 'warn', 'error']
      : ['error'],
  });

  // Use lazy connection - don't fail startup if DB is unavailable
  // Connection will be established on first query
  if (process.env.DATABASE_URL) {
    try {
      await prisma.$connect();
      fastify.log.info('Database connected');
    } catch (error) {
      fastify.log.error('Database connection failed, will retry on first query');
    }
  } else {
    fastify.log.warn('DATABASE_URL not set - database features will be unavailable');
  }

  fastify.decorate('prisma', prisma);

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
});
