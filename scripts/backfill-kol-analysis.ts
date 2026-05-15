/**
 * Backfill: create one KolAnalysis per existing (client, disease area),
 * include all that pair's campaigns, seed weights from the most recent
 * CompositeScoreConfig (else defaults), then recompute scores.
 *
 * Idempotent — skips a (client, DA) that already has an analysis.
 *
 * Usage: cd apps/api && DATABASE_URL="<url>" npx tsx ../../scripts/backfill-kol-analysis.ts
 * DRY RUN by default — prints the plan. Pass --execute to write + recalculate.
 */

import { PrismaClient } from '@prisma/client';
import { DEFAULT_ANALYSIS_WEIGHTS } from '@kol360/shared';
import { kolAnalysisService } from '../apps/api/src/services/kol-analysis.service';

const prisma = new PrismaClient();
const dryRun = !process.argv.includes('--execute');

async function main() {
  if (dryRun) console.log('=== DRY RUN (pass --execute to write) ===\n');

  const campaigns = await prisma.campaign.findMany({
    select: {
      id: true,
      clientId: true,
      diseaseAreaId: true,
      client: { select: { name: true } },
      diseaseArea: { select: { name: true } },
      compositeScoreConfig: true,
      updatedAt: true,
    },
  });

  // Group campaigns by (clientId, diseaseAreaId)
  const groups = new Map<string, typeof campaigns>();
  for (const c of campaigns) {
    const key = `${c.clientId}::${c.diseaseAreaId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  console.log(`Found ${campaigns.length} campaigns across ${groups.size} (client, disease area) pairs.\n`);

  let created = 0;
  let skipped = 0;

  for (const [key, groupCampaigns] of groups) {
    const [clientId, diseaseAreaId] = key.split('::');
    const sample = groupCampaigns[0];
    const name = `${sample.diseaseArea.name} — ${sample.client.name}`;

    const existing = await prisma.kolAnalysis.findUnique({
      where: { clientId_diseaseAreaId: { clientId, diseaseAreaId } },
    });
    if (existing) {
      console.log(`SKIP  "${name}" — analysis already exists (${existing.id})`);
      skipped++;
      continue;
    }

    // Seed weights from the most recently updated campaign's CompositeScoreConfig
    const withConfig = groupCampaigns
      .filter((c) => c.compositeScoreConfig)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const cfg = withConfig[0]?.compositeScoreConfig;
    const weights = cfg
      ? {
          weightPublications: Number(cfg.weightPublications),
          weightClinicalTrials: Number(cfg.weightClinicalTrials),
          weightTradePubs: Number(cfg.weightTradePubs),
          weightOrgLeadership: Number(cfg.weightOrgLeadership),
          weightOrgAwards: Number(cfg.weightOrgAwards),
          weightConference: Number(cfg.weightConference),
          weightSocialMedia: Number(cfg.weightSocialMedia),
          weightMediaPodcasts: Number(cfg.weightMediaPodcasts),
          weightSurvey: Number(cfg.weightSurvey),
        }
      : DEFAULT_ANALYSIS_WEIGHTS;

    console.log(
      `CREATE "${name}"  campaigns=${groupCampaigns.length}  weights=${cfg ? 'from CompositeScoreConfig' : 'DEFAULT'}`
    );

    if (dryRun) {
      created++;
      continue;
    }

    const analysis = await prisma.kolAnalysis.create({
      data: {
        clientId,
        diseaseAreaId,
        name,
        weightsJson: weights,
        campaigns: {
          create: groupCampaigns.map((c) => ({ campaignId: c.id, included: true })),
        },
      },
    });
    const result = await kolAnalysisService.recalculateAnalysis(analysis.id);
    console.log(`       → recalculated: ${result.processed} HCP scores`);
    created++;
  }

  console.log(`\nDone. created=${created} skipped=${skipped}${dryRun ? ' (dry run)' : ''}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
