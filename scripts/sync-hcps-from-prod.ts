/**
 * sync-hcps-from-prod.ts — one-shot HCP identity sync from prod → test.
 *
 * What this does:
 *   - Reads every Hcp + HcpAlias row from prod
 *   - Skips rows that look like test fixtures (id LIKE 'cme2e0%' OR
 *     beId LIKE 'E2E-%')
 *   - Skips rows whose npi OR beId collides with an existing
 *     test fixture row (we never overwrite test-side data)
 *   - Upserts everything else into test by id
 *   - Sets importBatchId = null on insert (prod batches don't exist
 *     in test; that FK would fail and the prod batch ID is meaningless
 *     in the test environment)
 *
 * What this does NOT do:
 *   - Tier 2/3 stuff: no DiseaseArea, no HcpDiseaseAreaScore, no
 *     HcpSpecialty, no campaigns / nominations / responses / analyses.
 *     "Identity only" per the Tier 1 plan.
 *   - Write to prod. Hard guard against it; see PROD_HOST_HINT below.
 *
 * Safety:
 *   - Two PrismaClient instances, each with an explicit datasources
 *     URL — no env-var ambiguity.
 *   - URL validation up front. If the URL labelled `prod` doesn't
 *     contain "kol360-db-prod" the script bails before constructing
 *     the Prisma clients. If the URL labelled `test` accidentally
 *     points at prod (-prod in the host), same thing — bail.
 *   - Dry-run by default. --execute required for writes. Dry run
 *     still reads from prod (counts + sample rows) but never touches
 *     test.
 *
 * Usage (tunnels must be up first):
 *
 *   # one terminal:
 *   scripts/tunnel-up.sh test    # localhost:5432 → test
 *
 *   # another terminal:
 *   scripts/tunnel-up.sh prod    # localhost:5433 → prod
 *
 *   # dry-run (default — counts only, no writes):
 *   cd apps/api && npx tsx ../../scripts/sync-hcps-from-prod.ts
 *
 *   # commit:
 *   cd apps/api && npx tsx ../../scripts/sync-hcps-from-prod.ts --execute
 *
 * Override URLs (not normally needed):
 *
 *   TEST_DB_URL="postgresql://..." PROD_DB_URL="postgresql://..." \
 *     npx tsx ../../scripts/sync-hcps-from-prod.ts --execute
 */

import { PrismaClient } from '@prisma/client';

const dryRun = !process.argv.includes('--execute');
const batchArg = process.argv.find((a) => a.startsWith('--batch='));
const BATCH_SIZE = batchArg ? Number.parseInt(batchArg.split('=')[1], 10) : 500;

// Default tunnel URLs (per CLAUDE.md):
//   test → localhost:5432
//   prod → localhost:5433
// Both DBs share the same password since the 2026-05 rotation;
// host/port is the distinguisher.
const PASSWORD = 'RDS4Bioexec2025';
const TEST_DB_URL =
  process.env.TEST_DB_URL ??
  `postgresql://kol360admin:${PASSWORD}@localhost:5432/kol360`;
const PROD_DB_URL =
  process.env.PROD_DB_URL ??
  `postgresql://kol360admin:${PASSWORD}@localhost:5433/kol360`;

// Hint substrings expected in each URL. Used purely for the safety
// guard below — NOT for connection routing.
const PROD_HOST_HINT = 'kol360-db-prod';
const TEST_PORT_HINT = ':5432/';
const PROD_PORT_HINT = ':5433/';

function assertSafety() {
  // Reject if test URL has any prod-host marker.
  if (TEST_DB_URL.includes(PROD_HOST_HINT)) {
    throw new Error(
      `REFUSING TO RUN: TEST_DB_URL contains "${PROD_HOST_HINT}". ` +
        `That URL looks like prod. This script writes to its 'test' connection — ` +
        `if it pointed at prod we'd corrupt prod. Double-check TEST_DB_URL.`,
    );
  }
  // Both tunnel URLs use localhost — distinguish by port. If both
  // resolve to the same port, we'd be copying a DB onto itself; refuse.
  if (TEST_DB_URL === PROD_DB_URL) {
    throw new Error('REFUSING TO RUN: TEST_DB_URL === PROD_DB_URL. Aborting.');
  }
  // Soft hint: warn (don't bail) if the ports aren't the expected
  // tunnel ports. Allows TEST_DB_URL override (e.g. when running
  // against a non-tunnel test DB).
  if (!TEST_DB_URL.includes(TEST_PORT_HINT)) {
    console.warn(
      `⚠ TEST_DB_URL doesn't look like the canonical test tunnel (expected port 5432). Continuing.`,
    );
  }
  if (!PROD_DB_URL.includes(PROD_PORT_HINT)) {
    console.warn(
      `⚠ PROD_DB_URL doesn't look like the canonical prod tunnel (expected port 5433). Continuing.`,
    );
  }
}

assertSafety();

const prismaTest = new PrismaClient({
  datasources: { db: { url: TEST_DB_URL } },
});
const prismaProd = new PrismaClient({
  datasources: { db: { url: PROD_DB_URL } },
});

const TEST_FIXTURE_ID_PREFIX = 'cme2e0';
const TEST_FIXTURE_BEID_PREFIX = 'E2E-';

interface SyncStats {
  prodTotal: number;
  skippedFixture: number;       // prod row looks like a test fixture
  skippedNpiCollision: number;  // prod NPI already used by a test fixture
  skippedBeIdCollision: number; // prod beId already used by a test fixture
  inserted: number;
  updated: number;
  aliasesInserted: number;
}

async function main() {
  console.log('');
  console.log('==============================================');
  console.log(`HCP sync prod → test  ${dryRun ? '(DRY RUN — no writes)' : '(EXECUTING — writes enabled)'}`);
  console.log('==============================================');
  console.log(`  source : ${redact(PROD_DB_URL)}`);
  console.log(`  target : ${redact(TEST_DB_URL)}`);
  console.log(`  batch  : ${BATCH_SIZE}`);
  console.log('');

  // Connect both sides up front so we fail fast if a tunnel is down.
  await Promise.all([prismaTest.$connect(), prismaProd.$connect()]);

  // ---- 1. Snapshot the test-side protected sets ----
  // These are the NPIs + beIds we will never overwrite (test
  // fixtures + anything pre-existing in test). Pull them once at the
  // top so we don't query test for every prod row.
  const testRows = await prismaTest.hcp.findMany({
    select: { id: true, npi: true, beId: true },
  });
  const protectedNpis = new Set(
    testRows.map((r: { npi: string | null }) => r.npi).filter((n: string | null): n is string => !!n),
  );
  const protectedBeIds = new Set(testRows.map((r: { beId: string }) => r.beId));
  const knownTestIds = new Set(testRows.map((r: { id: string }) => r.id));
  console.log(`Test side: ${testRows.length} existing HCPs (${protectedNpis.size} have an NPI).`);

  // ---- 2. Stream prod HCPs in batches ----
  const stats: SyncStats = {
    prodTotal: 0,
    skippedFixture: 0,
    skippedNpiCollision: 0,
    skippedBeIdCollision: 0,
    inserted: 0,
    updated: 0,
    aliasesInserted: 0,
  };

  const prodCount = await prismaProd.hcp.count();
  console.log(`Prod side: ${prodCount} total HCPs to consider.`);
  console.log('');

  let cursor: string | undefined;
  let batchNum = 0;
  while (true) {
    const prodBatch = await prismaProd.hcp.findMany({
      take: BATCH_SIZE,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { id: 'asc' },
      include: { aliases: true },
    });
    if (prodBatch.length === 0) break;
    batchNum += 1;
    cursor = prodBatch[prodBatch.length - 1]!.id;
    stats.prodTotal += prodBatch.length;

    for (const p of prodBatch) {
      // Skip prod rows that already exist in test by id (defensive —
      // shouldn't happen given cuid collision odds, but cheap to check).
      if (knownTestIds.has(p.id)) {
        // Treat as update path below.
      }
      // Skip rows that look like test fixtures on either side.
      if (
        p.id.startsWith(TEST_FIXTURE_ID_PREFIX) ||
        p.beId.startsWith(TEST_FIXTURE_BEID_PREFIX)
      ) {
        stats.skippedFixture += 1;
        continue;
      }
      // Skip rows whose NPI or beId collides with a test fixture row
      // we don't want to overwrite. (knownTestIds + protected sets
      // catch both 'pre-existing real HCP in test' and 'test fixture'.)
      if (p.npi && protectedNpis.has(p.npi) && !knownTestIds.has(p.id)) {
        stats.skippedNpiCollision += 1;
        continue;
      }
      if (protectedBeIds.has(p.beId) && !knownTestIds.has(p.id)) {
        stats.skippedBeIdCollision += 1;
        continue;
      }

      if (dryRun) {
        // Don't mutate; just count.
        if (knownTestIds.has(p.id)) stats.updated += 1;
        else stats.inserted += 1;
        continue;
      }

      // Upsert by id. importBatchId nulled — prod batch IDs don't
      // exist in test.
      const data = {
        beId: p.beId,
        npi: p.npi,
        isSurveyTaker: p.isSurveyTaker,
        isNominated: p.isNominated,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        specialty: p.specialty,
        subSpecialty: p.subSpecialty,
        city: p.city,
        state: p.state,
        yearsInPractice: p.yearsInPractice,
        createdBy: p.createdBy,
        curationManagedAt: p.curationManagedAt,
        discoveredFrom: p.discoveredFrom ?? undefined,
        // importBatchId intentionally omitted on update; null on create.
      };

      try {
        const result = await prismaTest.hcp.upsert({
          where: { id: p.id },
          update: data,
          create: { id: p.id, ...data, importBatchId: null },
        });

        if (knownTestIds.has(p.id)) {
          stats.updated += 1;
        } else {
          stats.inserted += 1;
          // Remember it now in case a later prod row shares an NPI
          // (shouldn't happen but defensive).
          knownTestIds.add(p.id);
          if (p.npi) protectedNpis.add(p.npi);
          protectedBeIds.add(p.beId);
        }

        // Aliases — re-upsert each (unique by (hcpId, aliasName)).
        for (const alias of p.aliases) {
          await prismaTest.hcpAlias.upsert({
            where: { hcpId_aliasName: { hcpId: result.id, aliasName: alias.aliasName } },
            update: {},
            create: {
              id: alias.id,
              hcpId: result.id,
              aliasName: alias.aliasName,
              createdBy: alias.createdBy,
            },
          });
          stats.aliasesInserted += 1;
        }
      } catch (err) {
        console.warn(
          `Skip ${p.id} (${p.firstName} ${p.lastName}, NPI ${p.npi ?? '∅'}): ${(err as Error).message}`,
        );
      }
    }

    if (batchNum % 5 === 0 || prodBatch.length < BATCH_SIZE) {
      console.log(
        `… batch ${batchNum}: processed ${stats.prodTotal} / ${prodCount} prod rows ` +
          `(insert ${stats.inserted}, update ${stats.updated}, ` +
          `skip ${stats.skippedFixture + stats.skippedNpiCollision + stats.skippedBeIdCollision})`,
      );
    }
  }

  console.log('');
  console.log('==============================================');
  console.log('Summary');
  console.log('==============================================');
  console.log(`  prod rows considered    : ${stats.prodTotal}`);
  console.log(`  skipped (test fixture)  : ${stats.skippedFixture}`);
  console.log(`  skipped (NPI collision) : ${stats.skippedNpiCollision}`);
  console.log(`  skipped (beId collision): ${stats.skippedBeIdCollision}`);
  console.log(`  ${dryRun ? 'would-insert' : 'inserted'}            : ${stats.inserted}`);
  console.log(`  ${dryRun ? 'would-update' : 'updated'}             : ${stats.updated}`);
  console.log(`  aliases ${dryRun ? 'would-write' : 'written'}     : ${stats.aliasesInserted}`);
  console.log('');
  if (dryRun) {
    console.log('Dry run only. No writes happened. Re-run with --execute to commit.');
  } else {
    const after = await prismaTest.hcp.count();
    console.log(`Test HCP table now has ${after} rows total.`);
  }
}

function redact(url: string): string {
  return url.replace(/:[^@]+@/, ':***@');
}

main()
  .catch((err) => {
    console.error('Sync failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prismaProd.$disconnect();
    await prismaTest.$disconnect();
  });
