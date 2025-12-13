import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const createPrismaClient = () => {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });
};

export const prisma = global.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// Handle connection errors gracefully
prisma.$connect().catch((e) => {
  console.error('Failed to connect to database:', e);
});
