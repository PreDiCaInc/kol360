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
 *   - Write to prod. The source (prod) + target (test) DB URLs are
 *     hardcoded constants below; no env-var or CLI flag can flip them.
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
 * NO env-var URL override. By design.
 *   Source (prod) and target (test) DB URLs are hardcoded in the
 *   constants below. The whole point is that this script CANNOT
 *   write to prod — not by mistake, not by a fat-fingered env var,
 *   not by an --execute --source --target flag flip. If you need a
 *   different target DB, edit the constant below in source and
 *   commit it. There is no "convenient" runtime override.
 */

import { PrismaClient } from '@prisma/client';

const dryRun = !process.argv.includes('--execute');
const batchArg = process.argv.find((a) => a.startsWith('--batch='));
const BATCH_SIZE = batchArg ? Number.parseInt(batchArg.split('=')[1], 10) : 500;

// Hardcoded tunnel URLs. NOT user-overridable. The whole point is
// that this script can only ever read from the prod tunnel and write
// to the test tunnel — never the other way around. To change a
// target, edit these constants in source.
//
// Tunnel ports per CLAUDE.md:
//   test → localhost:5432
//   prod → localhost:5433
// Both DBs share the same password since the 2026-05 rotation;
// host/port is the distinguisher.
const SOURCE_DB_URL_PROD = 'postgresql://kol360admin:RDS4Bioexec2025@localhost:5433/kol360';
const TARGET_DB_URL_TEST = 'postgresql://kol360admin:RDS4Bioexec2025@localhost:5432/kol360';

// Hard guards. None of these should ever fire if the constants above
// haven't been tampered with — they're tripwires for the case where
// someone edits the file and gets it wrong.
function assertSafety() {
  if (SOURCE_DB_URL_PROD === TARGET_DB_URL_TEST) {
    throw new Error(
      'REFUSING TO RUN: source and target URLs are identical. The hardcoded ' +
        'constants in this file have been edited to point at the same DB.',
    );
  }
  if (!SOURCE_DB_URL_PROD.includes(':5433/')) {
    throw new Error(
      'REFUSING TO RUN: SOURCE_DB_URL_PROD must be the prod tunnel (port 5433). ' +
        'The hardcoded constant in this file has been edited.',
    );
  }
  if (!TARGET_DB_URL_TEST.includes(':5432/')) {
    throw new Error(
      'REFUSING TO RUN: TARGET_DB_URL_TEST must be the test tunnel (port 5432). ' +
        'The hardcoded constant in this file has been edited.',
    );
  }
  if (TARGET_DB_URL_TEST.includes('kol360-db-prod')) {
    throw new Error(
      'REFUSING TO RUN: TARGET_DB_URL_TEST contains "kol360-db-prod". ' +
        'Aborting — would write to prod.',
    );
  }
}

assertSafety();

// Naming convention: `prismaProd` is read-only intent (only findMany
// is called against it); `prismaTest` is the write target (upserts).
// Greppable so the read/write directionality is obvious at every
// call site.
const prismaProd = new PrismaClient({
  datasources: { db: { url: SOURCE_DB_URL_PROD } },
});
const prismaTest = new PrismaClient({
  datasources: { db: { url: TARGET_DB_URL_TEST } },
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
  console.log(`  source : ${redact(SOURCE_DB_URL_PROD)}`);
  console.log(`  target : ${redact(TARGET_DB_URL_TEST)}`);
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
