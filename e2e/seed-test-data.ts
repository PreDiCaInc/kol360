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
  for (const hcpData of testHcps) {
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
        npi: hcpData.npi,
        firstName: hcpData.firstName,
        lastName: hcpData.lastName,
        email: hcpData.email,
        specialty: TEST_IDS.SPECIALTY_NAME,
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

  console.log('\n✅ E2E test data seeded successfully!');
  console.log('\nTest data summary:');
  console.log(`  - Client ID: ${TEST_IDS.CLIENT_ID}`);
  console.log(`  - Disease Area ID: ${TEST_IDS.DISEASE_AREA_ID}`);
  console.log(`  - HCP IDs: ${testHcps.map((h) => h.id).join(', ')}`);
  console.log(`  - User ID: ${TEST_IDS.USER_ID}`);
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
