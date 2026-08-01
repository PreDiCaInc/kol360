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

  // Delete campaigns and all related data. Every campaign is wrapped
  // in its own try/catch so a single stubborn row doesn't halt the
  // whole batch — that was the failure mode that leaked 483 stale
  // campaigns on test between 2026-06-03 and 2026-07-13 (see
  // "cleanup deletion order" note below).
  let deleted = 0;
  let failed = 0;
  for (const campaign of testCampaigns) {
    const campaignId = campaign.id;
    try {
      // Get all response IDs for this campaign
      const responses = await prisma.surveyResponse.findMany({
        where: { campaignId },
        select: { id: true },
      });
      const responseIds = responses.map((r) => r.id);

      // Deletion order matters because of FK constraints. Corrected on
      // 2026-07-13 after the script blew up on Payment_responseId_fkey
      // (Payment.responseId is @unique with default Restrict — you
      // must drop the Payment row BEFORE the SurveyResponse it points
      // at). Prior order (Payment last, per-campaignId) crashed on the
      // first campaign that reached the payment-processing phase.
      //
      // NominationBrandFlag (v1.17.78+) is not listed here — it
      // cascades from Nomination via onDelete: Cascade.
      // CampaignBrandOption (v1.17.78+) cascades from Campaign.

      // 1. Nominations (cascades to NominationBrandFlag).
      if (responseIds.length > 0) {
        await prisma.nomination.deleteMany({
          where: { responseId: { in: responseIds } },
        });
        // 2. SurveyResponseAnswers.
        await prisma.surveyResponseAnswer.deleteMany({
          where: { responseId: { in: responseIds } },
        });
      }

      // 3. Payments — MUST come before SurveyResponses. Payment has a
      //    @unique responseId FK with default Restrict semantics.
      await prisma.payment.deleteMany({ where: { campaignId } });

      // 4. SurveyResponses.
      await prisma.surveyResponse.deleteMany({ where: { campaignId } });

      // 5. CampaignHcps.
      await prisma.campaignHcp.deleteMany({ where: { campaignId } });

      // 6. SurveyQuestions.
      await prisma.surveyQuestion.deleteMany({ where: { campaignId } });

      // 7. Campaign (cascades to CampaignBrandOption).
      await prisma.campaign.delete({ where: { id: campaignId } });
      console.log(`  ✓ Deleted: ${campaign.name}`);
      deleted++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message.split('\n')[0] : String(err);
      console.warn(`  ✗ Failed: ${campaign.name} — ${message}`);
    }
  }

  console.log(`\n${failed === 0 ? '✅' : '⚠️'} Cleanup complete: ${deleted} deleted, ${failed} failed.`);
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
  // FK note: HcpDiseaseArea + CampaignHcp both reference Hcp via hcpId
  // — delete those first to avoid FK violation on the Hcp delete. The
  // per-campaign cleanup above only scopes CampaignHcp deletes to the
  // matched test campaigns; per-run/global test HCPs can still be
  // linked to non-test campaigns (e.g. long-lived stable fixtures), so
  // we also sweep by hcpId here.
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
    const campaignHcpResult = await prisma.campaignHcp.deleteMany({
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
      `(import.test + hcpda_ + static seed; ` +
      `${hcpDaResult.count} HcpDiseaseArea + ${campaignHcpResult.count} CampaignHcp rows)`
    );
  } catch (e) {
    // Do NOT swallow — leave a distinct ✗ marker so the caller (and
    // the trailing "✅ All E2E test data cleaned up successfully!"
    // line) don't misrepresent partial success. Matches the per-
    // campaign "✗ Failed: …" style above.
    //
    // v2.0.5 — pteam flagged (2026-07-31) that this catch was
    // occasionally emitting `✗ Failed: per-run test HCP cleanup — `
    // with an EMPTY error message on prod cutovers (5.0.2 / 5.0.3 /
    // 5.0.4), followed by the trailing ✅ success line. Cosmetic
    // only (exit 0, no data impact) but misleading. Root cause is
    // an Error with no readable top line (e.g. Prisma multi-line
    // messages whose first line is blank after split('\n')[0], or a
    // rethrown non-Error that stringified empty). Fix: fall back to
    // the error's class name when the message is empty so future
    // occurrences carry a diagnostic hint, and suppress the noisy
    // ✗ line entirely when we have literally nothing to say. See
    // docs/findings/cleanup-test-data-cosmetic-failed-line-
    // 2026-07-31.md.
    let message = '';
    if (e instanceof Error) {
      message = (e.message || '').split('\n')[0].trim();
      if (!message) message = e.name || e.constructor?.name || '';
    } else {
      message = String(e).trim();
    }
    if (!message) {
      console.log('  - No per-run test HCPs to clean up (no rows matched)');
    } else {
      console.warn(`  ✗ Failed: per-run test HCP cleanup — ${message}`);
    }
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
