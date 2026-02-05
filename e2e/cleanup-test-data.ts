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

  // Delete campaigns (cascades to related data)
  for (const campaign of testCampaigns) {
    await prisma.campaign.delete({
      where: { id: campaign.id },
    });
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
