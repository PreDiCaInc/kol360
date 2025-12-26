/**
 * Script to update existing HCPs with random specialties from the allowed list.
 * Run with: npx tsx scripts/update-hcp-specialties.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ALLOWED_SPECIALTIES = [
  'Ophthalmology',
  'Cornea',
  'Glaucoma',
  'Retina',
  'Dry Eye',
];

async function main() {
  console.log('Updating HCP specialties...');

  // Get all HCPs
  const hcps = await prisma.hcp.findMany({
    select: { id: true, firstName: true, lastName: true, specialty: true },
  });

  console.log(`Found ${hcps.length} HCPs to update`);

  let updated = 0;
  for (const hcp of hcps) {
    // Pick a random specialty
    const randomIndex = Math.floor(Math.random() * ALLOWED_SPECIALTIES.length);
    const newSpecialty = ALLOWED_SPECIALTIES[randomIndex];

    await prisma.hcp.update({
      where: { id: hcp.id },
      data: { specialty: newSpecialty },
    });

    console.log(`Updated ${hcp.firstName} ${hcp.lastName}: ${hcp.specialty || 'null'} -> ${newSpecialty}`);
    updated++;
  }

  console.log(`\nDone! Updated ${updated} HCPs with random specialties.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
