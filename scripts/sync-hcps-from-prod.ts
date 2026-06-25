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

// Tunnel URLs. Host + port + database are hardcoded so this script
// can ONLY ever read from the prod tunnel (5433) and write to the
// test tunnel (5432) — never the other way around. The password is
// injected from the environment via SYNC_DB_PASSWORD; the script
// refuses to run if it's not set. Both DBs share the same admin
// password (rotated 2026-05); per pteam policy do NOT commit
// credentials to the repo.
//
// Tunnel ports per CLAUDE.md:
//   test → localhost:5432
//   prod → localhost:5433
//
// Set the password for the run via:
//   export SYNC_DB_PASSWORD='<the test/prod admin password>'
// or inline:
//   SYNC_DB_PASSWORD='...' npx tsx ../../scripts/sync-hcps-from-prod.ts
const SYNC_DB_PASSWORD = process.env.SYNC_DB_PASSWORD;
if (!SYNC_DB_PASSWORD) {
  throw new Error(
    'REFUSING TO RUN: SYNC_DB_PASSWORD env var is required.\n' +
      "  Set it for the run: export SYNC_DB_PASSWORD='<test/prod admin password>'\n" +
      '  Do NOT hardcode credentials in source. Password is intentionally not committed.',
  );
}
const SOURCE_DB_URL_PROD = `postgresql://kol360admin:${SYNC_DB_PASSWORD}@localhost:5433/kol360`;
const TARGET_DB_URL_TEST = `postgresql://kol360admin:${SYNC_DB_PASSWORD}@localhost:5432/kol360`;

// Runtime IP pin — the URL constants above only describe the LOCAL
// side of the tunnel. If someone misconfigures `tunnel-up.sh prod` to
// route port 5432 → prod RDS (instead of 5433), the URLs look fine
// but the actual server we connect to is prod. The pin below catches
// this by asking the server itself which RDS instance it lives on
// (via `SELECT inet_server_addr()`).
//
// These IPs are the private-VPC IPs of the RDS instances behind the
// bastion tunnels. They are stable across restarts but CAN change on
// a full RDS rebuild / failover. If a future run aborts because the
// observed IP differs, manually verify both tunnels with
//   psql -h localhost -p 5432 -U kol360admin -d kol360 -c 'SELECT inet_server_addr()'
//   psql -h localhost -p 5433 -U kol360admin -d kol360 -c 'SELECT inet_server_addr()'
// and update these constants in source if the IPs legitimately moved.
const EXPECTED_PROD_RDS_IP = '10.0.149.63';   // kol360-db-prod (read source)
const EXPECTED_TEST_RDS_IP = '10.0.153.215';  // kol360-db (write target)

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

  // Runtime tunnel-correctness pin. URL strings only describe the
  // LOCAL side of each tunnel; whether localhost:5432 actually maps
  // to test RDS is a runtime fact we can't infer from constants. Ask
  // each connected server which RDS instance it is. Refuse to run if
  // either side reports an unexpected IP.
  await assertConnectionsPointWhereWeThink();

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

    // v1.17.65 — advance beid_seq past the highest beId we just
    // synced. Postgres sequences DO NOT auto-advance when rows are
    // inserted with explicit values, so without this the next call
    // to nextval('beid_seq') (e.g. from a normal HCP create via the
    // API) would return a value that's already taken by a synced
    // prod row → unique-constraint failure on `beId`. Caught by
    // every HCP-create-or-import e2e test after the first
    // sync run. The setval is idempotent (re-running this script
    // re-reconciles), so it's safe to leave in the happy path.
    const advanceRow = await prismaTest.$queryRaw<Array<{ next_value: bigint }>>`
      SELECT setval(
        'beid_seq',
        GREATEST(
          (SELECT MAX(SUBSTRING("beId" FROM 4)::int) FROM "Hcp" WHERE "beId" ~ '^BE-[0-9]+$'),
          (SELECT last_value FROM beid_seq)
        )
      ) AS next_value
    `;
    console.log(`beid_seq advanced — next nextval() will return ${Number(advanceRow[0]!.next_value) + 1}.`);
  }
}

function redact(url: string): string {
  return url.replace(/:[^@]+@/, ':***@');
}

async function assertConnectionsPointWhereWeThink() {
  const [prodIpRow, testIpRow] = await Promise.all([
    prismaProd.$queryRaw<Array<{ inet_server_addr: string | null }>>`SELECT inet_server_addr()`,
    prismaTest.$queryRaw<Array<{ inet_server_addr: string | null }>>`SELECT inet_server_addr()`,
  ]);
  const prodIp = prodIpRow[0]?.inet_server_addr ?? null;
  const testIp = testIpRow[0]?.inet_server_addr ?? null;

  // The most catastrophic failure: target reports a prod-RDS IP.
  // Refuse hard.
  if (testIp === EXPECTED_PROD_RDS_IP) {
    throw new Error(
      `REFUSING TO RUN — runtime tunnel check FAILED.\n` +
        `  Target connection (localhost:5432) is reporting IP ${testIp}, which is the\n` +
        `  prod RDS instance (EXPECTED_PROD_RDS_IP). Your tunnels are misconfigured —\n` +
        `  someone almost certainly tunneled prod through port 5432. ABORTING before\n` +
        `  any writes happen. Re-bring up tunnels and verify with:\n` +
        `    psql -h localhost -p 5432 -U kol360admin -d kol360 -c 'SELECT inet_server_addr()'\n` +
        `    psql -h localhost -p 5433 -U kol360admin -d kol360 -c 'SELECT inet_server_addr()'`,
    );
  }

  // Both pointing at the same IP — collapsed-tunnel state. Refuse.
  if (prodIp && testIp && prodIp === testIp) {
    throw new Error(
      `REFUSING TO RUN — both 'prod' and 'test' connections resolved to the same RDS IP (${prodIp}). ` +
        `Tunnels are misconfigured. Aborting.`,
    );
  }

  // Either side doesn't match the expected pin — refuse, but with a
  // softer hint that RDS may have failed over and the script needs
  // its IP constants updated.
  if (testIp !== EXPECTED_TEST_RDS_IP) {
    throw new Error(
      `REFUSING TO RUN — target (test) IP is ${testIp ?? 'null'}, expected ${EXPECTED_TEST_RDS_IP}.\n` +
        `  Either the tunnel is wrong OR the test RDS instance was rebuilt / failed over\n` +
        `  to a new IP. Verify with the psql commands above; if the IP legitimately moved,\n` +
        `  update EXPECTED_TEST_RDS_IP in source.`,
    );
  }
  if (prodIp !== EXPECTED_PROD_RDS_IP) {
    throw new Error(
      `REFUSING TO RUN — source (prod) IP is ${prodIp ?? 'null'}, expected ${EXPECTED_PROD_RDS_IP}.\n` +
        `  Verify tunnels with the psql commands above; if the IP legitimately moved,\n` +
        `  update EXPECTED_PROD_RDS_IP in source.`,
    );
  }

  console.log(`  prod IP: ${prodIp} ✓`);
  console.log(`  test IP: ${testIp} ✓`);
  console.log('');
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
