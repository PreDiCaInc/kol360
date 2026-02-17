/**
 * Import 8 segment scores for Dry Eye HCPs from File 2
 *
 * Reads the weighted scores Excel file and upserts HcpDiseaseAreaScore records
 * for the Dry Eye disease area. Updates existing records (from survey publish)
 * and creates new ones for HCPs that only have segment scores.
 *
 * Run with: npx tsx scripts/import-dry-eye-segment-scores.ts
 */

import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';

// Load DATABASE_URL from apps/api/.env
const envPath = join(__dirname, '../apps/api/.env');
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

const prisma = new PrismaClient({ log: ['warn', 'error'] });

const FILE2_PATH = join(__dirname, '../func-spec/1-Weighted Scores for Haranath - NOT Final Scores.xlsx');

// File 2 column mapping (1-based):
// Col 1: NPI
// Col 5: Peer-Reviewed Publication Score → scorePublications
// Col 6: Trade Publication Score → scoreTradePubs
// Col 7: Organizational Leadership Score → scoreOrgLeadership
// Col 8: Organizational Awards Score → scoreOrgAwards
// Col 9: Clinical Trial Score → scoreClinicalTrials
// Col 10: Conference Educator Score → scoreConference
// Col 11: Social Media Score → scoreSocialMedia
// Col 12: Media (Podcasts/Blogs) Score → scoreMediaPodcasts

const SCORE_COLUMNS: Array<{ col: number; field: string }> = [
  { col: 5, field: 'scorePublications' },
  { col: 6, field: 'scoreTradePubs' },
  { col: 7, field: 'scoreOrgLeadership' },
  { col: 8, field: 'scoreOrgAwards' },
  { col: 9, field: 'scoreClinicalTrials' },
  { col: 10, field: 'scoreConference' },
  { col: 11, field: 'scoreSocialMedia' },
  { col: 12, field: 'scoreMediaPodcasts' },
];

// Default composite score weights
const WEIGHTS: Record<string, number> = {
  weightPublications: 10,
  weightClinicalTrials: 15,
  weightTradePubs: 10,
  weightOrgLeadership: 10,
  weightOrgAwards: 10,
  weightConference: 10,
  weightSocialMedia: 5,
  weightMediaPodcasts: 5,
  weightSurvey: 25,
};

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Dry Eye Segment Scores Import');
  console.log('═══════════════════════════════════════════════');

  // Get Dry Eye disease area
  const da = await prisma.diseaseArea.findFirst({ where: { code: 'DRY_EYE' } });
  if (!da) {
    console.error('DRY_EYE disease area not found. Run import-dry-eye-survey.ts first.');
    process.exit(1);
  }
  console.log(`\nDisease area: ${da.name} (${da.id})`);

  // Read File 2
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE2_PATH);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('No worksheet found');

  const totalRows = sheet.rowCount - 1;
  console.log(`Processing ${totalRows} rows from File 2\n`);

  // Bulk load all HCPs by NPI for fast lookup
  const allHcps = await prisma.hcp.findMany({
    where: { npi: { not: null } },
    select: { id: true, npi: true },
  });
  const hcpByNpi = new Map(allHcps.map((h) => [h.npi!, h.id]));

  // Bulk load existing disease area scores
  const existingScores = await prisma.hcpDiseaseAreaScore.findMany({
    where: { diseaseAreaId: da.id, isCurrent: true },
    select: {
      id: true,
      hcpId: true,
      scoreSurvey: true,
      totalNominationCount: true,
      campaignCount: true,
    },
  });
  const scoreByHcpId = new Map(existingScores.map((s) => [s.hcpId, s]));
  console.log(`Existing disease area scores: ${existingScores.length}`);

  const toNum = (val: unknown): number => (val ? Number(val) : 0);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const now = new Date();

  for (let rowIdx = 2; rowIdx <= sheet.rowCount; rowIdx++) {
    const row = sheet.getRow(rowIdx);
    const npi = row.getCell(1).text?.trim();
    if (!npi) continue;

    const hcpId = hcpByNpi.get(npi);
    if (!hcpId) {
      skipped++;
      continue;
    }

    // Extract 8 segment scores
    const scoreData: Record<string, number | null> = {};
    let hasAnyScore = false;
    for (const { col, field } of SCORE_COLUMNS) {
      const text = row.getCell(col).text?.trim();
      if (text) {
        const num = parseFloat(text);
        if (!isNaN(num) && num >= 0 && num <= 100) {
          scoreData[field] = num;
          hasAnyScore = true;
        } else {
          scoreData[field] = null;
        }
      } else {
        scoreData[field] = null;
      }
    }

    if (!hasAnyScore) {
      skipped++;
      continue;
    }

    const existing = scoreByHcpId.get(hcpId);

    if (existing) {
      // Update existing record (from survey publish) with segment scores
      // Calculate new composite with both segment + survey scores
      const surveyScore = toNum(existing.scoreSurvey);
      const composite =
        (toNum(scoreData.scorePublications) * WEIGHTS.weightPublications) / 100 +
        (toNum(scoreData.scoreClinicalTrials) * WEIGHTS.weightClinicalTrials) / 100 +
        (toNum(scoreData.scoreTradePubs) * WEIGHTS.weightTradePubs) / 100 +
        (toNum(scoreData.scoreOrgLeadership) * WEIGHTS.weightOrgLeadership) / 100 +
        (toNum(scoreData.scoreOrgAwards) * WEIGHTS.weightOrgAwards) / 100 +
        (toNum(scoreData.scoreConference) * WEIGHTS.weightConference) / 100 +
        (toNum(scoreData.scoreSocialMedia) * WEIGHTS.weightSocialMedia) / 100 +
        (toNum(scoreData.scoreMediaPodcasts) * WEIGHTS.weightMediaPodcasts) / 100 +
        (surveyScore * WEIGHTS.weightSurvey) / 100;

      await prisma.hcpDiseaseAreaScore.update({
        where: { id: existing.id },
        data: {
          ...scoreData,
          compositeScore: composite,
          lastCalculatedAt: now,
        },
      });
      updated++;
    } else {
      // Create new record (HCP has segment scores but no survey score)
      const composite =
        (toNum(scoreData.scorePublications) * WEIGHTS.weightPublications) / 100 +
        (toNum(scoreData.scoreClinicalTrials) * WEIGHTS.weightClinicalTrials) / 100 +
        (toNum(scoreData.scoreTradePubs) * WEIGHTS.weightTradePubs) / 100 +
        (toNum(scoreData.scoreOrgLeadership) * WEIGHTS.weightOrgLeadership) / 100 +
        (toNum(scoreData.scoreOrgAwards) * WEIGHTS.weightOrgAwards) / 100 +
        (toNum(scoreData.scoreConference) * WEIGHTS.weightConference) / 100 +
        (toNum(scoreData.scoreSocialMedia) * WEIGHTS.weightSocialMedia) / 100 +
        (toNum(scoreData.scoreMediaPodcasts) * WEIGHTS.weightMediaPodcasts) / 100;

      await prisma.hcpDiseaseAreaScore.create({
        data: {
          hcpId,
          diseaseAreaId: da.id,
          ...scoreData,
          compositeScore: composite,
          isCurrent: true,
          effectiveFrom: now,
          lastCalculatedAt: now,
        },
      });
      created++;
    }

    if ((created + updated) % 500 === 0) {
      console.log(`  Processed ${created + updated} (${created} created, ${updated} updated, ${skipped} skipped)`);
    }
  }

  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`  Segment Score Import Complete!`);
  console.log(`    Created: ${created}`);
  console.log(`    Updated: ${updated} (added segment scores to existing survey scores)`);
  console.log(`    Skipped: ${skipped} (no HCP match or no scores)`);
  console.log(`═══════════════════════════════════════════════`);

  // Verification
  const total = await prisma.hcpDiseaseAreaScore.count({
    where: { diseaseAreaId: da.id, isCurrent: true },
  });
  const withPubs = await prisma.hcpDiseaseAreaScore.count({
    where: { diseaseAreaId: da.id, isCurrent: true, scorePublications: { not: null } },
  });
  const withSurvey = await prisma.hcpDiseaseAreaScore.count({
    where: { diseaseAreaId: da.id, isCurrent: true, scoreSurvey: { not: null } },
  });
  console.log(`\n  Verification:`);
  console.log(`    Total Dry Eye scores: ${total}`);
  console.log(`    With segment scores: ${withPubs}`);
  console.log(`    With survey scores: ${withSurvey}`);
  console.log(`    With both: ${withSurvey} (these have full composite scores)`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
