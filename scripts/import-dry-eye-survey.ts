/**
 * Import Dry Eye Sociometric Survey Data
 *
 * Imports external survey data from BioExec into KOL360:
 * - Creates Dry Eye disease area
 * - Imports 3,006 HCPs from weighted scores file (so nominated HCPs exist first)
 * - Creates survey questions matching the external survey structure
 * - Creates section + survey template
 * - Creates DE Pharma client + campaign
 * - Assigns 759 respondent HCPs to the campaign
 * - Creates completed survey responses + answers + nominations
 * - Runs auto-match on nominations
 * - Calculates survey scores and publishes
 *
 * Run with: npx tsx scripts/import-dry-eye-survey.ts
 *
 * Idempotent: Uses upserts where possible, safe to re-run.
 */

import { PrismaClient, NominationType, QuestionType } from '@prisma/client';
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

const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

// ──── File paths ────
const FILE1_PATH = join(__dirname, '../func-spec/1-BioExec Market Research - Source of Truth Dataset - Sociometric Survey.xlsx');
const FILE2_PATH = join(__dirname, '../func-spec/1-Weighted Scores for Haranath - NOT Final Scores.xlsx');

// ──── Nomination column mapping ────
// File 1 columns: T-X = Discussion Leaders (5), Y-AD = Referral Leaders (6),
// AE-AI = Advice Leaders (5), AJ-AN = National Leaders (5),
// AO-AS = Rising Star (5), AT-AX = Social (5)
const NOMINATION_COLUMNS: Array<{
  type: NominationType;
  label: string;
  questionText: string;
  startCol: number; // 1-based column index
  count: number;
}> = [
  {
    type: 'DISCUSSION_LEADERS',
    label: 'Discussion Leaders',
    questionText: 'Who are the top Discussion Leaders in Dry Eye that you look to for guidance and clinical insights?',
    startCol: 20, // T
    count: 5,
  },
  {
    type: 'REFERRAL_LEADERS',
    label: 'Referral Leaders',
    questionText: 'Who are the top Referral Leaders in Dry Eye that you trust and refer patients to?',
    startCol: 25, // Y
    count: 6,
  },
  {
    type: 'ADVICE_LEADERS',
    label: 'Advice Leaders',
    questionText: 'Who are the top Advice Leaders in Dry Eye that you consult for clinical advice?',
    startCol: 31, // AE
    count: 5,
  },
  {
    type: 'NATIONAL_LEADER',
    label: 'National Leaders',
    questionText: 'Who are the top National Leaders in Dry Eye that you consider Key Opinion Leaders?',
    startCol: 36, // AJ
    count: 5,
  },
  {
    type: 'RISING_STAR',
    label: 'Rising Stars',
    questionText: 'Who are the Rising Stars in Dry Eye that you see as emerging Key Opinion Leaders?',
    startCol: 41, // AO
    count: 5,
  },
  {
    type: 'SOCIAL_LEADER',
    label: 'Social Media Leaders',
    questionText: 'Who are the top Social Media Leaders in Dry Eye that influence digital conversations?',
    startCol: 46, // AT
    count: 5,
  },
];

// Practice setting options (cols G-N in File 1)
const PRACTICE_SETTINGS = [
  'Solo Provider Optometry Practice',
  'Solo Provider Ophthalmology Practice',
  'Multiple-provider Optometry Practice',
  'Multiple-provider Ophthalmology Practice',
  'Combination MD/OD Practice',
  'Corporate OD practice',
  'Hospital',
  'Academic/Teaching Institution',
];

// ──── Helper functions ────

function cellToString(cell: ExcelJS.Cell): string {
  // Use .text which always returns a string representation
  const text = cell.text;
  return text ? text.trim() : '';
}

// ──── Step 1: Create Dry Eye disease area ────

async function createDiseaseArea(): Promise<string> {
  console.log('\n── Step 1: Create Dry Eye disease area ──');
  const da = await prisma.diseaseArea.upsert({
    where: { code: 'DRY_EYE' },
    create: {
      name: 'Dry Eye',
      code: 'DRY_EYE',
      therapeuticArea: 'Ophthalmology',
    },
    update: {},
  });
  console.log(`  Disease area: ${da.name} (${da.id})`);
  return da.id;
}

// ──── Step 2: Import HCPs from File 2 (3,006 HCPs) ────

async function importHcpsFromFile2(): Promise<Map<string, string>> {
  console.log('\n── Step 2: Import HCPs from weighted scores file ──');
  const npiToHcpId = new Map<string, string>();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE2_PATH);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('No worksheet found in File 2');

  const totalRows = sheet.rowCount - 1; // minus header
  console.log(`  Found ${totalRows} rows in File 2`);

  let created = 0;
  let existing = 0;

  for (let rowIdx = 2; rowIdx <= sheet.rowCount; rowIdx++) {
    const row = sheet.getRow(rowIdx);
    const npi = cellToString(row.getCell(1)); // Column A: NPI
    const lastName = cellToString(row.getCell(2)); // Column B: Last
    const firstName = cellToString(row.getCell(3)); // Column C: First
    const degree = cellToString(row.getCell(4)); // Column D: Degree

    if (!npi || !lastName || !firstName) continue;

    // Map degree to specialty
    let specialty: string | null = null;
    if (degree === 'OD') specialty = 'Optometrist';
    else if (degree === 'MD') specialty = 'Ophthalmologist';
    else if (degree) specialty = degree;

    // Upsert by NPI
    const existingHcp = await prisma.hcp.findUnique({ where: { npi } });
    if (existingHcp) {
      npiToHcpId.set(npi, existingHcp.id);
      existing++;
    } else {
      // Use createWithAtomicBeId pattern
      const hcp = await prisma.$transaction(
        async (tx) => {
          const lastHcp = await tx.hcp.findFirst({
            where: { beId: { startsWith: 'BE-' } },
            orderBy: { beId: 'desc' },
            select: { beId: true },
          });

          let nextNum = 1;
          if (lastHcp?.beId) {
            const match = lastHcp.beId.match(/^BE-(\d+)$/);
            if (match) nextNum = parseInt(match[1], 10) + 1;
          }

          const newBeId = 'BE-' + String(nextNum).padStart(6, '0');
          return tx.hcp.create({
            data: {
              beId: newBeId,
              npi,
              firstName,
              lastName,
              specialty,
              isNominated: true, // These are nominated HCPs
              createdBy: 'import-dry-eye-survey',
            },
          });
        },
        { isolationLevel: 'Serializable' }
      );
      npiToHcpId.set(npi, hcp.id);
      created++;
    }

    if ((created + existing) % 500 === 0) {
      console.log(`  Processed ${created + existing}/${totalRows} (${created} created, ${existing} existing)`);
    }
  }

  console.log(`  Done: ${created} created, ${existing} already existed`);
  return npiToHcpId;
}

// ──── Step 3: Create survey questions ────

interface QuestionRecord {
  id: string;
  type: QuestionType;
  nominationType: NominationType | null;
  tag: string;
}

async function createQuestions(): Promise<QuestionRecord[]> {
  console.log('\n── Step 3: Create survey questions ──');
  const questions: QuestionRecord[] = [];

  // Define demographic questions
  const demoQuestions: Array<{
    tag: string;
    text: string;
    type: QuestionType;
    options?: unknown;
  }> = [
    { tag: 'years_practice', text: 'Please indicate the number of years you have been in practice.', type: 'NUMBER' },
    { tag: 'board_certified', text: 'Are you board-certified or board eligible?', type: 'SINGLE_CHOICE', options: ['Yes', 'No'] },
    { tag: 'practice_setting', text: 'Which of the following best describes your practice setting? (Select all that apply)', type: 'MULTI_CHOICE', options: PRACTICE_SETTINGS },
    { tag: 'core_focus', text: 'What best describes the core focus of your practice?', type: 'DROPDOWN' },
    { tag: 'monthly_patients', text: 'In an average month, approximately how many patients do you see?', type: 'NUMBER' },
    { tag: 'monthly_ded_patients', text: 'In an average month, how many patients do you see for Dry Eye Disease?', type: 'NUMBER' },
  ];

  for (const q of demoQuestions) {
    const existing = await prisma.question.findFirst({
      where: { tags: { has: `import:dry-eye:${q.tag}` } },
    });

    if (existing) {
      questions.push({ id: existing.id, type: existing.type, nominationType: null, tag: q.tag });
      console.log(`  [existing] ${q.tag}: ${existing.id}`);
    } else {
      const created = await prisma.question.create({
        data: {
          text: q.text,
          type: q.type,
          category: 'Demographics',
          isRequired: true,
          options: q.options ? q.options : undefined,
          tags: [`import:dry-eye:${q.tag}`],
        },
      });
      questions.push({ id: created.id, type: created.type, nominationType: null, tag: q.tag });
      console.log(`  [created] ${q.tag}: ${created.id}`);
    }
  }

  // Create nomination questions
  for (const nom of NOMINATION_COLUMNS) {
    const tag = `import:dry-eye:nom:${nom.type}`;
    const existing = await prisma.question.findFirst({
      where: { tags: { has: tag } },
    });

    if (existing) {
      questions.push({ id: existing.id, type: existing.type, nominationType: nom.type, tag: `nom:${nom.type}` });
      console.log(`  [existing] ${nom.type}: ${existing.id}`);
    } else {
      const created = await prisma.question.create({
        data: {
          text: nom.questionText,
          type: 'MULTI_TEXT',
          category: 'Nominations',
          isRequired: false,
          nominationType: nom.type,
          minEntries: 1,
          defaultEntries: nom.count,
          tags: [tag],
        },
      });
      questions.push({ id: created.id, type: created.type, nominationType: nom.type, tag: `nom:${nom.type}` });
      console.log(`  [created] ${nom.type}: ${created.id}`);
    }
  }

  console.log(`  Total questions: ${questions.length}`);
  return questions;
}

// ──── Step 4: Create section + survey template ────

async function createTemplates(questions: QuestionRecord[]): Promise<string> {
  console.log('\n── Step 4: Create section + survey template ──');

  // Create or find section template
  let section = await prisma.sectionTemplate.findFirst({
    where: { name: 'Dry Eye Sociometric Survey Section' },
  });
  if (!section) {
    section = await prisma.sectionTemplate.create({
      data: { name: 'Dry Eye Sociometric Survey Section', description: 'External DED sociometric survey' },
    });
    console.log(`  Created section template: ${section.id}`);
  } else {
    console.log(`  Existing section template: ${section.id}`);
  }

  // Link questions to section
  for (let i = 0; i < questions.length; i++) {
    await prisma.sectionQuestion.upsert({
      where: { sectionId_questionId: { sectionId: section.id, questionId: questions[i].id } },
      create: { sectionId: section.id, questionId: questions[i].id, sortOrder: i },
      update: { sortOrder: i },
    });
  }

  // Create or find survey template
  let template = await prisma.surveyTemplate.findFirst({
    where: { name: 'DED Sociometric Survey Template' },
  });
  if (!template) {
    template = await prisma.surveyTemplate.create({
      data: { name: 'DED Sociometric Survey Template', description: 'Template for Dry Eye Disease external sociometric survey import' },
    });
    console.log(`  Created survey template: ${template.id}`);
  } else {
    console.log(`  Existing survey template: ${template.id}`);
  }

  // Link section to template
  await prisma.templateSection.upsert({
    where: { templateId_sectionId: { templateId: template.id, sectionId: section.id } },
    create: { templateId: template.id, sectionId: section.id, sortOrder: 0 },
    update: {},
  });

  return template.id;
}

// ──── Step 5: Create client + campaign ────

async function createCampaign(
  diseaseAreaId: string,
  surveyTemplateId: string
): Promise<string> {
  console.log('\n── Step 5: Create client + campaign ──');

  // Create or find DE Pharma client
  let client = await prisma.client.findFirst({ where: { name: 'DE Pharma' } });
  if (!client) {
    client = await prisma.client.create({
      data: { name: 'DE Pharma', primaryColor: '#0066CC' },
    });
    console.log(`  Created client: ${client.id}`);
  } else {
    console.log(`  Existing client: ${client.id}`);
  }

  // Create or find campaign
  let campaign = await prisma.campaign.findFirst({
    where: { name: 'DED Thought Leaders Survey', clientId: client.id },
  });
  if (!campaign) {
    campaign = await prisma.campaign.create({
      data: {
        clientId: client.id,
        diseaseAreaId,
        surveyTemplateId,
        name: 'DED Thought Leaders Survey',
        description: 'External Dry Eye sociometric survey imported from BioExec market research',
        status: 'DRAFT',
        createdBy: 'import-dry-eye-survey',
      },
    });
    console.log(`  Created campaign: ${campaign.id}`);

    // Create default CompositeScoreConfig
    await prisma.compositeScoreConfig.create({
      data: { campaignId: campaign.id },
    });
    console.log(`  Created composite score config`);
  } else {
    console.log(`  Existing campaign: ${campaign.id}`);
  }

  return campaign.id;
}

// ──── Step 6: Create SurveyQuestions for campaign + assign HCPs ────
// ──── Step 7: Create survey responses + answers + nominations ────

async function importSurveyData(
  campaignId: string,
  questions: QuestionRecord[],
  npiToHcpId: Map<string, string>
): Promise<void> {
  console.log('\n── Step 6-7: Import survey responses ──');

  // First, create SurveyQuestion records for the campaign
  const surveyQuestionMap = new Map<string, string>(); // questionId -> surveyQuestionId
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const existing = await prisma.surveyQuestion.findFirst({
      where: { campaignId, questionId: q.id },
    });
    if (existing) {
      surveyQuestionMap.set(q.id, existing.id);
    } else {
      const sq = await prisma.surveyQuestion.create({
        data: {
          campaignId,
          questionId: q.id,
          sectionName: 'Dry Eye Sociometric Survey Section',
          sortOrder: i,
          isRequired: true,
          questionTextSnapshot: (await prisma.question.findUnique({ where: { id: q.id } }))?.text || '',
          nominationType: q.nominationType,
        },
      });
      surveyQuestionMap.set(q.id, sq.id);
    }
  }
  console.log(`  Created ${surveyQuestionMap.size} survey questions for campaign`);

  // Read File 1
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE1_PATH);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('No worksheet found in File 1');

  const totalRows = sheet.rowCount - 1;
  console.log(`  Processing ${totalRows} respondent rows from File 1`);

  let respondentCount = 0;
  let nominationCount = 0;
  let skippedExisting = 0;

  for (let rowIdx = 2; rowIdx <= sheet.rowCount; rowIdx++) {
    const row = sheet.getRow(rowIdx);

    // Column B = NPI (col 2)
    const npi = cellToString(row.getCell(2));
    if (!npi) continue;

    // Find or create HCP for respondent
    let hcpId = npiToHcpId.get(npi);
    if (!hcpId) {
      // Respondent not in File 2; create from File 1 data
      const fullName = cellToString(row.getCell(1)); // Column A: name
      const nameParts = fullName.split(/\s+/);
      const firstName = nameParts[0] || 'Unknown';
      const lastName = nameParts.slice(1).join(' ') || 'Unknown';
      const role = cellToString(row.getCell(3)); // Column C: role

      let specialty: string | null = null;
      if (role.includes('Optometrist') || role.includes('OD')) specialty = 'Optometrist';
      else if (role.includes('Ophthalmologist') || role.includes('MD')) specialty = 'Ophthalmologist';

      const existingHcp = await prisma.hcp.findUnique({ where: { npi } });
      if (existingHcp) {
        hcpId = existingHcp.id;
      } else {
        const hcp = await prisma.$transaction(
          async (tx) => {
            const lastHcp = await tx.hcp.findFirst({
              where: { beId: { startsWith: 'BE-' } },
              orderBy: { beId: 'desc' },
              select: { beId: true },
            });
            let nextNum = 1;
            if (lastHcp?.beId) {
              const match = lastHcp.beId.match(/^BE-(\d+)$/);
              if (match) nextNum = parseInt(match[1], 10) + 1;
            }
            const newBeId = 'BE-' + String(nextNum).padStart(6, '0');
            return tx.hcp.create({
              data: {
                beId: newBeId,
                npi,
                firstName,
                lastName,
                specialty,
                isSurveyTaker: true,
                createdBy: 'import-dry-eye-survey',
              },
            });
          },
          { isolationLevel: 'Serializable' }
        );
        hcpId = hcp.id;
      }
      npiToHcpId.set(npi, hcpId);
    }

    // Mark as survey taker
    await prisma.hcp.update({
      where: { id: hcpId },
      data: { isSurveyTaker: true },
    });

    // Assign HCP to campaign (CampaignHcp)
    let campaignHcp = await prisma.campaignHcp.findFirst({
      where: { campaignId, hcpId },
    });
    if (!campaignHcp) {
      campaignHcp = await prisma.campaignHcp.create({
        data: { campaignId, hcpId },
      });
    }

    // Check if response already exists for this HCP
    const existingResponse = await prisma.surveyResponse.findUnique({
      where: { surveyToken: campaignHcp.surveyToken },
    });
    if (existingResponse) {
      skippedExisting++;
      continue;
    }

    // Create SurveyResponse
    const response = await prisma.surveyResponse.create({
      data: {
        campaignId,
        respondentHcpId: hcpId,
        surveyToken: campaignHcp.surveyToken,
        status: 'COMPLETED',
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    // ──── Create answers for demographic questions ────

    // Q1: Years in practice (col D = 4)
    const yearsInPractice = cellToString(row.getCell(4));
    if (yearsInPractice) {
      const qId = questions.find((q) => q.tag === 'years_practice')!.id;
      await prisma.surveyResponseAnswer.create({
        data: {
          responseId: response.id,
          questionId: surveyQuestionMap.get(qId)!,
          answerText: yearsInPractice,
        },
      });
    }

    // Q2: Board certified (col E = 5)
    const boardCertified = cellToString(row.getCell(5));
    if (boardCertified) {
      const qId = questions.find((q) => q.tag === 'board_certified')!.id;
      await prisma.surveyResponseAnswer.create({
        data: {
          responseId: response.id,
          questionId: surveyQuestionMap.get(qId)!,
          answerJson: { selected: boardCertified },
        },
      });
    }

    // Q3: Practice setting (cols G-N = 7-14, each cell has setting name if selected)
    const practiceSettings: string[] = [];
    for (let c = 0; c < PRACTICE_SETTINGS.length; c++) {
      const val = cellToString(row.getCell(7 + c));
      if (val) {
        practiceSettings.push(PRACTICE_SETTINGS[c]);
      }
    }
    // Col O (15) = "Other" free-text practice setting
    const otherSetting = cellToString(row.getCell(15));
    if (otherSetting) {
      practiceSettings.push(otherSetting);
    }
    if (practiceSettings.length > 0) {
      const qId = questions.find((q) => q.tag === 'practice_setting')!.id;
      await prisma.surveyResponseAnswer.create({
        data: {
          responseId: response.id,
          questionId: surveyQuestionMap.get(qId)!,
          answerJson: { selected: practiceSettings },
        },
      });
    }

    // Q4: Core focus (col P = 16)
    const coreFocus = cellToString(row.getCell(16));
    if (coreFocus) {
      const qId = questions.find((q) => q.tag === 'core_focus')!.id;
      await prisma.surveyResponseAnswer.create({
        data: {
          responseId: response.id,
          questionId: surveyQuestionMap.get(qId)!,
          answerText: coreFocus,
        },
      });
    }

    // Q5: Monthly patients (col R = 18)
    const monthlyPatients = cellToString(row.getCell(18));
    if (monthlyPatients) {
      const qId = questions.find((q) => q.tag === 'monthly_patients')!.id;
      await prisma.surveyResponseAnswer.create({
        data: {
          responseId: response.id,
          questionId: surveyQuestionMap.get(qId)!,
          answerText: monthlyPatients,
        },
      });
    }

    // Q6: Monthly DED patients (col S = 19)
    const monthlyDedPatients = cellToString(row.getCell(19));
    if (monthlyDedPatients) {
      const qId = questions.find((q) => q.tag === 'monthly_ded_patients')!.id;
      await prisma.surveyResponseAnswer.create({
        data: {
          responseId: response.id,
          questionId: surveyQuestionMap.get(qId)!,
          answerText: monthlyDedPatients,
        },
      });
    }

    // ──── Create answers + nominations for nomination questions ────

    for (const nom of NOMINATION_COLUMNS) {
      const names: string[] = [];
      for (let c = 0; c < nom.count; c++) {
        const name = cellToString(row.getCell(nom.startCol + c));
        if (name) names.push(name);
      }

      if (names.length > 0) {
        const qRecord = questions.find((q) => q.nominationType === nom.type)!;
        const surveyQuestionId = surveyQuestionMap.get(qRecord.id)!;

        // Create answer
        await prisma.surveyResponseAnswer.create({
          data: {
            responseId: response.id,
            questionId: surveyQuestionId,
            answerJson: names,
          },
        });

        // Create nominations
        for (const name of names) {
          await prisma.nomination.create({
            data: {
              responseId: response.id,
              questionId: surveyQuestionId,
              nominatorHcpId: hcpId,
              rawNameEntered: name,
              matchStatus: 'UNMATCHED',
            },
          });
          nominationCount++;
        }
      }
    }

    respondentCount++;
    if (respondentCount % 100 === 0) {
      console.log(`  Processed ${respondentCount}/${totalRows} respondents (${nominationCount} nominations)`);
    }
  }

  console.log(`  Done: ${respondentCount} respondents, ${nominationCount} nominations`);
  if (skippedExisting > 0) {
    console.log(`  Skipped ${skippedExisting} already-existing responses`);
  }
}

// ──── Step 8: Auto-match nominations ────

async function autoMatchNominations(campaignId: string): Promise<void> {
  console.log('\n── Step 8: Auto-match nominations ──');

  const unmatched = await prisma.nomination.findMany({
    where: {
      response: { campaignId },
      matchStatus: 'UNMATCHED',
    },
  });

  console.log(`  ${unmatched.length} unmatched nominations to process`);

  let matched = 0;
  let reviewed = 0;

  for (let i = 0; i < unmatched.length; i++) {
    const nomination = unmatched[i];

    // Parse name
    const nameParts = nomination.rawNameEntered
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);

    if (nameParts.length === 0) continue;

    // Search for matching HCPs
    const suggestions = await prisma.hcp.findMany({
      where: {
        OR: [
          ...nameParts.flatMap((part) => [
            { firstName: { contains: part, mode: 'insensitive' as const } },
            { lastName: { contains: part, mode: 'insensitive' as const } },
          ]),
          {
            aliases: {
              some: {
                aliasName: { contains: nomination.rawNameEntered, mode: 'insensitive' as const },
              },
            },
          },
        ],
      },
      include: { aliases: true },
      take: 10,
    });

    // Score each suggestion
    let bestMatch: { hcpId: string; score: number; matchType: string; isNameMatch: boolean } | null = null;

    for (const hcp of suggestions) {
      const fullName = `${hcp.firstName} ${hcp.lastName}`.toLowerCase();
      const reverseName = `${hcp.lastName} ${hcp.firstName}`.toLowerCase();
      const rawName = nomination.rawNameEntered.toLowerCase().trim();

      let score = 0;
      let matchType = 'partial';
      let isNameMatch = false;

      if (fullName === rawName || reverseName === rawName) {
        score = 100; matchType = 'exact'; isNameMatch = true;
      } else if (hcp.aliases.some((a) => a.aliasName.toLowerCase() === rawName)) {
        score = 100; matchType = 'alias'; isNameMatch = false;
      } else if (fullName.includes(rawName) || rawName.includes(fullName)) {
        score = 90; matchType = 'primary'; isNameMatch = true;
      } else if (
        hcp.lastName.toLowerCase() === rawName.split(' ').pop() &&
        nameParts.some((part) => hcp.firstName.toLowerCase().includes(part))
      ) {
        score = 85; matchType = 'primary'; isNameMatch = true;
      } else if (
        hcp.aliases.some(
          (a) => a.aliasName.toLowerCase().includes(rawName) || rawName.includes(a.aliasName.toLowerCase())
        )
      ) {
        score = 70; matchType = 'alias'; isNameMatch = false;
      } else {
        const matchCount = nameParts.filter(
          (part) => hcp.firstName.toLowerCase().includes(part) || hcp.lastName.toLowerCase().includes(part)
        ).length;
        score = Math.min(60, matchCount * 25);
        matchType = 'partial';
        isNameMatch = score >= 50;
      }

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { hcpId: hcp.id, score, matchType, isNameMatch };
      }
    }

    if (bestMatch && bestMatch.score >= 50) {
      // Determine match status
      const matchStatus = bestMatch.score >= 80 ? 'MATCHED' : 'REVIEW_NEEDED';

      await prisma.nomination.update({
        where: { id: nomination.id },
        data: {
          matchedHcpId: bestMatch.hcpId,
          matchStatus: matchStatus as 'MATCHED' | 'REVIEW_NEEDED',
          matchedBy: 'import-dry-eye-survey',
          matchedAt: new Date(),
          matchConfidence: bestMatch.score,
          matchType: bestMatch.matchType,
        },
      });

      // Mark the HCP as nominated
      await prisma.hcp.update({
        where: { id: bestMatch.hcpId },
        data: { isNominated: true },
      });

      // Add alias if not a direct name match
      if (!bestMatch.isNameMatch) {
        try {
          await prisma.hcpAlias.upsert({
            where: {
              hcpId_aliasName: { hcpId: bestMatch.hcpId, aliasName: nomination.rawNameEntered },
            },
            create: {
              hcpId: bestMatch.hcpId,
              aliasName: nomination.rawNameEntered,
              createdBy: 'import-dry-eye-survey',
            },
            update: {},
          });
        } catch {
          // Alias might conflict, skip
        }
      }

      if (matchStatus === 'MATCHED') matched++;
      else reviewed++;
    }

    if ((i + 1) % 500 === 0) {
      console.log(`  Processed ${i + 1}/${unmatched.length} (${matched} matched, ${reviewed} review needed)`);
    }
  }

  console.log(`  Done: ${matched} matched, ${reviewed} review needed, ${unmatched.length - matched - reviewed} unmatched`);
}

// ──── Step 9: Calculate scores + publish ────

async function calculateAndPublish(campaignId: string): Promise<void> {
  console.log('\n── Step 9: Calculate scores and publish ──');

  // Activate the campaign
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'ACTIVE' },
  });
  console.log('  Campaign status → ACTIVE');

  // Calculate survey scores (uses the same logic as ScoreCalculationService)
  console.log('  Calculating survey scores...');

  const surveyQuestions = await prisma.surveyQuestion.findMany({
    where: { campaignId, nominationType: { not: null } },
    select: { nominationType: true },
  });

  const nominationTypesInCampaign = [
    ...new Set(
      surveyQuestions.map((q) => q.nominationType).filter((t): t is NominationType => t !== null)
    ),
  ];

  // Get all matched nominations
  const nominations = await prisma.nomination.findMany({
    where: {
      response: { campaignId },
      matchStatus: { in: ['MATCHED', 'NEW_HCP'] },
      matchedHcpId: { not: null },
    },
    include: { question: { select: { nominationType: true } } },
  });

  console.log(`  ${nominations.length} matched nominations across ${nominationTypesInCampaign.length} nomination types`);

  // Group by HCP + type
  const hcpTypeCountMap = new Map<string, Map<NominationType, number>>();
  const maxCountPerType = new Map<NominationType, number>();

  for (const nom of nominations) {
    if (!nom.matchedHcpId || !nom.question.nominationType) continue;
    const nomType = nom.question.nominationType;

    if (!hcpTypeCountMap.has(nom.matchedHcpId)) {
      hcpTypeCountMap.set(nom.matchedHcpId, new Map());
    }
    const typeCounts = hcpTypeCountMap.get(nom.matchedHcpId)!;
    typeCounts.set(nomType, (typeCounts.get(nomType) || 0) + 1);

    const currentMax = maxCountPerType.get(nomType) || 0;
    const hcpCount = typeCounts.get(nomType) || 0;
    if (hcpCount > currentMax) maxCountPerType.set(nomType, hcpCount);
  }

  const NOMINATION_TYPE_FIELDS: Record<string, { score: string; count: string }> = {
    DISCUSSION_LEADERS: { score: 'scoreDiscussionLeaders', count: 'countDiscussionLeaders' },
    REFERRAL_LEADERS: { score: 'scoreReferralLeaders', count: 'countReferralLeaders' },
    ADVICE_LEADERS: { score: 'scoreAdviceLeaders', count: 'countAdviceLeaders' },
    NATIONAL_LEADER: { score: 'scoreNationalLeader', count: 'countNationalLeader' },
    RISING_STAR: { score: 'scoreRisingStar', count: 'countRisingStar' },
    SOCIAL_LEADER: { score: 'scoreSocialLeader', count: 'countSocialLeader' },
    REGIONAL_LEADER: { score: 'scoreRegionalLeader', count: 'countRegionalLeader' },
  };

  let scored = 0;
  for (const [hcpId, typeCounts] of hcpTypeCountMap) {
    const scoreData: Record<string, number | null> = {};
    const typeScores: number[] = [];
    let totalNominations = 0;

    for (const nomType of nominationTypesInCampaign) {
      const count = typeCounts.get(nomType) || 0;
      const maxCount = maxCountPerType.get(nomType) || 1;
      const fields = NOMINATION_TYPE_FIELDS[nomType];

      scoreData[fields.count] = count;
      totalNominations += count;

      if (count > 0) {
        const typeScore = (count / maxCount) * 100;
        scoreData[fields.score] = typeScore;
        typeScores.push(typeScore);
      } else {
        scoreData[fields.score] = null;
      }
    }

    const consolidatedScore =
      typeScores.length > 0 ? typeScores.reduce((sum, s) => sum + s, 0) / typeScores.length : null;

    await prisma.hcpCampaignScore.upsert({
      where: { hcpId_campaignId: { hcpId, campaignId } },
      create: {
        hcpId,
        campaignId,
        ...scoreData,
        scoreSurvey: consolidatedScore,
        nominationCount: totalNominations,
        calculatedAt: new Date(),
      },
      update: {
        ...scoreData,
        scoreSurvey: consolidatedScore,
        nominationCount: totalNominations,
        calculatedAt: new Date(),
      },
    });
    scored++;
  }

  console.log(`  Scored ${scored} HCPs`);

  // Close the campaign
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'CLOSED' },
  });
  console.log('  Campaign status → CLOSED');

  // Publish scores (create HcpDiseaseAreaScore records)
  console.log('  Publishing scores...');

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { compositeScoreConfig: true },
  });

  if (!campaign) throw new Error('Campaign not found');

  const weights = campaign.compositeScoreConfig || {
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

  const toNum = (val: unknown): number => (val ? Number(val) : 0);

  const campaignScores = await prisma.hcpCampaignScore.findMany({
    where: { campaignId },
  });

  let published = 0;
  for (const score of campaignScores) {
    const currentDaScore = await prisma.hcpDiseaseAreaScore.findFirst({
      where: { hcpId: score.hcpId, diseaseAreaId: campaign.diseaseAreaId, isCurrent: true },
    });

    const now = new Date();

    if (currentDaScore) {
      // SCD Type 2: Close current, create new
      await prisma.hcpDiseaseAreaScore.update({
        where: { id: currentDaScore.id },
        data: { isCurrent: false, effectiveTo: now },
      });

      const compositeScore =
        (toNum(currentDaScore.scorePublications) * toNum(weights.weightPublications)) / 100 +
        (toNum(currentDaScore.scoreClinicalTrials) * toNum(weights.weightClinicalTrials)) / 100 +
        (toNum(currentDaScore.scoreTradePubs) * toNum(weights.weightTradePubs)) / 100 +
        (toNum(currentDaScore.scoreOrgLeadership) * toNum(weights.weightOrgLeadership)) / 100 +
        (toNum(currentDaScore.scoreOrgAwards) * toNum(weights.weightOrgAwards)) / 100 +
        (toNum(currentDaScore.scoreConference) * toNum(weights.weightConference)) / 100 +
        (toNum(currentDaScore.scoreSocialMedia) * toNum(weights.weightSocialMedia)) / 100 +
        (toNum(currentDaScore.scoreMediaPodcasts) * toNum(weights.weightMediaPodcasts)) / 100 +
        (toNum(score.scoreSurvey) * toNum(weights.weightSurvey)) / 100;

      await prisma.hcpDiseaseAreaScore.create({
        data: {
          hcpId: score.hcpId,
          diseaseAreaId: campaign.diseaseAreaId,
          scorePublications: currentDaScore.scorePublications,
          scoreClinicalTrials: currentDaScore.scoreClinicalTrials,
          scoreTradePubs: currentDaScore.scoreTradePubs,
          scoreOrgLeadership: currentDaScore.scoreOrgLeadership,
          scoreOrgAwards: currentDaScore.scoreOrgAwards,
          scoreConference: currentDaScore.scoreConference,
          scoreSocialMedia: currentDaScore.scoreSocialMedia,
          scoreMediaPodcasts: currentDaScore.scoreMediaPodcasts,
          scoreSurvey: score.scoreSurvey,
          totalNominationCount: currentDaScore.totalNominationCount + score.nominationCount,
          campaignCount: currentDaScore.campaignCount + 1,
          compositeScore,
          isCurrent: true,
          effectiveFrom: now,
          lastCalculatedAt: now,
        },
      });
    } else {
      const compositeScore = (toNum(score.scoreSurvey) * toNum(weights.weightSurvey)) / 100;

      await prisma.hcpDiseaseAreaScore.create({
        data: {
          hcpId: score.hcpId,
          diseaseAreaId: campaign.diseaseAreaId,
          scoreSurvey: score.scoreSurvey,
          totalNominationCount: score.nominationCount,
          campaignCount: 1,
          compositeScore,
          isCurrent: true,
          effectiveFrom: now,
          lastCalculatedAt: now,
        },
      });
    }

    await prisma.hcpCampaignScore.update({
      where: { id: score.id },
      data: { publishedAt: now },
    });

    published++;
  }

  // Set campaign to PUBLISHED
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'PUBLISHED', publishedAt: new Date() },
  });
  console.log(`  Published ${published} scores. Campaign status → PUBLISHED`);
}

// ──── Main ────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Dry Eye Sociometric Survey Import');
  console.log('═══════════════════════════════════════════════');

  const startTime = Date.now();

  try {
    // Step 1
    const diseaseAreaId = await createDiseaseArea();

    // Step 2
    const npiToHcpId = await importHcpsFromFile2();

    // Step 3
    const questions = await createQuestions();

    // Step 4
    const surveyTemplateId = await createTemplates(questions);

    // Step 5
    const campaignId = await createCampaign(diseaseAreaId, surveyTemplateId);

    // Steps 6-7
    await importSurveyData(campaignId, questions, npiToHcpId);

    // Step 8
    await autoMatchNominations(campaignId);

    // Step 9
    await calculateAndPublish(campaignId);

    // Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n═══════════════════════════════════════════════');
    console.log('  Import Complete!');
    console.log(`  Campaign ID: ${campaignId}`);
    console.log(`  Disease Area ID: ${diseaseAreaId}`);
    console.log(`  Total time: ${elapsed}s`);
    console.log('═══════════════════════════════════════════════');

    // Verification
    const [responseCount, nomCount, matchedCount, scoreCount] = await Promise.all([
      prisma.surveyResponse.count({ where: { campaignId } }),
      prisma.nomination.count({ where: { response: { campaignId } } }),
      prisma.nomination.count({ where: { response: { campaignId }, matchStatus: 'MATCHED' } }),
      prisma.hcpCampaignScore.count({ where: { campaignId } }),
    ]);

    console.log('\n  Verification:');
    console.log(`    Completed responses: ${responseCount}`);
    console.log(`    Total nominations: ${nomCount}`);
    console.log(`    Matched nominations: ${matchedCount} (${((matchedCount / nomCount) * 100).toFixed(1)}%)`);
    console.log(`    HCP scores: ${scoreCount}`);
  } catch (error) {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
