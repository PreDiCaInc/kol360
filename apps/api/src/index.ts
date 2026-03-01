import { buildApp, configureApp } from './app';

function checkDatabaseSafety() {
  const dbUrl = process.env.DATABASE_URL || '';
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProdDb = dbUrl.includes('kol360-db-prod');
  const isLocalDev = nodeEnv === 'development';

  if (isLocalDev && isProdDb) {
    console.error('\n' + '='.repeat(60));
    console.error('  SAFETY CHECK FAILED: Production DB in development mode!');
    console.error('  DATABASE_URL points to the PRODUCTION database.');
    console.error('  Fix apps/api/.env DATABASE_URL to use localhost (via SSH tunnel).');
    console.error('  Prod host: kol360-db-prod  |  Test host: localhost (tunnel to kol360-db)');
    console.error('='.repeat(60) + '\n');
    process.exit(1);
  }

  // Log which DB we're connected to
  const dbHost = dbUrl.match(/@([^:/?]+)/)?.[1] || 'unknown';
  console.log(`Database: ${isProdDb ? 'PRODUCTION' : 'TEST'} (${dbHost})`);
}

async function main() {
  checkDatabaseSafety();

  const fastify = buildApp();
  await configureApp(fastify);

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
