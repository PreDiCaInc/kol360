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

const PASSWORD = 'RDS4Bioexec2025';
const TEST_DB_URL =
  process.env.TEST_DB_URL ??
  `postgresql://kol360admin:${PASSWORD}@localhost:5432/kol360`;
const PROD_DB_URL =
  process.env.PROD_DB_URL ??
  `postgresql://kol360admin:${PASSWORD}@localhost:5433/kol360`;

const PROD_HOST_HINT = 'kol360-db-prod';
const TEST_FIXTURE_ID_PREFIX = 'cme2e0';

function assertSafety() {
  if (TEST_DB_URL.includes(PROD_HOST_HINT)) {
    throw new Error(
      `REFUSING TO RUN: TEST_DB_URL contains "${PROD_HOST_HINT}". Aborting.`,
    );
  }
  if (TEST_DB_URL === PROD_DB_URL) {
    throw new Error('REFUSING TO RUN: TEST_DB_URL === PROD_DB_URL. Aborting.');
  }
}

assertSafety();

const prismaTest = new PrismaClient({
  datasources: { db: { url: TEST_DB_URL } },
});
const prismaProd = new PrismaClient({
  datasources: { db: { url: PROD_DB_URL } },
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
  console.log(`  source : ${redact(PROD_DB_URL)}`);
  console.log(`  target : ${redact(TEST_DB_URL)}`);
  console.log(`  batch  : ${BATCH_SIZE}`);
  console.log('');

  await Promise.all([prismaTest.$connect(), prismaProd.$connect()]);

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
  console.log('--- Step 1: DiseaseArea ---');

  const testDas = await prismaTest.diseaseArea.findMany({
    select: { id: true, code: true },
  });
  const testDaIds = new Set(testDas.map((d: { id: string }) => d.id));
  const protectedDaCodes = new Set(
    testDas
      .filter((d: { id: string }) => d.id.startsWith(TEST_FIXTURE_ID_PREFIX))
      .map((d: { code: string }) => d.code),
  );
  console.log(`Test side: ${testDas.length} DAs (${protectedDaCodes.size} fixture codes protected).`);

  const prodDas = await prismaProd.diseaseArea.findMany();
  stats.daProdTotal = prodDas.length;
  console.log(`Prod side: ${prodDas.length} DAs to consider.`);

  for (const d of prodDas) {
    if (d.id.startsWith(TEST_FIXTURE_ID_PREFIX)) {
      stats.daSkippedFixture += 1;
      continue;
    }
    if (protectedDaCodes.has(d.code) && !testDaIds.has(d.id)) {
      // A test fixture DA already owns this code. Don't overwrite it.
      stats.daSkippedCodeCollision += 1;
      continue;
    }

    if (dryRun) {
      stats.daUpserted += 1;
      continue;
    }

    try {
      await prismaTest.diseaseArea.upsert({
        where: { id: d.id },
        update: {
          therapeuticArea: d.therapeuticArea,
          name: d.name,
          code: d.code,
          isActive: d.isActive,
        },
        create: {
          id: d.id,
          therapeuticArea: d.therapeuticArea,
          name: d.name,
          code: d.code,
          isActive: d.isActive,
        },
      });
      stats.daUpserted += 1;
      testDaIds.add(d.id);
    } catch (err) {
      console.warn(`Skip DA ${d.id} (${d.name}): ${(err as Error).message}`);
    }
  }

  // ---------- 2. HcpDiseaseAreaScore ----------
  console.log('');
  console.log('--- Step 2: HcpDiseaseAreaScore ---');

  const testHcpRows = await prismaTest.hcp.findMany({ select: { id: true } });
  const testHcpIds = new Set(testHcpRows.map((r: { id: string }) => r.id));
  console.log(`Test side: ${testHcpIds.size} HCPs, ${testDaIds.size} DAs available as targets.`);

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
      if (!testDaIds.has(s.diseaseAreaId)) {
        stats.scoreSkippedNoDa += 1;
        continue;
      }

      if (dryRun) {
        stats.scoreUpserted += 1;
        continue;
      }

      const data = {
        hcpId: s.hcpId,
        diseaseAreaId: s.diseaseAreaId,
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
          `Skip score ${s.id} (hcp ${s.hcpId}, da ${s.diseaseAreaId}): ${(err as Error).message}`,
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

main()
  .catch((err) => {
    console.error('Sync failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prismaProd.$disconnect();
    await prismaTest.$disconnect();
  });
