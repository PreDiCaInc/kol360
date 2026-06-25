/**
 * sync-segment-scores-from-prod.ts — Tier 2 add-on to sync-hcps-from-prod.ts.
 *
 * Brings prod's segment-score landscape over to test in two steps:
 *
 *   1. DiseaseArea — upsert each prod DA into test by id. Skips any
 *      DA that looks like a test fixture (id LIKE 'cme2e0%' OR code
 *      collides with a test fixture code).
 *
 *   2. HcpDiseaseAreaScore — for each prod score row whose hcpId AND
 *      diseaseAreaId both exist on the test side, upsert the row
 *      (all 8 segment columns, nomination/campaign counts, the
 *      isCurrent flag and history fields). Rows whose hcpId is
 *      missing on test are skipped — the natural read is "you forgot
 *      to run sync-hcps-from-prod.ts first."
 *
 * Run sequence (do these in order):
 *
 *   scripts/tunnel-up.sh test     # in one terminal
 *   scripts/tunnel-up.sh prod     # in another
 *
 *   # 1. Identity first (Hcp + HcpAlias)
 *   cd apps/api && npx tsx ../../scripts/sync-hcps-from-prod.ts --execute
 *
 *   # 2. Then segment scores (this file)
 *   cd apps/api && npx tsx ../../scripts/sync-segment-scores-from-prod.ts --execute
 *
 * Dry-run by default. Re-runnable forever — upsert by id makes it
 * idempotent for the row set, and re-running after a prod re-score
 * picks up updated scores.
 *
 * What this does NOT do:
 *   - Tier 3 stuff: no campaigns, no KolAnalysis, no nominations,
 *     no HcpAnalysisScore. Those are analysis-scoped — sync them
 *     and you end up cloning prod's tenant universe wholesale.
 *   - Sync of HcpDiseaseArea (the M2M for "which DAs has this HCP
 *     been tagged with"). Add if needed — same pattern as DA scores,
 *     gated on both ends existing in test.
 *   - Backfill any HcpAnalysisScore rows. Those need an analysis to
 *     exist; running `Recalculate` on the analysis side rebuilds them
 *     from HcpDiseaseAreaScore plus survey data.
 */

import { PrismaClient } from '@prisma/client';

const dryRun = !process.argv.includes('--execute');
const batchArg = process.argv.find((a) => a.startsWith('--batch='));
const BATCH_SIZE = batchArg ? Number.parseInt(batchArg.split('=')[1], 10) : 500;

// Hardcoded tunnel URLs. NOT user-overridable. See sync-hcps-from-prod.ts
// for the rationale — same safety guarantee applies here: this script
// can only ever read from prod and write to test, never the other way.
const SOURCE_DB_URL_PROD = 'postgresql://kol360admin:RDS4Bioexec2025@localhost:5433/kol360';
const TARGET_DB_URL_TEST = 'postgresql://kol360admin:RDS4Bioexec2025@localhost:5432/kol360';

// Runtime IP pin — see sync-hcps-from-prod.ts for rationale.
// `tunnel-up.sh` could route the wrong RDS through localhost:5432;
// the URL constants here can't detect that. Asking the connected
// server for inet_server_addr() does.
const EXPECTED_PROD_RDS_IP = '10.0.149.63';
const EXPECTED_TEST_RDS_IP = '10.0.153.215';

const TEST_FIXTURE_ID_PREFIX = 'cme2e0';

function assertSafety() {
  if (SOURCE_DB_URL_PROD === TARGET_DB_URL_TEST) {
    throw new Error('REFUSING TO RUN: source and target URLs are identical.');
  }
  if (!SOURCE_DB_URL_PROD.includes(':5433/')) {
    throw new Error('REFUSING TO RUN: SOURCE_DB_URL_PROD must be the prod tunnel (port 5433).');
  }
  if (!TARGET_DB_URL_TEST.includes(':5432/')) {
    throw new Error('REFUSING TO RUN: TARGET_DB_URL_TEST must be the test tunnel (port 5432).');
  }
  if (TARGET_DB_URL_TEST.includes('kol360-db-prod')) {
    throw new Error('REFUSING TO RUN: TARGET_DB_URL_TEST contains "kol360-db-prod".');
  }
}

assertSafety();

const prismaProd = new PrismaClient({
  datasources: { db: { url: SOURCE_DB_URL_PROD } },
});
const prismaTest = new PrismaClient({
  datasources: { db: { url: TARGET_DB_URL_TEST } },
});

interface Stats {
  daProdTotal: number;
  daSkippedFixture: number;
  daSkippedCodeCollision: number;
  daUpserted: number;

  scoreProdTotal: number;
  scoreSkippedNoHcp: number;
  scoreSkippedNoDa: number;
  scoreUpserted: number;
}

async function main() {
  console.log('');
  console.log('==============================================');
  console.log(`Segment scores sync prod → test  ${dryRun ? '(DRY RUN)' : '(EXECUTING)'}`);
  console.log('==============================================');
  console.log(`  source : ${redact(SOURCE_DB_URL_PROD)}`);
  console.log(`  target : ${redact(TARGET_DB_URL_TEST)}`);
  console.log(`  batch  : ${BATCH_SIZE}`);
  console.log('');

  await Promise.all([prismaTest.$connect(), prismaProd.$connect()]);
  await assertConnectionsPointWhereWeThink();

  const stats: Stats = {
    daProdTotal: 0,
    daSkippedFixture: 0,
    daSkippedCodeCollision: 0,
    daUpserted: 0,
    scoreProdTotal: 0,
    scoreSkippedNoHcp: 0,
    scoreSkippedNoDa: 0,
    scoreUpserted: 0,
  };

  // ---------- 1. DiseaseArea ----------
  // Prod and test were seeded independently — same `code` values
  // (DRY_EYE / RETINA / GLAUCOMA / CORNEA / MEDICAL_ONCOLOGY) but
  // different cuids on each side. Matching by `code` (which is
  // UNIQUE) lets us:
  //   - Update the matching test DA's metadata (therapeutic area,
  //     name, isActive) from prod values
  //   - Create new DAs for prod codes that don't exist in test
  //   - Build a prod-id → test-id translation map for Step 2 so
  //     score rows can reference the right side's DA id
  // No cross-side overwrite of fixture codes (E2E_ONCOLOGY,
  // E2E_PARITY_DA stay test-only).
  console.log('--- Step 1: DiseaseArea ---');

  const testDas = await prismaTest.diseaseArea.findMany({
    select: { id: true, code: true },
  });
  const testIdByCode = new Map<string, string>(
    testDas.map((d: { id: string; code: string }) => [d.code, d.id]),
  );
  const fixtureCodes = new Set(
    testDas
      .filter((d: { id: string }) => d.id.startsWith(TEST_FIXTURE_ID_PREFIX))
      .map((d: { code: string }) => d.code),
  );
  console.log(`Test side: ${testDas.length} DAs (${fixtureCodes.size} fixture codes protected).`);

  const prodDas = await prismaProd.diseaseArea.findMany();
  stats.daProdTotal = prodDas.length;
  console.log(`Prod side: ${prodDas.length} DAs to consider.`);

  // prodDaIdToTestDaId: built so Step 2 can translate score rows.
  // Includes BOTH already-matched DAs (same code on both sides) and
  // newly-created DAs (where we used prod's id directly on test).
  const prodDaIdToTestDaId = new Map<string, string>();

  for (const d of prodDas) {
    // Prod fixtures (cme2e0 prefix) can't be in prod, but defense
    // in depth.
    if (d.id.startsWith(TEST_FIXTURE_ID_PREFIX)) {
      stats.daSkippedFixture += 1;
      continue;
    }
    if (fixtureCodes.has(d.code)) {
      // Don't touch test-fixture DAs — they're scoped to e2e tests.
      stats.daSkippedCodeCollision += 1;
      continue;
    }

    const existingTestId = testIdByCode.get(d.code);

    if (dryRun) {
      stats.daUpserted += 1;
      // Mirror the real-execute mapping so Step 2's dry-run is honest.
      prodDaIdToTestDaId.set(d.id, existingTestId ?? d.id);
      continue;
    }

    try {
      if (existingTestId) {
        // Match by code: update the existing test DA in-place,
        // keeping its test-side id.
        await prismaTest.diseaseArea.update({
          where: { id: existingTestId },
          data: {
            therapeuticArea: d.therapeuticArea,
            name: d.name,
            isActive: d.isActive,
          },
        });
        prodDaIdToTestDaId.set(d.id, existingTestId);
      } else {
        // No test DA owns this code — create one. Use prod's id so
        // future syncs become a stable update path.
        await prismaTest.diseaseArea.create({
          data: {
            id: d.id,
            therapeuticArea: d.therapeuticArea,
            name: d.name,
            code: d.code,
            isActive: d.isActive,
          },
        });
        prodDaIdToTestDaId.set(d.id, d.id);
        testIdByCode.set(d.code, d.id);
      }
      stats.daUpserted += 1;
    } catch (err) {
      console.warn(`Skip DA ${d.id} (${d.name}, code ${d.code}): ${(err as Error).message}`);
    }
  }

  // ---------- 2. HcpDiseaseAreaScore ----------
  console.log('');
  console.log('--- Step 2: HcpDiseaseAreaScore ---');

  const testHcpRows = await prismaTest.hcp.findMany({ select: { id: true } });
  const testHcpIds = new Set(testHcpRows.map((r: { id: string }) => r.id));
  console.log(
    `Test side: ${testHcpIds.size} HCPs, ${prodDaIdToTestDaId.size} prod-DA → test-DA mappings.`,
  );

  const prodScoreCount = await prismaProd.hcpDiseaseAreaScore.count();
  console.log(`Prod side: ${prodScoreCount} score rows to consider.`);
  console.log('');

  let cursor: string | undefined;
  let batchNum = 0;
  while (true) {
    const prodBatch = await prismaProd.hcpDiseaseAreaScore.findMany({
      take: BATCH_SIZE,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { id: 'asc' },
    });
    if (prodBatch.length === 0) break;
    batchNum += 1;
    cursor = prodBatch[prodBatch.length - 1]!.id;
    stats.scoreProdTotal += prodBatch.length;

    for (const s of prodBatch) {
      if (!testHcpIds.has(s.hcpId)) {
        stats.scoreSkippedNoHcp += 1;
        continue;
      }
      // Translate prod's diseaseAreaId → test's diseaseAreaId via the
      // code-matched map built in Step 1. If the prod DA wasn't synced
      // (e.g. its code collided with a test fixture), there's nowhere
      // for this score to land — skip.
      const testDaId = prodDaIdToTestDaId.get(s.diseaseAreaId);
      if (!testDaId) {
        stats.scoreSkippedNoDa += 1;
        continue;
      }

      if (dryRun) {
        stats.scoreUpserted += 1;
        continue;
      }

      const data = {
        hcpId: s.hcpId,
        diseaseAreaId: testDaId,
        scorePublications: s.scorePublications,
        scoreClinicalTrials: s.scoreClinicalTrials,
        scoreTradePubs: s.scoreTradePubs,
        scoreOrgLeadership: s.scoreOrgLeadership,
        scoreOrgAwards: s.scoreOrgAwards,
        scoreConference: s.scoreConference,
        scoreSocialMedia: s.scoreSocialMedia,
        scoreMediaPodcasts: s.scoreMediaPodcasts,
        totalNominationCount: s.totalNominationCount,
        isCurrent: s.isCurrent,
        effectiveFrom: s.effectiveFrom,
        effectiveTo: s.effectiveTo,
        campaignCount: s.campaignCount,
        lastCalculatedAt: s.lastCalculatedAt,
      };

      try {
        await prismaTest.hcpDiseaseAreaScore.upsert({
          where: { id: s.id },
          update: data,
          create: { id: s.id, ...data },
        });
        stats.scoreUpserted += 1;
      } catch (err) {
        console.warn(
          `Skip score ${s.id} (hcp ${s.hcpId}, prod-da ${s.diseaseAreaId} → test-da ${testDaId}): ${(err as Error).message}`,
        );
      }
    }

    if (batchNum % 5 === 0 || prodBatch.length < BATCH_SIZE) {
      console.log(
        `… batch ${batchNum}: processed ${stats.scoreProdTotal} / ${prodScoreCount} ` +
          `(upsert ${stats.scoreUpserted}, skip-no-hcp ${stats.scoreSkippedNoHcp}, skip-no-da ${stats.scoreSkippedNoDa})`,
      );
    }
  }

  console.log('');
  console.log('==============================================');
  console.log('Summary');
  console.log('==============================================');
  console.log('Disease areas:');
  console.log(`  prod considered           : ${stats.daProdTotal}`);
  console.log(`  skipped (test fixture)    : ${stats.daSkippedFixture}`);
  console.log(`  skipped (code collision)  : ${stats.daSkippedCodeCollision}`);
  console.log(`  ${dryRun ? 'would-upsert' : 'upserted'}                  : ${stats.daUpserted}`);
  console.log('Segment scores:');
  console.log(`  prod considered           : ${stats.scoreProdTotal}`);
  console.log(`  skipped (HCP not in test) : ${stats.scoreSkippedNoHcp}`);
  console.log(`  skipped (DA not in test)  : ${stats.scoreSkippedNoDa}`);
  console.log(`  ${dryRun ? 'would-upsert' : 'upserted'}                  : ${stats.scoreUpserted}`);
  console.log('');
  if (dryRun) {
    console.log('Dry run only. No writes happened. Re-run with --execute to commit.');
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

  if (testIp === EXPECTED_PROD_RDS_IP) {
    throw new Error(
      `REFUSING TO RUN — target connection reporting prod RDS IP (${testIp}). ` +
        `Tunnels are misconfigured. ABORTING before any writes.`,
    );
  }
  if (prodIp && testIp && prodIp === testIp) {
    throw new Error(
      `REFUSING TO RUN — prod and test connections resolved to the same IP (${prodIp}). Aborting.`,
    );
  }
  if (testIp !== EXPECTED_TEST_RDS_IP) {
    throw new Error(
      `REFUSING TO RUN — test IP is ${testIp ?? 'null'}, expected ${EXPECTED_TEST_RDS_IP}. ` +
        `Tunnel wrong, or RDS rebuilt — update EXPECTED_TEST_RDS_IP if so.`,
    );
  }
  if (prodIp !== EXPECTED_PROD_RDS_IP) {
    throw new Error(
      `REFUSING TO RUN — prod IP is ${prodIp ?? 'null'}, expected ${EXPECTED_PROD_RDS_IP}. ` +
        `Tunnel wrong, or RDS rebuilt — update EXPECTED_PROD_RDS_IP if so.`,
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
