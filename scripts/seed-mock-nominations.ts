/**
 * Seed mock nomination data for testing Insights Leader Rankings
 *
 * This creates nominations for all 6 nomination types so the Leader Rankings
 * tab shows data without needing to go through the full survey workflow.
 *
 * Run with: npx tsx scripts/seed-mock-nominations.ts
 */

import { PrismaClient, NominationType } from '@prisma/client';

const prisma = new PrismaClient();

const DRY_EYE_DISEASE_AREA_ID = 'cmj6ice860000wspd6wotdndy';

// All nomination types we want to seed
const NOMINATION_TYPES: NominationType[] = [
  'DISCUSSION_LEADERS',
  'REFERRAL_LEADERS',
  'ADVICE_LEADERS',
  'NATIONAL_LEADER',
  'RISING_STAR',
  'SOCIAL_LEADER',
];

async function main() {
  console.log('🌱 Seeding mock nomination data for Insights testing...\n');

  // 1. Find a campaign in Dry Eye disease area
  const campaign = await prisma.campaign.findFirst({
    where: { diseaseAreaId: DRY_EYE_DISEASE_AREA_ID },
    include: { surveyQuestions: true },
  });

  if (!campaign) {
    console.log('❌ No campaign found in Dry Eye disease area');
    return;
  }
  console.log(`📋 Using campaign: ${campaign.name} (${campaign.id})`);

  // 2. Find existing survey responses to attach nominations to
  const responses = await prisma.surveyResponse.findMany({
    where: { campaignId: campaign.id, status: 'COMPLETED' },
    include: { respondentHcp: true },
    take: 20,
  });

  if (responses.length === 0) {
    console.log('❌ No completed survey responses found. Creating a mock one...');

    // Find an HCP to be the respondent
    const hcp = await prisma.hcp.findFirst({
      where: {
        diseaseAreaScores: {
          some: { diseaseAreaId: DRY_EYE_DISEASE_AREA_ID }
        }
      }
    });

    if (!hcp) {
      console.log('❌ No HCPs found with disease area scores');
      return;
    }

    // Create a mock survey response
    const mockResponse = await prisma.surveyResponse.create({
      data: {
        campaignId: campaign.id,
        respondentHcpId: hcp.id,
        surveyToken: `mock-token-${Date.now()}`,
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });
    responses.push({ ...mockResponse, respondentHcp: hcp });
    console.log(`✅ Created mock survey response`);
  }

  console.log(`📝 Found ${responses.length} survey responses to use\n`);

  // 3. Get HCPs with scores to nominate
  const nominees = await prisma.hcpDiseaseAreaScore.findMany({
    where: {
      diseaseAreaId: DRY_EYE_DISEASE_AREA_ID,
      isCurrent: true,
      compositeScore: { not: null },
    },
    include: { hcp: true },
    orderBy: { compositeScore: 'desc' },
    take: 50,
  });

  if (nominees.length < 10) {
    console.log('❌ Not enough HCPs with scores to create meaningful nominations');
    return;
  }

  console.log(`👥 Found ${nominees.length} HCPs with scores to nominate\n`);

  // 4. Ensure we have SurveyQuestions for all nomination types
  for (const nomType of NOMINATION_TYPES) {
    let surveyQuestion = await prisma.surveyQuestion.findFirst({
      where: {
        campaignId: campaign.id,
        nominationType: nomType,
      },
    });

    if (!surveyQuestion) {
      // Find a base question to link to, or create one
      let baseQuestion = await prisma.question.findFirst({
        where: { nominationType: nomType },
      });

      if (!baseQuestion) {
        // Create a base question
        baseQuestion = await prisma.question.create({
          data: {
            text: `Who are the ${nomType.toLowerCase().replace('_', ' ')} in your field?`,
            type: 'MULTI_TEXT', // Nomination questions use MULTI_TEXT type
            nominationType: nomType,
          },
        });
        console.log(`📝 Created base Question for ${nomType}`);
      }

      // Create SurveyQuestion
      surveyQuestion = await prisma.surveyQuestion.create({
        data: {
          campaignId: campaign.id,
          questionId: baseQuestion.id,
          sectionName: 'Nominations',
          sortOrder: NOMINATION_TYPES.indexOf(nomType),
          isRequired: false,
          questionTextSnapshot: baseQuestion.text,
          nominationType: nomType,
        },
      });
      console.log(`📝 Created SurveyQuestion for ${nomType}`);
    }
  }

  // 5. Create nominations
  let nominationsCreated = 0;

  for (const nomType of NOMINATION_TYPES) {
    const surveyQuestion = await prisma.surveyQuestion.findFirst({
      where: {
        campaignId: campaign.id,
        nominationType: nomType,
      },
    });

    if (!surveyQuestion) {
      console.log(`⚠️ Could not find SurveyQuestion for ${nomType}`);
      continue;
    }

    // Create 5-15 nominations per type from different respondents
    const numNominations = Math.min(responses.length * 2, 15);

    for (let i = 0; i < numNominations; i++) {
      const response = responses[i % responses.length];
      const nominee = nominees[i % nominees.length];

      // Skip if nominator is the same as nominee
      if (response.respondentHcpId === nominee.hcp.id) continue;

      // Check if nomination already exists
      const existing = await prisma.nomination.findFirst({
        where: {
          responseId: response.id,
          questionId: surveyQuestion.id,
          matchedHcpId: nominee.hcp.id,
        },
      });

      if (existing) continue;

      await prisma.nomination.create({
        data: {
          responseId: response.id,
          questionId: surveyQuestion.id,
          nominatorHcpId: response.respondentHcpId,
          rawNameEntered: `${nominee.hcp.firstName} ${nominee.hcp.lastName}`,
          matchedHcpId: nominee.hcp.id,
          matchStatus: 'MATCHED',
          matchConfidence: 100,
          matchType: 'SEED_DATA',
          matchedAt: new Date(),
        },
      });
      nominationsCreated++;
    }

    console.log(`✅ ${nomType}: Created nominations`);
  }

  console.log(`\n🎉 Done! Created ${nominationsCreated} mock nominations.`);

  // 6. Summary
  const summary = await prisma.nomination.groupBy({
    by: ['matchStatus'],
    where: {
      question: {
        campaign: { diseaseAreaId: DRY_EYE_DISEASE_AREA_ID }
      }
    },
    _count: { id: true },
  });

  console.log('\n📊 Nomination Summary:');
  summary.forEach(s => {
    console.log(`  ${s.matchStatus}: ${s._count.id}`);
  });

  // Check by nomination type
  const byType = await prisma.$queryRaw<Array<{ nominationType: string; count: bigint }>>`
    SELECT sq."nominationType", COUNT(n.id) as count
    FROM "Nomination" n
    JOIN "SurveyQuestion" sq ON n."questionId" = sq.id
    JOIN "Campaign" c ON sq."campaignId" = c.id
    WHERE c."diseaseAreaId" = ${DRY_EYE_DISEASE_AREA_ID}
      AND n."matchStatus" IN ('MATCHED', 'NEW_HCP')
    GROUP BY sq."nominationType"
    ORDER BY count DESC
  `;

  console.log('\n📊 By Nomination Type:');
  byType.forEach(t => {
    console.log(`  ${t.nominationType}: ${t.count}`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);
