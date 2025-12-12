import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create Disease Areas
  const diseaseAreas = await Promise.all([
    prisma.diseaseArea.upsert({
      where: { code: 'RETINA' },
      update: {},
      create: {
        code: 'RETINA',
        name: 'Retina',
        therapeuticArea: 'Ophthalmology',
      },
    }),
    prisma.diseaseArea.upsert({
      where: { code: 'DRY_EYE' },
      update: {},
      create: {
        code: 'DRY_EYE',
        name: 'Dry Eye',
        therapeuticArea: 'Ophthalmology',
      },
    }),
    prisma.diseaseArea.upsert({
      where: { code: 'GLAUCOMA' },
      update: {},
      create: {
        code: 'GLAUCOMA',
        name: 'Glaucoma',
        therapeuticArea: 'Ophthalmology',
      },
    }),
    prisma.diseaseArea.upsert({
      where: { code: 'CORNEA' },
      update: {},
      create: {
        code: 'CORNEA',
        name: 'Cornea',
        therapeuticArea: 'Ophthalmology',
      },
    }),
  ]);

  console.log(`Created ${diseaseAreas.length} disease areas`);

  // Create sample client
  const client = await prisma.client.upsert({
    where: { id: 'sample-client-1' },
    update: {},
    create: {
      id: 'sample-client-1',
      name: 'Sample Pharma Corp',
      type: 'FULL',
      primaryColor: '#0066CC',
    },
  });

  console.log(`Created sample client: ${client.name}`);

  // Create core survey sections
  const sections = await Promise.all([
    prisma.sectionTemplate.upsert({
      where: { id: 'section-demographics' },
      update: {},
      create: {
        id: 'section-demographics',
        name: 'Demographics',
        description: 'Basic physician information',
        isCore: true,
        sortOrder: 1,
      },
    }),
    prisma.sectionTemplate.upsert({
      where: { id: 'section-national-advisors' },
      update: {},
      create: {
        id: 'section-national-advisors',
        name: 'National Advisors',
        description: 'National KOL nominations',
        isCore: true,
        sortOrder: 2,
      },
    }),
    prisma.sectionTemplate.upsert({
      where: { id: 'section-local-advisors' },
      update: {},
      create: {
        id: 'section-local-advisors',
        name: 'Local Advisors',
        description: 'Regional KOL nominations',
        isCore: true,
        sortOrder: 3,
      },
    }),
    prisma.sectionTemplate.upsert({
      where: { id: 'section-rising-stars' },
      update: {},
      create: {
        id: 'section-rising-stars',
        name: 'Rising Stars',
        description: 'Emerging KOL nominations',
        isCore: true,
        sortOrder: 4,
      },
    }),
  ]);

  console.log(`Created ${sections.length} core sections`);

  // Create sample questions
  const questions = await Promise.all([
    prisma.question.upsert({
      where: { id: 'q-specialty' },
      update: {},
      create: {
        id: 'q-specialty',
        text: 'What is your primary specialty?',
        type: 'DROPDOWN',
        category: 'Demographics',
        isRequired: true,
        options: ['Retina', 'Cornea', 'Glaucoma', 'Comprehensive', 'Other'],
        tags: ['demographics', 'core'],
      },
    }),
    prisma.question.upsert({
      where: { id: 'q-years-practice' },
      update: {},
      create: {
        id: 'q-years-practice',
        text: 'How many years have you been in practice?',
        type: 'NUMBER',
        category: 'Demographics',
        isRequired: true,
        tags: ['demographics', 'core'],
      },
    }),
    prisma.question.upsert({
      where: { id: 'q-national-advisors' },
      update: {},
      create: {
        id: 'q-national-advisors',
        text: 'Who would you consider to be national thought leaders in this disease area?',
        type: 'MULTI_TEXT',
        category: 'Nominations',
        isRequired: true,
        tags: ['nominations', 'national', 'core'],
      },
    }),
    prisma.question.upsert({
      where: { id: 'q-local-advisors' },
      update: {},
      create: {
        id: 'q-local-advisors',
        text: 'Who would you consider to be regional thought leaders in your area?',
        type: 'MULTI_TEXT',
        category: 'Nominations',
        isRequired: true,
        tags: ['nominations', 'local', 'core'],
      },
    }),
    prisma.question.upsert({
      where: { id: 'q-rising-stars' },
      update: {},
      create: {
        id: 'q-rising-stars',
        text: 'Who do you see as emerging thought leaders in this space?',
        type: 'MULTI_TEXT',
        category: 'Nominations',
        isRequired: false,
        tags: ['nominations', 'rising-stars', 'core'],
      },
    }),
  ]);

  console.log(`Created ${questions.length} sample questions`);

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
