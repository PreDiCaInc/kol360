/**
 * E2E Test Data Cleanup Script
 *
 * This script removes all test campaigns created during e2e tests.
 * It does NOT remove the base test data (client, disease area, HCPs)
 * as those are reused across test runs.
 *
 * Usage:
 *   cd apps/api
 *   npx tsx ../../e2e/cleanup-test-data.ts
 *
 * To remove ALL test data (including base fixtures):
 *   npx tsx ../../e2e/cleanup-test-data.ts --all
 */

import { PrismaClient } from '@prisma/client';
import { TEST_IDS } from './fixtures';

const prisma = new PrismaClient();

async function cleanupTestCampaigns() {
  console.log('🧹 Cleaning up E2E test campaigns...\n');

  // Find all test campaigns
  const testCampaigns = await prisma.campaign.findMany({
    where: {
      name: {
        startsWith: TEST_IDS.CAMPAIGN_PREFIX,
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (testCampaigns.length === 0) {
    console.log('No test campaigns found to clean up.');
    return;
  }

  console.log(`Found ${testCampaigns.length} test campaign(s) to clean up:`);
  for (const campaign of testCampaigns) {
    console.log(`  - ${campaign.name} (${campaign.id})`);
  }

  // Delete campaigns and all related data
  for (const campaign of testCampaigns) {
    const campaignId = campaign.id;

    // Get all response IDs for this campaign
    const responses = await prisma.surveyResponse.findMany({
      where: { campaignId },
      select: { id: true },
    });
    const responseIds = responses.map((r) => r.id);

    // Delete nominations (linked to responses)
    if (responseIds.length > 0) {
      await prisma.nomination.deleteMany({
        where: { responseId: { in: responseIds } },
      });

      // Delete survey response answers
      await prisma.surveyResponseAnswer.deleteMany({
        where: { responseId: { in: responseIds } },
      });
    }

    // Delete survey responses
    await prisma.surveyResponse.deleteMany({ where: { campaignId } });

    // Delete campaign HCPs
    await prisma.campaignHcp.deleteMany({ where: { campaignId } });

    // Delete survey questions
    await prisma.surveyQuestion.deleteMany({ where: { campaignId } });

    // CompositeScoreConfig deleteMany removed 2026-05-30 — model was
    // dropped in Phase 3 PR B (prod-rel-4.1 / v1.17.0). The line lived
    // here ~1.5 weeks crashing every cleanup run with
    // `Cannot read properties of undefined (reading 'deleteMany')`,
    // partially walking the per-campaign cascade and leaking 16 stale
    // campaigns on prod before pteam flagged the failure.
    // Weights now live on KolAnalysis.weightsJson; no per-campaign row
    // to clean up.

    // Delete payments
    await prisma.payment.deleteMany({ where: { campaignId } });

    // Finally delete the campaign
    await prisma.campaign.delete({ where: { id: campaignId } });
    console.log(`  ✓ Deleted: ${campaign.name}`);
  }

  console.log('\n✅ Test campaigns cleaned up successfully!');
}

async function cleanupAllTestData() {
  console.log('🧹 Cleaning up ALL E2E test data...\n');

  // 1. Delete test campaigns first
  await cleanupTestCampaigns();

  // 2. Delete test user
  console.log('\nRemoving test user...');
  try {
    await prisma.user.delete({
      where: { id: TEST_IDS.USER_ID },
    });
    console.log('  ✓ Deleted test user');
  } catch {
    console.log('  - Test user not found (already deleted)');
  }

  // 3. Delete test HCP specialties and HCPs
  console.log('\nRemoving test HCPs...');
  const testHcpIds = [TEST_IDS.HCP_1.id, TEST_IDS.HCP_2.id, TEST_IDS.HCP_3.id];
  for (const hcpId of testHcpIds) {
    try {
      await prisma.hcp.delete({
        where: { id: hcpId },
      });
      console.log(`  ✓ Deleted HCP: ${hcpId}`);
    } catch {
      console.log(`  - HCP ${hcpId} not found (already deleted)`);
    }
  }

  // Delete ALL per-run E2E-generated HCPs. Two known fixture shapes:
  //   - full-workflow.test.ts: `import.test.<npi>@e2etest.example.com`
  //     with NPI = `999${Date.now().slice(-7)}` to avoid beId collisions.
  //   - hcp-disease-areas.test.ts: `hcpda_<suffix>@e2etest.example.com`
  //     with firstName='E2EDaTest'.
  //
  // 2026-05-20 history: full-workflow leak caught — 20 'import.test' rows
  //   accumulated on prod over ~2 months, blocking the v1.17.0 strict-
  //   whitelist CHECK constraint. Cleanup added; only matched 'import.test'.
  // 2026-05-28 history: hcp-disease-areas leak caught — 12 'hcpda_'/E2EDaTest
  //   rows accumulated since 2026-05-20 (cleanup script only matched the
  //   one shape, missed the other). Pattern broadened here to ANY
  //   @e2etest.example.com email so future fixtures auto-clean without
  //   another script update.
  //
  // FK note: HcpDiseaseArea rows reference Hcp via hcpId — delete those
  // first to avoid FK violation on the Hcp delete.
  try {
    const hcpDaResult = await prisma.hcpDiseaseArea.deleteMany({
      where: {
        hcp: {
          OR: [
            { npi: TEST_IDS.HCP_IMPORT.npi },
            { email: { endsWith: '@e2etest.example.com' } },
            { firstName: 'E2EDaTest' },
          ],
        },
      },
    });
    const result = await prisma.hcp.deleteMany({
      where: {
        OR: [
          { npi: TEST_IDS.HCP_IMPORT.npi },
          { email: { endsWith: '@e2etest.example.com' } },
          { firstName: 'E2EDaTest' },
        ],
      },
    });
    console.log(
      `  ✓ Deleted ${result.count} per-run test HCP(s) ` +
      `(import.test + hcpda_ + static seed; ${hcpDaResult.count} HcpDiseaseArea rows)`
    );
  } catch (e) {
    console.log(`  - Per-run test HCP cleanup failed: ${e instanceof Error ? e.message : e}`);
  }

  // 4. Delete test specialty
  console.log('\nRemoving test specialty...');
  try {
    await prisma.specialty.delete({
      where: { id: TEST_IDS.SPECIALTY_ID },
    });
    console.log('  ✓ Deleted test specialty');
  } catch {
    console.log('  - Test specialty not found (already deleted)');
  }

  // 5. Delete test survey template (cascades to template sections)
  console.log('\nRemoving test survey template...');
  try {
    await prisma.surveyTemplate.delete({
      where: { id: TEST_IDS.SURVEY_TEMPLATE_ID },
    });
    console.log('  ✓ Deleted test survey template');
  } catch {
    console.log('  - Test survey template not found (already deleted)');
  }

  // 6. Delete test section template (cascades to section questions)
  console.log('\nRemoving test section template...');
  try {
    await prisma.sectionTemplate.delete({
      where: { id: TEST_IDS.SECTION_TEMPLATE_ID },
    });
    console.log('  ✓ Deleted test section template');
  } catch {
    console.log('  - Test section template not found (already deleted)');
  }

  // 7. Delete test questions
  console.log('\nRemoving test questions...');
  const testQuestionIds = [TEST_IDS.QUESTION_1_ID, TEST_IDS.QUESTION_2_ID, TEST_IDS.QUESTION_3_ID];
  for (const questionId of testQuestionIds) {
    try {
      await prisma.question.delete({
        where: { id: questionId },
      });
      console.log(`  ✓ Deleted question: ${questionId}`);
    } catch {
      console.log(`  - Question ${questionId} not found (already deleted)`);
    }
  }

  // 8. Delete test disease area
  console.log('\nRemoving test disease area...');
  try {
    await prisma.diseaseArea.delete({
      where: { id: TEST_IDS.DISEASE_AREA_ID },
    });
    console.log('  ✓ Deleted test disease area');
  } catch {
    console.log('  - Test disease area not found (already deleted)');
  }

  // 9. Delete test client
  console.log('\nRemoving test client...');
  try {
    await prisma.client.delete({
      where: { id: TEST_IDS.CLIENT_ID },
    });
    console.log('  ✓ Deleted test client');
  } catch {
    console.log('  - Test client not found (already deleted)');
  }

  console.log('\n✅ All E2E test data cleaned up successfully!');
}

async function main() {
  const removeAll = process.argv.includes('--all');

  try {
    if (removeAll) {
      await cleanupAllTestData();
    } else {
      await cleanupTestCampaigns();
    }
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
