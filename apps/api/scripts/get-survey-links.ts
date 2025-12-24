import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const campaignId = process.argv[2];

  const whereClause = campaignId ? { campaignId } : {};

  const hcps = await prisma.campaignHcp.findMany({
    where: whereClause,
    include: {
      hcp: { select: { firstName: true, lastName: true, email: true } },
      campaign: { select: { name: true, status: true } },
    },
    orderBy: [{ campaign: { name: 'asc' } }, { createdAt: 'desc' }],
  });

  if (hcps.length === 0) {
    console.log('No campaign HCPs found.');
    if (campaignId) {
      console.log(`Campaign ID provided: ${campaignId}`);
    }
    await prisma.$disconnect();
    return;
  }

  console.log('');
  console.log('Survey Links');
  console.log('=============');
  console.log('');

  let currentCampaign = '';
  for (const h of hcps) {
    if (h.campaign.name !== currentCampaign) {
      currentCampaign = h.campaign.name;
      console.log(`📋 ${currentCampaign} (${h.campaign.status})`);
      console.log('-'.repeat(50));
    }
    const emailSent = h.emailSentAt ? '✅' : '⏳';
    console.log(`  ${emailSent} ${h.hcp.firstName} ${h.hcp.lastName} (${h.hcp.email || 'no email'})`);
    console.log(`     http://localhost:3000/survey/${h.surveyToken}`);
  }

  console.log('');
  console.log('Legend: ✅ = invitation sent, ⏳ = pending');
  console.log('');

  await prisma.$disconnect();
}

main().catch(console.error);
