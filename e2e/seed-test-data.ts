/**
 * E2E Test Data Seed Script
 *
 * This script creates/updates the test client, disease area, and HCPs
 * needed for e2e testing. It's idempotent - safe to run multiple times.
 *
 * Usage:
 *   cd apps/api
 *   npx tsx ../../e2e/seed-test-data.ts
 *
 * Or via pnpm from root:
 *   pnpm --filter @kol360/api exec tsx ../../e2e/seed-test-data.ts
 *
 * Note: Requires DATABASE_URL to be set via environment or .env file
 */

import { PrismaClient } from '@prisma/client';
import { TEST_IDS, getTestHcps } from './fixtures';

const prisma = new PrismaClient();

async function seedTestData() {
  console.log('🧪 Seeding E2E test data...\n');

  // 1. Create or update test client
  console.log('Creating test client...');
  const client = await prisma.client.upsert({
    where: { id: TEST_IDS.CLIENT_ID },
    update: {
      name: TEST_IDS.CLIENT_NAME,
      isActive: true,
    },
    create: {
      id: TEST_IDS.CLIENT_ID,
      name: TEST_IDS.CLIENT_NAME,
      type: 'FULL',
      isActive: true,
      primaryColor: '#FF6600', // Orange to distinguish test client
    },
  });
  console.log(`  ✓ Client: ${client.name} (${client.id})`);

  // 2. Create or update test disease area
  console.log('Creating test disease area...');
  const diseaseArea = await prisma.diseaseArea.upsert({
    where: { id: TEST_IDS.DISEASE_AREA_ID },
    update: {
      name: TEST_IDS.DISEASE_AREA_NAME,
      therapeuticArea: TEST_IDS.THERAPEUTIC_AREA,
      isActive: true,
    },
    create: {
      id: TEST_IDS.DISEASE_AREA_ID,
      name: TEST_IDS.DISEASE_AREA_NAME,
      code: TEST_IDS.DISEASE_AREA_CODE,
      therapeuticArea: TEST_IDS.THERAPEUTIC_AREA,
      isActive: true,
    },
  });
  console.log(`  ✓ Disease Area: ${diseaseArea.name} (${diseaseArea.id})`);

  // 3. Create or update test specialty
  console.log('Creating test specialty...');
  const specialty = await prisma.specialty.upsert({
    where: { id: TEST_IDS.SPECIALTY_ID },
    update: {
      name: TEST_IDS.SPECIALTY_NAME,
      isActive: true,
    },
    create: {
      id: TEST_IDS.SPECIALTY_ID,
      name: TEST_IDS.SPECIALTY_NAME,
      code: TEST_IDS.SPECIALTY_CODE,
      category: 'E2E Test',
      isActive: true,
    },
  });
  console.log(`  ✓ Specialty: ${specialty.name} (${specialty.id})`);

  // 4. Create or update test HCPs
  console.log('Creating test HCPs...');
  const testHcps = getTestHcps();
  for (let i = 0; i < testHcps.length; i++) {
    const hcpData = testHcps[i];
    const beId = `E2E-TEST-${String(i + 1).padStart(6, '0')}`; // E2E-TEST-000001, etc.
    const hcp = await prisma.hcp.upsert({
      where: { id: hcpData.id },
      update: {
        firstName: hcpData.firstName,
        lastName: hcpData.lastName,
        email: hcpData.email,
        city: hcpData.city,
        state: hcpData.state,
      },
      create: {
        id: hcpData.id,
        beId: beId,
        npi: hcpData.npi,
        firstName: hcpData.firstName,
        lastName: hcpData.lastName,
        email: hcpData.email,
        // v1.15.32: Hcp.specialty is now constrained to a strict whitelist
        // (Optometry / Ophthalmology / NULL). The Specialty TABLE row name
        // (TEST_IDS.SPECIALTY_NAME = 'E2E Test Oncology Specialist') stays
        // unchanged — that's a separate entity linked via HcpSpecialty for
        // multi-specialty support. The Hcp.specialty STRING here just needs
        // to satisfy the whitelist; 'Optometry' is the canonical default.
        specialty: 'Optometry',
        city: hcpData.city,
        state: hcpData.state,
      },
    });
    console.log(`  ✓ HCP: ${hcp.firstName} ${hcp.lastName} (NPI: ${hcp.npi})`);

    // Link HCP to specialty
    await prisma.hcpSpecialty.upsert({
      where: {
        hcpId_specialtyId: {
          hcpId: hcp.id,
          specialtyId: TEST_IDS.SPECIALTY_ID,
        },
      },
      update: {},
      create: {
        hcpId: hcp.id,
        specialtyId: TEST_IDS.SPECIALTY_ID,
        isPrimary: true,
      },
    });

    // v1.17.42 — link HCP to the test disease area so the
    // influencer-type import tests can target this (HCP, DA) pair.
    await prisma.hcpDiseaseArea.upsert({
      where: {
        hcpId_diseaseAreaId: {
          hcpId: hcp.id,
          diseaseAreaId: TEST_IDS.DISEASE_AREA_ID,
        },
      },
      update: {},
      create: {
        hcpId: hcp.id,
        diseaseAreaId: TEST_IDS.DISEASE_AREA_ID,
        isPrimary: true,
      },
    });
  }

  // 5. Create test user (linked to test client)
  console.log('Creating test user...');
  const user = await prisma.user.upsert({
    where: { id: TEST_IDS.USER_ID },
    update: {
      email: TEST_IDS.USER_EMAIL,
      clientId: TEST_IDS.CLIENT_ID,
      status: 'ACTIVE',
    },
    create: {
      id: TEST_IDS.USER_ID,
      cognitoSub: TEST_IDS.USER_COGNITO_SUB,
      email: TEST_IDS.USER_EMAIL,
      firstName: 'E2E',
      lastName: 'TestUser',
      role: 'CLIENT_ADMIN',
      status: 'ACTIVE',
      clientId: TEST_IDS.CLIENT_ID,
    },
  });
  console.log(`  ✓ User: ${user.email} (${user.id})`);

  // 6. Create test questions
  console.log('Creating test questions...');
  const question1 = await prisma.question.upsert({
    where: { id: TEST_IDS.QUESTION_1_ID },
    update: {
      text: 'E2E Test Rating Question - How would you rate the overall quality?',
    },
    create: {
      id: TEST_IDS.QUESTION_1_ID,
      text: 'E2E Test Rating Question - How would you rate the overall quality?',
      type: 'RATING',
      isRequired: true,
      options: [],
      tags: ['e2e-test'],
      status: 'active',
    },
  });
  console.log(`  ✓ Question 1: Rating (${question1.id})`);

  const question2 = await prisma.question.upsert({
    where: { id: TEST_IDS.QUESTION_2_ID },
    update: {
      text: 'E2E Test Single Choice - Select your preference',
    },
    create: {
      id: TEST_IDS.QUESTION_2_ID,
      text: 'E2E Test Single Choice - Select your preference',
      type: 'SINGLE_CHOICE',
      isRequired: true,
      options: [
        { text: 'Option A', requiresText: false },
        { text: 'Option B', requiresText: false },
        { text: 'Option C', requiresText: false },
      ],
      tags: ['e2e-test'],
      status: 'active',
    },
  });
  console.log(`  ✓ Question 2: Single Choice (${question2.id})`);

  const question3 = await prisma.question.upsert({
    where: { id: TEST_IDS.QUESTION_3_ID },
    update: {
      text: 'E2E Test Text Question - Please provide additional comments',
    },
    create: {
      id: TEST_IDS.QUESTION_3_ID,
      text: 'E2E Test Text Question - Please provide additional comments',
      type: 'TEXT',
      isRequired: false,
      options: [],
      tags: ['e2e-test'],
      status: 'active',
    },
  });
  console.log(`  ✓ Question 3: Text (${question3.id})`);

  // 7. Create test section template
  console.log('Creating test section template...');
  const sectionTemplate = await prisma.sectionTemplate.upsert({
    where: { id: TEST_IDS.SECTION_TEMPLATE_ID },
    update: {
      name: TEST_IDS.SECTION_TEMPLATE_NAME,
    },
    create: {
      id: TEST_IDS.SECTION_TEMPLATE_ID,
      name: TEST_IDS.SECTION_TEMPLATE_NAME,
      description: 'E2E Test Section for automated testing',
      isCore: true,
      sortOrder: 0,
    },
  });
  console.log(`  ✓ Section Template: ${sectionTemplate.name} (${sectionTemplate.id})`);

  // 8. Link questions to section
  console.log('Linking questions to section...');
  const questionIds = [TEST_IDS.QUESTION_1_ID, TEST_IDS.QUESTION_2_ID, TEST_IDS.QUESTION_3_ID];
  for (let i = 0; i < questionIds.length; i++) {
    await prisma.sectionQuestion.upsert({
      where: {
        sectionId_questionId: {
          sectionId: TEST_IDS.SECTION_TEMPLATE_ID,
          questionId: questionIds[i],
        },
      },
      update: { sortOrder: i },
      create: {
        sectionId: TEST_IDS.SECTION_TEMPLATE_ID,
        questionId: questionIds[i],
        sortOrder: i,
      },
    });
  }
  console.log(`  ✓ Linked ${questionIds.length} questions to section`);

  // 9. Create test survey template
  console.log('Creating test survey template...');
  const surveyTemplate = await prisma.surveyTemplate.upsert({
    where: { id: TEST_IDS.SURVEY_TEMPLATE_ID },
    update: {
      name: TEST_IDS.SURVEY_TEMPLATE_NAME,
    },
    create: {
      id: TEST_IDS.SURVEY_TEMPLATE_ID,
      name: TEST_IDS.SURVEY_TEMPLATE_NAME,
      description: 'E2E Test Survey Template for automated testing',
    },
  });
  console.log(`  ✓ Survey Template: ${surveyTemplate.name} (${surveyTemplate.id})`);

  // 10. Link section to survey template
  console.log('Linking section to survey template...');
  await prisma.templateSection.upsert({
    where: {
      templateId_sectionId: {
        templateId: TEST_IDS.SURVEY_TEMPLATE_ID,
        sectionId: TEST_IDS.SECTION_TEMPLATE_ID,
      },
    },
    update: { sortOrder: 0 },
    create: {
      templateId: TEST_IDS.SURVEY_TEMPLATE_ID,
      sectionId: TEST_IDS.SECTION_TEMPLATE_ID,
      sortOrder: 0,
      isLocked: false,
    },
  });
  console.log(`  ✓ Linked section to survey template`);

  // ============================================================
  // 11. v1.17.41 — STABLE FIXTURE CAMPAIGN for read-side tests
  // ============================================================
  //
  // This block creates a fixed-ID ACTIVE campaign with a pre-seeded
  // nomination question, completed survey response, and 4 sample
  // nominations (2 MATCHED, 2 UNMATCHED) so nomination-matching +
  // ucpm-backfill tests can use a deterministic fixture instead of
  // scraping the volatile E2E_TEST_CAMPAIGN_* pool. The
  // E2E_STABLE_FIXTURE_ prefix is NOT touched by full-workflow or
  // the cleanup script — this fixture persists across runs.
  console.log('\nCreating STABLE fixture campaign for read-side tests...');
  const stable = TEST_IDS.STABLE_FIXTURE;

  const stableCampaign = await prisma.campaign.upsert({
    where: { id: stable.CAMPAIGN_ID },
    update: {
      name: stable.CAMPAIGN_NAME,
      status: 'ACTIVE',
      surveyTemplateId: TEST_IDS.SURVEY_TEMPLATE_ID,
    },
    create: {
      id: stable.CAMPAIGN_ID,
      name: stable.CAMPAIGN_NAME,
      clientId: TEST_IDS.CLIENT_ID,
      diseaseAreaId: TEST_IDS.DISEASE_AREA_ID,
      surveyTemplateId: TEST_IDS.SURVEY_TEMPLATE_ID,
      status: 'ACTIVE',
      description: 'STABLE fixture campaign — DO NOT DELETE. Powers read-side e2e.',
      createdBy: TEST_IDS.USER_ID,
    },
  });
  console.log(`  ✓ Stable Campaign: ${stableCampaign.name} (${stableCampaign.id})`);

  // Nomination-type Question + per-campaign SurveyQuestion
  const stableNominationQuestion = await prisma.question.upsert({
    where: { id: stable.NOMINATION_QUESTION_ID },
    update: { text: 'E2E Stable Nomination Question — who would you nominate?' },
    create: {
      id: stable.NOMINATION_QUESTION_ID,
      text: 'E2E Stable Nomination Question — who would you nominate?',
      // MULTI_TEXT is the QuestionType for nomination questions in
      // production (confirmed against test DB: all 99 in-use nomination
      // SurveyQuestions point to MULTI_TEXT Questions). The
      // SurveyQuestion.nominationType field is the discriminator.
      type: 'MULTI_TEXT',
      isRequired: false,
      options: [],
      tags: ['e2e-test', 'e2e-stable'],
      status: 'active',
    },
  });
  console.log(`  ✓ Stable Nomination Question: ${stableNominationQuestion.id}`);

  await prisma.surveyQuestion.upsert({
    where: { id: stable.SURVEY_QUESTION_ID },
    update: {
      questionTextSnapshot: stableNominationQuestion.text,
      sortOrder: 100,
    },
    create: {
      id: stable.SURVEY_QUESTION_ID,
      campaignId: stable.CAMPAIGN_ID,
      questionId: stableNominationQuestion.id,
      sectionName: 'E2E Stable Section',
      sortOrder: 100,
      isRequired: false,
      questionTextSnapshot: stableNominationQuestion.text,
      nominationType: 'NATIONAL_LEADER',
    },
  });

  // CampaignHcp assignments (all 3 test HCPs)
  for (const h of testHcps) {
    await prisma.campaignHcp.upsert({
      where: {
        campaignId_hcpId: { campaignId: stable.CAMPAIGN_ID, hcpId: h.id },
      },
      update: {},
      create: { campaignId: stable.CAMPAIGN_ID, hcpId: h.id },
    });
  }
  console.log(`  ✓ Assigned ${testHcps.length} stable HCPs to fixture campaign`);

  // HCP_1's completed survey response (the nominator)
  await prisma.surveyResponse.upsert({
    where: { id: stable.SURVEY_RESPONSE_ID },
    update: { status: 'COMPLETED' },
    create: {
      id: stable.SURVEY_RESPONSE_ID,
      campaignId: stable.CAMPAIGN_ID,
      respondentHcpId: TEST_IDS.HCP_1.id,
      surveyToken: stable.SURVEY_TOKEN,
      status: 'COMPLETED',
      startedAt: new Date('2026-01-01T00:00:00Z'),
      completedAt: new Date('2026-01-01T00:15:00Z'),
    },
  });

  // 2 MATCHED nominations: HCP_1 nominated HCP_2 + HCP_3
  await prisma.nomination.upsert({
    where: { id: stable.MATCHED_NOMINATION_1_ID },
    update: { matchStatus: 'MATCHED', matchedHcpId: TEST_IDS.HCP_2.id },
    create: {
      id: stable.MATCHED_NOMINATION_1_ID,
      responseId: stable.SURVEY_RESPONSE_ID,
      questionId: stable.SURVEY_QUESTION_ID,
      nominatorHcpId: TEST_IDS.HCP_1.id,
      rawNameEntered: 'E2E Test HCP2',
      matchedHcpId: TEST_IDS.HCP_2.id,
      matchStatus: 'MATCHED',
      matchedBy: TEST_IDS.USER_ID,
      matchedAt: new Date('2026-01-01T00:30:00Z'),
      matchConfidence: 100,
      matchType: 'manual',
    },
  });
  await prisma.nomination.upsert({
    where: { id: stable.MATCHED_NOMINATION_2_ID },
    update: { matchStatus: 'MATCHED', matchedHcpId: TEST_IDS.HCP_3.id },
    create: {
      id: stable.MATCHED_NOMINATION_2_ID,
      responseId: stable.SURVEY_RESPONSE_ID,
      questionId: stable.SURVEY_QUESTION_ID,
      nominatorHcpId: TEST_IDS.HCP_1.id,
      rawNameEntered: 'Carol TestSpecialist',
      matchedHcpId: TEST_IDS.HCP_3.id,
      matchStatus: 'MATCHED',
      matchedBy: TEST_IDS.USER_ID,
      matchedAt: new Date('2026-01-01T00:30:00Z'),
      matchConfidence: 95,
      matchType: 'manual',
    },
  });

  // 2 UNMATCHED nominations (rawNameEntered only; no matchedHcpId)
  await prisma.nomination.upsert({
    where: { id: stable.UNMATCHED_NOMINATION_1_ID },
    update: { matchStatus: 'UNMATCHED', matchedHcpId: null },
    create: {
      id: stable.UNMATCHED_NOMINATION_1_ID,
      responseId: stable.SURVEY_RESPONSE_ID,
      questionId: stable.SURVEY_QUESTION_ID,
      nominatorHcpId: TEST_IDS.HCP_1.id,
      rawNameEntered: 'Dr. Unknown Specialist',
      matchStatus: 'UNMATCHED',
    },
  });
  await prisma.nomination.upsert({
    where: { id: stable.UNMATCHED_NOMINATION_2_ID },
    update: { matchStatus: 'UNMATCHED', matchedHcpId: null },
    create: {
      id: stable.UNMATCHED_NOMINATION_2_ID,
      responseId: stable.SURVEY_RESPONSE_ID,
      questionId: stable.SURVEY_QUESTION_ID,
      nominatorHcpId: TEST_IDS.HCP_1.id,
      rawNameEntered: 'Dr. Anonymous Expert',
      matchStatus: 'UNMATCHED',
    },
  });
  console.log(`  ✓ Seeded 4 stable nominations (2 MATCHED + 2 UNMATCHED)`);

  // ============================================================
  // 12. v1.17.57 — STABLE PARITY fixture (DA + campaign + analysis)
  //     dedicated to insights-match-count parity test (and other
  //     read-side parity tests). Lives under its OWN disease area
  //     so full-workflow's createTestCampaign() pool (which targets
  //     TEST_IDS.DISEASE_AREA_ID) can't mutate it mid-suite.
  // ============================================================
  console.log('\nCreating STABLE PARITY fixture (isolated DA + campaign + analysis)...');

  const parityDa = await prisma.diseaseArea.upsert({
    where: { id: stable.PARITY_DISEASE_AREA_ID },
    update: {
      name: stable.PARITY_DISEASE_AREA_NAME,
      therapeuticArea: 'E2E Parity',
      isActive: true,
    },
    create: {
      id: stable.PARITY_DISEASE_AREA_ID,
      name: stable.PARITY_DISEASE_AREA_NAME,
      code: stable.PARITY_DISEASE_AREA_CODE,
      therapeuticArea: 'E2E Parity',
      isActive: true,
    },
  });
  console.log(`  ✓ Parity DA: ${parityDa.name} (${parityDa.id})`);

  const parityCampaign = await prisma.campaign.upsert({
    where: { id: stable.PARITY_CAMPAIGN_ID },
    update: {
      name: stable.PARITY_CAMPAIGN_NAME,
      status: 'ACTIVE',
    },
    create: {
      id: stable.PARITY_CAMPAIGN_ID,
      name: stable.PARITY_CAMPAIGN_NAME,
      clientId: TEST_IDS.CLIENT_ID,
      diseaseAreaId: stable.PARITY_DISEASE_AREA_ID,
      surveyTemplateId: TEST_IDS.SURVEY_TEMPLATE_ID,
      status: 'ACTIVE',
      description: 'STABLE parity fixture — DO NOT DELETE. Powers read-side parity tests.',
      createdBy: TEST_IDS.USER_ID,
    },
  });
  console.log(`  ✓ Parity Campaign: ${parityCampaign.name} (${parityCampaign.id})`);

  await prisma.surveyQuestion.upsert({
    where: { id: stable.PARITY_SURVEY_QUESTION_ID },
    update: { questionTextSnapshot: 'E2E Stable Parity Nomination Question' },
    create: {
      id: stable.PARITY_SURVEY_QUESTION_ID,
      campaignId: stable.PARITY_CAMPAIGN_ID,
      questionId: stable.NOMINATION_QUESTION_ID,
      sectionName: 'E2E Parity Section',
      sortOrder: 0,
      isRequired: false,
      questionTextSnapshot: 'E2E Stable Parity Nomination Question',
      nominationType: 'NATIONAL_LEADER',
    },
  });

  // 1 completed response from HCP_1 — gives the parity test something
  // to count (otherwise totalRespondents = 0 = match-count = 0, the
  // assertion holds trivially but the test isn't proving anything).
  await prisma.surveyResponse.upsert({
    where: { id: stable.PARITY_SURVEY_RESPONSE_ID },
    update: { status: 'COMPLETED' },
    create: {
      id: stable.PARITY_SURVEY_RESPONSE_ID,
      campaignId: stable.PARITY_CAMPAIGN_ID,
      respondentHcpId: TEST_IDS.HCP_1.id,
      surveyToken: stable.PARITY_SURVEY_TOKEN,
      status: 'COMPLETED',
      startedAt: new Date('2026-01-01T00:00:00Z'),
      completedAt: new Date('2026-01-01T00:15:00Z'),
    },
  });

  // KolAnalysis at (TEST_IDS.CLIENT_ID, PARITY_DA). Required so the
  // analysis-backed endpoints work for this fixture (resolveAnalysis).
  // Weights: 100% on survey (composite calc isn't material here, but
  // weightsJson is required).
  const parityAnalysis = await prisma.kolAnalysis.upsert({
    where: { id: stable.PARITY_ANALYSIS_ID },
    update: {},
    create: {
      id: stable.PARITY_ANALYSIS_ID,
      clientId: TEST_IDS.CLIENT_ID,
      diseaseAreaId: stable.PARITY_DISEASE_AREA_ID,
      name: 'E2E Stable Parity Analysis',
      weightsJson: {
        weightPublications: 0,
        weightClinicalTrials: 0,
        weightTradePubs: 0,
        weightOrgLeadership: 0,
        weightOrgAwards: 0,
        weightConference: 0,
        weightSocialMedia: 0,
        weightMediaPodcasts: 0,
        weightSurvey: 100,
      },
    },
  });

  await prisma.kolAnalysisCampaign.upsert({
    where: {
      analysisId_campaignId: {
        analysisId: stable.PARITY_ANALYSIS_ID,
        campaignId: stable.PARITY_CAMPAIGN_ID,
      },
    },
    update: { included: true },
    create: {
      analysisId: stable.PARITY_ANALYSIS_ID,
      campaignId: stable.PARITY_CAMPAIGN_ID,
      included: true,
    },
  });
  console.log(`  ✓ Parity Analysis: ${parityAnalysis.id} (with 1 included campaign)`);

  console.log('\n✅ E2E test data seeded successfully!');
  console.log('\nTest data summary:');
  console.log(`  - Client ID: ${TEST_IDS.CLIENT_ID}`);
  console.log(`  - Disease Area ID: ${TEST_IDS.DISEASE_AREA_ID}`);
  console.log(`  - HCP IDs: ${testHcps.map((h) => h.id).join(', ')}`);
  console.log(`  - User ID: ${TEST_IDS.USER_ID}`);
  console.log(`  - Survey Template ID: ${TEST_IDS.SURVEY_TEMPLATE_ID}`);
  console.log(`  - STABLE Campaign ID: ${stable.CAMPAIGN_ID}`);
  console.log(`  - STABLE Nominations: 2 MATCHED + 2 UNMATCHED`);
}

async function main() {
  try {
    await seedTestData();
  } catch (error) {
    console.error('❌ Error seeding test data:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
