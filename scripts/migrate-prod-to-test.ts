/**
 * Migrate Sun Pharma campaign data from prod DB to test DB.
 * Overwrites test HCPs that conflict by beId.
 *
 * Setup (one-time): add these to apps/api/.env:
 *   PROD_DATABASE_URL='postgresql://kol360admin:<PROD_PW>@localhost:5433/kol360'
 *   TEST_DATABASE_URL='postgresql://kol360admin:<TEST_PW>@localhost:5432/kol360'
 *
 * Usage: cd apps/api && npx tsx ../../scripts/migrate-prod-to-test.ts
 *   (tsx 4+ auto-loads .env from cwd. If your tsx is older, either upgrade
 *    or manually export the two vars in your shell before running.)
 *
 * 2026-05-28: refactored from inline literal passwords to env-var reads
 * after the credential-leak audit (docs/findings/dev-team-asks-2026-05-28.md).
 */

import { PrismaClient } from '@prisma/client';

const PROD_URL = process.env.PROD_DATABASE_URL;
const TEST_URL = process.env.TEST_DATABASE_URL;
if (!PROD_URL || !TEST_URL) {
  console.error(
    'ERROR: PROD_DATABASE_URL and TEST_DATABASE_URL must both be set in your env.\n' +
    '       Add them to apps/api/.env (see header comment) or export in your shell.'
  );
  process.exit(1);
}
const TEST_DISEASE_AREA_ID = 'cmj6ice860000wspd6wotdndy';
const CLIENT_ID = 'cmmjq5hbl00jevqf87olee6yb';
const CAMPAIGN_IDS = [
  'cmmjq648c00jivqf8b9qxwjl4',
  'cmmjqzvtq00lsvqf8om774yzb',
];

const prodDb = new PrismaClient({ datasources: { db: { url: PROD_URL } } });
const testDb = new PrismaClient({ datasources: { db: { url: TEST_URL } } });

async function main() {
  await prodDb.$connect();
  await testDb.$connect();
  console.log('Connected to both DBs.\n');

  // 1. Client
  console.log('1. Client...');
  const clients: any[] = await prodDb.$queryRawUnsafe(`SELECT id, name FROM "Client" WHERE id = $1`, CLIENT_ID);
  await testDb.$executeRawUnsafe(`INSERT INTO "Client" (id, name, "createdAt", "updatedAt") VALUES ($1, $2, NOW(), NOW()) ON CONFLICT (id) DO NOTHING`, clients[0].id, clients[0].name);
  console.log(`   ${clients[0].name}`);

  // 2. Templates
  console.log('2. Templates...');
  const campaigns: any[] = await prodDb.$queryRawUnsafe(`SELECT id, "clientId", "surveyTemplateId", name, status, "excludeInternalEmails" FROM "Campaign" WHERE id = ANY($1::text[])`, CAMPAIGN_IDS);
  const templateIds = [...new Set(campaigns.map(c => c.surveyTemplateId).filter(Boolean))];
  for (const tid of templateIds) {
    const t: any[] = await prodDb.$queryRawUnsafe(`SELECT id, name, description FROM "SurveyTemplate" WHERE id = $1`, tid);
    if (t.length) {
      await testDb.$executeRawUnsafe(`INSERT INTO "SurveyTemplate" (id, name, description, "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW(), NOW()) ON CONFLICT (id) DO NOTHING`, t[0].id, t[0].name, t[0].description);
      console.log(`   ${t[0].name}`);
    }
  }

  // 3. HCPs — get all from prod, delete conflicting beIds in test, then insert
  console.log('3. HCPs...');
  const prodHcps: any[] = await prodDb.$queryRawUnsafe(`
    SELECT DISTINCT h.id, h."beId", h."firstName", h."lastName", h.email, h.specialty, h.npi, h.state, h.city
    FROM "Hcp" h WHERE h.id IN (
      SELECT "hcpId" FROM "CampaignHcp" WHERE "campaignId" = ANY($1::text[])
      UNION SELECT "respondentHcpId" FROM "SurveyResponse" WHERE "campaignId" = ANY($1::text[])
      UNION SELECT "matchedHcpId" FROM "Nomination" n JOIN "SurveyResponse" r ON n."responseId" = r.id WHERE r."campaignId" = ANY($1::text[]) AND n."matchedHcpId" IS NOT NULL
      UNION SELECT "nominatorHcpId" FROM "Nomination" n JOIN "SurveyResponse" r ON n."responseId" = r.id WHERE r."campaignId" = ANY($1::text[]) AND n."nominatorHcpId" IS NOT NULL
    )
  `, CAMPAIGN_IDS);
  console.log(`   ${prodHcps.length} HCPs from prod`);

  // Delete test HCPs that have conflicting beIds (cascade will clean up related records)
  const beIds = prodHcps.map(h => h.beId).filter(Boolean);
  const prodIds = prodHcps.map(h => h.id);
  if (beIds.length > 0) {
    // Find test HCPs with same beId but different id
    const conflicting: any[] = await testDb.$queryRawUnsafe(
      `SELECT id, "beId" FROM "Hcp" WHERE "beId" = ANY($1::text[]) AND id != ALL($2::text[])`,
      beIds, prodIds
    );
    if (conflicting.length > 0) {
      console.log(`   Deleting ${conflicting.length} conflicting test HCPs...`);
      const conflictIds = conflicting.map(c => c.id);
      // Delete in dependency order — try/catch each since some tables may not exist on test
      const deletes = [
        `DELETE FROM "Nomination" WHERE "nominatorHcpId" = ANY($1::text[]) OR "matchedHcpId" = ANY($1::text[])`,
        `DELETE FROM "Payment" WHERE "responseId" IN (SELECT id FROM "SurveyResponse" WHERE "respondentHcpId" = ANY($1::text[]))`,
        `DELETE FROM "SurveyResponseAnswer" WHERE "responseId" IN (SELECT id FROM "SurveyResponse" WHERE "respondentHcpId" = ANY($1::text[]))`,
        `DELETE FROM "SurveyResponse" WHERE "respondentHcpId" = ANY($1::text[])`,
        `DELETE FROM "CampaignHcp" WHERE "hcpId" = ANY($1::text[])`,
        `DELETE FROM "HcpCampaignScore" WHERE "hcpId" = ANY($1::text[])`,
        `DELETE FROM "HcpDiseaseAreaScore" WHERE "hcpId" = ANY($1::text[])`,
        `DELETE FROM "Payment" WHERE "hcpId" = ANY($1::text[])`,
        `DELETE FROM "CampaignHcpExclusion" WHERE "hcpId" = ANY($1::text[])`,
        `DELETE FROM "ClientHcpExclusion" WHERE "hcpId" = ANY($1::text[])`,
        `DELETE FROM "OptOut" WHERE "hcpId" = ANY($1::text[])`,
        `DELETE FROM "HcpSpecialty" WHERE "hcpId" = ANY($1::text[])`,
        `DELETE FROM "HcpAlias" WHERE "hcpId" = ANY($1::text[])`,
        `DELETE FROM "Hcp" WHERE id = ANY($1::text[])`,
      ];
      for (const sql of deletes) {
        try { await testDb.$executeRawUnsafe(sql, conflictIds); } catch { /* table may not exist */ }
      }
      console.log(`   Deleted ${conflicting.length} conflicting HCPs`);
    }
  }

  // Now insert all prod HCPs
  let inserted = 0;
  for (let i = 0; i < prodHcps.length; i += 500) {
    const batch = prodHcps.slice(i, i + 500);
    for (const h of batch) {
      try {
        await testDb.$executeRawUnsafe(
          `INSERT INTO "Hcp" (id, "beId", "firstName", "lastName", email, specialty, npi, state, city, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()) ON CONFLICT (id) DO NOTHING`,
          h.id, h.beId, h.firstName, h.lastName, h.email, h.specialty, h.npi, h.state, h.city
        );
        inserted++;
      } catch { /* skip */ }
    }
    process.stdout.write(`   ${Math.min(i + 500, prodHcps.length)}/${prodHcps.length}\r`);
  }
  console.log(`   Inserted: ${inserted}                    `);

  // 4. Campaigns
  console.log('4. Campaigns...');
  for (const c of campaigns) {
    await testDb.$executeRawUnsafe(
      `INSERT INTO "Campaign" (id, "clientId", "diseaseAreaId", "surveyTemplateId", name, status, "excludeInternalEmails", "showTopicsDiscussed", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6::"CampaignStatus", $7, false, NOW(), NOW()) ON CONFLICT (id) DO NOTHING`,
      c.id, c.clientId, TEST_DISEASE_AREA_ID, c.surveyTemplateId, c.name, c.status, c.excludeInternalEmails
    );
    console.log(`   ${c.name}`);
  }

  // 5. Questions + SurveyQuestions
  console.log('5. Questions...');
  const sqs: any[] = await prodDb.$queryRawUnsafe(`
    SELECT sq.id, sq."campaignId", sq."questionId", sq."sectionName", sq."sortOrder", sq."isRequired", sq."questionTextSnapshot", sq."nominationType",
           q.id as qid, q.text, q.type, q.category, q."isRequired" as qreq, q.options, q.tags, q.status, q."minEntries", q."defaultEntries", q."nominationType" as qnom
    FROM "SurveyQuestion" sq JOIN "Question" q ON sq."questionId" = q.id
    WHERE sq."campaignId" = ANY($1::text[])
  `, CAMPAIGN_IDS);
  const qDone = new Set<string>();
  for (const sq of sqs) {
    if (!qDone.has(sq.questionId)) {
      qDone.add(sq.questionId);
      await testDb.$executeRawUnsafe(
        `INSERT INTO "Question" (id, text, type, category, "isRequired", options, tags, status, "minEntries", "defaultEntries", "nominationType", "createdAt", "updatedAt")
         VALUES ($1, $2, $3::"QuestionType", $4, $5, $6::jsonb, $7::text[], $8, $9, $10, $11::"NominationType", NOW(), NOW()) ON CONFLICT (id) DO NOTHING`,
        sq.qid, sq.text, sq.type, sq.category, sq.qreq, sq.options ? JSON.stringify(sq.options) : null,
        sq.tags || [], sq.status || 'active', sq.minEntries, sq.defaultEntries, sq.qnom
      );
    }
    await testDb.$executeRawUnsafe(
      `INSERT INTO "SurveyQuestion" (id, "campaignId", "questionId", "sectionName", "sortOrder", "isRequired", "questionTextSnapshot", "nominationType", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::"NominationType", NOW()) ON CONFLICT (id) DO NOTHING`,
      sq.id, sq.campaignId, sq.questionId, sq.sectionName, sq.sortOrder, sq.isRequired, sq.questionTextSnapshot, sq.nominationType
    );
  }
  console.log(`   ${qDone.size} questions, ${sqs.length} survey questions`);

  // 6. CampaignHcp
  console.log('6. CampaignHcp...');
  const chs: any[] = await prodDb.$queryRawUnsafe(`SELECT id, "campaignId", "hcpId", "surveyToken" FROM "CampaignHcp" WHERE "campaignId" = ANY($1::text[])`, CAMPAIGN_IDS);
  let chOk = 0;
  for (const ch of chs) {
    try {
      await testDb.$executeRawUnsafe(`INSERT INTO "CampaignHcp" (id, "campaignId", "hcpId", "surveyToken", "createdAt") VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (id) DO NOTHING`,
        ch.id, ch.campaignId, ch.hcpId, ch.surveyToken);
      chOk++;
    } catch { /* skip */ }
  }
  console.log(`   ${chOk}/${chs.length}`);

  // 7. SurveyResponses
  console.log('7. Responses...');
  const resps: any[] = await prodDb.$queryRawUnsafe(`SELECT id, "campaignId", "respondentHcpId", "surveyToken", status, "startedAt", "completedAt", "ipAddress" FROM "SurveyResponse" WHERE "campaignId" = ANY($1::text[])`, CAMPAIGN_IDS);
  let resOk = 0;
  for (const r of resps) {
    try {
      await testDb.$executeRawUnsafe(
        `INSERT INTO "SurveyResponse" (id, "campaignId", "respondentHcpId", "surveyToken", status, "startedAt", "completedAt", "ipAddress", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5::"SurveyResponseStatus", $6, $7, $8, NOW(), NOW()) ON CONFLICT (id) DO NOTHING`,
        r.id, r.campaignId, r.respondentHcpId, r.surveyToken, r.status, r.startedAt, r.completedAt, r.ipAddress
      );
      resOk++;
    } catch { /* skip FK errors */ }
  }
  console.log(`   ${resOk}/${resps.length}`);

  // 8. Answers
  console.log('8. Answers...');
  const respIds = resps.filter(r => r.status === 'COMPLETED').map(r => r.id);
  let ansOk = 0;
  for (let i = 0; i < respIds.length; i += 50) {
    const batch = respIds.slice(i, i + 50);
    const ans: any[] = await prodDb.$queryRawUnsafe(`SELECT id, "responseId", "questionId", "answerText", "answerJson" FROM "SurveyResponseAnswer" WHERE "responseId" = ANY($1::text[])`, batch);
    for (const a of ans) {
      try {
        await testDb.$executeRawUnsafe(
          `INSERT INTO "SurveyResponseAnswer" (id, "responseId", "questionId", "answerText", "answerJson", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5::jsonb, NOW(), NOW()) ON CONFLICT (id) DO NOTHING`,
          a.id, a.responseId, a.questionId, a.answerText, a.answerJson ? JSON.stringify(a.answerJson) : null
        );
        ansOk++;
      } catch { /* skip */ }
    }
  }
  console.log(`   ${ansOk} answers`);

  // 9. Nominations
  console.log('9. Nominations...');
  let nomOk = 0;
  for (let i = 0; i < respIds.length; i += 50) {
    const batch = respIds.slice(i, i + 50);
    const noms: any[] = await prodDb.$queryRawUnsafe(`SELECT id, "responseId", "questionId", "nominatorHcpId", "rawNameEntered", "matchedHcpId", "matchStatus", "matchedBy", "matchedAt", "matchConfidence", "matchType", "excludeReason" FROM "Nomination" WHERE "responseId" = ANY($1::text[])`, batch);
    for (const n of noms) {
      try {
        await testDb.$executeRawUnsafe(
          `INSERT INTO "Nomination" (id, "responseId", "questionId", "nominatorHcpId", "rawNameEntered", "matchedHcpId", "matchStatus", "matchedBy", "matchedAt", "matchConfidence", "matchType", "excludeReason", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7::"NominationMatchStatus", $8, $9, $10, $11, $12, NOW()) ON CONFLICT (id) DO NOTHING`,
          n.id, n.responseId, n.questionId, n.nominatorHcpId, n.rawNameEntered, n.matchedHcpId,
          n.matchStatus, n.matchedBy, n.matchedAt, n.matchConfidence ? Number(n.matchConfidence) : null, n.matchType, n.excludeReason
        );
        nomOk++;
      } catch { /* skip */ }
    }
  }
  console.log(`   ${nomOk} nominations`);

  // Verify
  console.log('\n=== Verification ===');
  for (const cid of CAMPAIGN_IDS) {
    const camp = await testDb.campaign.findUnique({ where: { id: cid }, select: { name: true } });
    const hcps = await testDb.campaignHcp.count({ where: { campaignId: cid } });
    const completed = await testDb.surveyResponse.count({ where: { campaignId: cid, status: 'COMPLETED' } });
    const answers = await testDb.surveyResponseAnswer.count({ where: { response: { campaignId: cid } } });
    const noms = await testDb.nomination.count({ where: { response: { campaignId: cid } } });
    console.log(`${camp?.name}: ${hcps} HCPs, ${completed} completed, ${answers} answers, ${noms} nominations`);
  }

  await prodDb.$disconnect();
  await testDb.$disconnect();
  console.log('\nDone!');
}

main().catch(e => { console.error(e); process.exit(1); });
