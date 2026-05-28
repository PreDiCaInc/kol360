/**
 * Sync new HCPs from prod to test DB.
 * Only ADDS HCPs that exist in prod but not in test (by ID).
 * Does NOT update or delete any existing test records.
 *
 * Setup (one-time): add these to apps/api/.env:
 *   PROD_DATABASE_URL='postgresql://kol360admin:<PROD_PW>@localhost:5433/kol360'
 *   TEST_DATABASE_URL='postgresql://kol360admin:<TEST_PW>@localhost:5432/kol360'
 *
 * Usage: cd apps/api && npx tsx ../../scripts/sync-hcps-prod-to-test.ts [--execute]
 *   Dry run by default. tsx 4+ auto-loads .env from cwd.
 *
 * 2026-05-28: refactored from inline literal passwords to env-var reads
 * after the credential-leak audit (docs/findings/dev-team-asks-2026-05-28.md).
 */

import { PrismaClient } from '@prisma/client';

const PROD_URL = process.env.PROD_DATABASE_URL;
const TEST_URL = process.env.TEST_DATABASE_URL;
if (!PROD_URL || !TEST_URL) {
  console.error(
    'ERROR: PROD_DATABASE_URL and TEST_DATABASE_URL must both be set in your env.\n' +
    '       Add them to apps/api/.env (see header comment) or export in your shell.'
  );
  process.exit(1);
}

const prodDb = new PrismaClient({ datasources: { db: { url: PROD_URL } } });
const testDb = new PrismaClient({ datasources: { db: { url: TEST_URL } } });

const dryRun = !process.argv.includes('--execute');

async function main() {
  if (dryRun) console.log('=== DRY RUN (pass --execute to sync) ===\n');

  await prodDb.$connect();
  await testDb.$connect();

  // Get all prod HCP IDs
  const prodIds: { id: string }[] = await prodDb.$queryRawUnsafe('SELECT id FROM "Hcp"');
  console.log(`Prod HCPs: ${prodIds.length}`);

  // Get all test HCP IDs
  const testIds: { id: string }[] = await testDb.$queryRawUnsafe('SELECT id FROM "Hcp"');
  const testIdSet = new Set(testIds.map(h => h.id));
  console.log(`Test HCPs: ${testIds.length}`);

  // Find IDs in prod but not in test
  const missingIds = prodIds.map(h => h.id).filter(id => !testIdSet.has(id));
  console.log(`Missing in test: ${missingIds.length}\n`);

  if (missingIds.length === 0) {
    console.log('Nothing to sync.');
    return;
  }

  // Also check for beId conflicts — test may have same beId under a different id
  const BATCH = 500;
  let inserted = 0;
  let skippedBeId = 0;

  for (let i = 0; i < missingIds.length; i += BATCH) {
    const batch = missingIds.slice(i, i + BATCH);
    const hcps: any[] = await prodDb.$queryRawUnsafe(
      'SELECT id, "beId", "firstName", "lastName", email, specialty, npi, state, city FROM "Hcp" WHERE id = ANY($1::text[])',
      batch
    );

    for (const h of hcps) {
      if (!dryRun) {
        try {
          await testDb.$executeRawUnsafe(
            `INSERT INTO "Hcp" (id, "beId", "firstName", "lastName", email, specialty, npi, state, city, "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()) ON CONFLICT (id) DO NOTHING`,
            h.id, h.beId, h.firstName, h.lastName, h.email, h.specialty, h.npi, h.state, h.city
          );
          inserted++;
        } catch {
          skippedBeId++;
        }
      } else {
        inserted++;
      }
    }
    process.stdout.write(`  Processed ${Math.min(i + BATCH, missingIds.length)}/${missingIds.length}\r`);
  }

  console.log(`\n${dryRun ? 'Would insert' : 'Inserted'}: ${inserted}`);
  if (skippedBeId > 0) console.log(`Skipped (beId conflict): ${skippedBeId}`);

  if (!dryRun) {
    const finalCount = await testDb.$queryRawUnsafe('SELECT COUNT(*)::int as count FROM "Hcp"');
    console.log(`Test HCPs now: ${(finalCount as any)[0].count}`);
  }

  await prodDb.$disconnect();
  await testDb.$disconnect();
}

main().catch(console.error);
