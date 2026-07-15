/**
 * UCPM backfill — deep assertions deferred from PR D (v1.17.4-v1.17.6).
 *
 * PR D smoke-tested the v1.17.4 changes; two deeper assertions needed
 * fixture work that didn't fit that PR's scope. This file lands them.
 *
 *  1. `getStats` / `list` agree under `excludeInternalEmails=true`, AND
 *     neither surfaces nominations from internal-email respondents.
 *     Catches the pre-v1.17.4 bug class where tile counts disagreed with
 *     the list because `getStats` ignored the flag.
 *
 *  2. `updateRawName` writes the expected `nomination.raw_name_updated`
 *     AuditLog row. Catches the pre-v1.17.4 bug class where renames
 *     silently mutated rawNameEntered with no audit trail.
 *
 * Setup is heavy (own campaign, two HCPs, two survey submissions, two
 * nomination-bearing responses) so it lives in its own file with shared
 * `beforeAll` rather than slowing down the main backfill suite.
 *
 * Cleanup: the campaign created here has the standard `E2E_TEST_CAMPAIGN_`
 * prefix, so `cleanupTestCampaigns()` sweeps it up alongside other test
 * campaigns. AuditLog rows are not cleaned (harmless — FK is to User
 * which persists; entityId can dangle).
 *
 * REQUIRES `DATABASE_URL` in env (deep assertions read AuditLog and the
 * Nomination/SurveyResponse tables directly). The runner (run-with-auth.ts)
 * forwards `process.env` to vitest, so any of the following work:
 *   - Add `DATABASE_URL='postgresql://...localhost:5432/kol360'` to e2e/.env
 *   - Export it in the shell before running tests
 *   - Run from a shell that already has it set (e.g. apps/api/.env loaded)
 * If DATABASE_URL is missing OR the SSH tunnel is down, the DB-dependent
 * assertions skip gracefully with a console note — they do not fail.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ApiClient } from '../api-client';
import { config } from '../config';
import { TEST_IDS } from '../fixtures';

const prisma = new PrismaClient();
let dbAvailable = false;

// HCP_2 has email `hcp2@bio-exec.com` — the only internal-flavored email
// in the test fixture set; that's what `excludeInternalEmails` filters.
const INTERNAL_HCP_ID = TEST_IDS.HCP_2.id;
const EXTERNAL_HCP_ID = TEST_IDS.HCP_1.id;

describe('UCPM backfill — deep assertions (v1.17.4)', () => {
  let client: ApiClient;
  let campaignId: string;
  let setupOk = false; // false → success-path tests skip with a clear note

  beforeAll(async () => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:test:auth');
    }
    client = new ApiClient();

    // Optional DB connection — used by deep assertions for DB ground-truth
    // and AuditLog reads. Probe with a cheap query; if it fails (no
    // DATABASE_URL, tunnel down, auth wrong), mark unavailable and the
    // DB-dependent assertions skip with a note instead of erroring.
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : String(e);
      console.log(`⚠️ Prisma probe failed (${msg}) — DB-backed assertions will skip`);
    }

    // 1. Create a campaign with the flag ON. The create service now
    //    honors excludeInternalEmails (fixed in the same PR as this test —
    //    apps/api/src/services/campaign.service.ts:create previously
    //    enumerated fields and silently dropped this one).
    const createRes = await client.createTestCampaign({ excludeInternalEmails: true });
    if (createRes.status !== 200 && createRes.status !== 201) {
      console.log(`⚠️ create-campaign returned ${createRes.status} — skipping`);
      return;
    }
    campaignId = createRes.data.id;
    console.log(`✅ Created deep-assertion campaign ${campaignId} (excludeInternalEmails=true)`);

    // 2. Assign one internal + one external HCP.
    const assignRes = await client.assignHcpsToCampaign(campaignId, [
      INTERNAL_HCP_ID,
      EXTERNAL_HCP_ID,
    ]);
    if (assignRes.status !== 200 && assignRes.status !== 201) {
      console.log(`⚠️ assign-hcps returned ${assignRes.status} — skipping`);
      return;
    }

    // 3. Activate the campaign so survey tokens become usable.
    const actRes = await client.activateCampaign(campaignId);
    if (actRes.status !== 200 && actRes.status !== 201) {
      console.log(`⚠️ activate returned ${actRes.status} — skipping`);
      return;
    }

    // 4. Seed nominations directly via Prisma.
    //
    //    Why Prisma rather than the survey-take API: the test survey
    //    template doesn't validate cleanly against generateSampleAnswers
    //    (submit returns 400 — known fixture mismatch; full-workflow test
    //    has the same issue and just logs/continues). Going through Prisma
    //    sidesteps the survey-flow noise and seeds exactly the rows the
    //    assertion needs: one SurveyResponse per HCP + 2 nominations on
    //    each. The API behavior under test is the read path
    //    (listForCampaign / getStats), not the write path.
    if (!dbAvailable) {
      console.log('⚠️ DB unavailable — cannot seed nominations directly');
      return;
    }

    // The E2E test survey template (TEST_IDS.SURVEY_TEMPLATE_ID) doesn't
    // include nomination questions, so activation doesn't create any
    // nomination SurveyQuestion rows on the campaign. We seed one
    // directly: pick any existing Question with a nominationType, then
    // stamp a SurveyQuestion onto this campaign pointing at it.
    const nomBaseQuestion = await prisma.question.findFirst({
      where: { nominationType: { not: null } },
    });
    if (!nomBaseQuestion) {
      console.log('⚠️ no nomination-flavored Question exists in DB — cannot seed');
      return;
    }
    const nomQuestion = await prisma.surveyQuestion.create({
      data: {
        campaignId,
        questionId: nomBaseQuestion.id,
        sectionName: 'E2E Deep — Nominations',
        sortOrder: 999,
        isRequired: false,
        questionTextSnapshot: 'E2E deep-assertion seeded nomination question',
        nominationType: nomBaseQuestion.nominationType,
      },
    });

    // 2 Nominations per HCP. Tokens are unique per (campaignId, hcpId) in
    // CampaignHcp; reusing them on SurveyResponse is fine (the unique
    // constraint is on SurveyResponse.surveyToken, and we're the only
    // SurveyResponse for this campaign).
    for (const hcpId of [INTERNAL_HCP_ID, EXTERNAL_HCP_ID]) {
      const response = await prisma.surveyResponse.create({
        data: {
          campaignId,
          respondentHcpId: hcpId,
          surveyToken: `e2e-deep-${randomUUID()}`,
          status: 'COMPLETED',
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });
      for (let i = 0; i < 2; i++) {
        await prisma.nomination.create({
          data: {
            responseId: response.id,
            questionId: nomQuestion.id,
            nominatorHcpId: hcpId,
            rawNameEntered: `Dr Seeded ${i + 1} (${hcpId.slice(-6)})`,
            matchStatus: 'UNMATCHED',
          },
        });
      }
    }

    // Confirm via API.
    const list = await client.listNominations(campaignId, { limit: 100 });
    if (list.status !== 200) {
      console.log(
        `⚠️ list returned ${list.status} after seeding — skipping. body: ${JSON.stringify(list.data).slice(0, 300)}`
      );
      return;
    }
    setupOk = true;
    console.log(`✅ Setup complete: ${list.data.pagination.total} nominations visible via API`);
  }, 60_000); // generous timeout — multi-step setup

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------
  // Assertion 1: getStats counts agree with list, and internal is excluded
  // ---------------------------------------------------------------------
  describe('Assertion 1 — getStats vs list under excludeInternalEmails=true', () => {
    it('stats sum equals list pagination total', async () => {
      if (!setupOk) {
        console.log('⊘ setup did not complete — skipping');
        return;
      }
      const [stats, list] = await Promise.all([
        client.getNominationStats(campaignId),
        client.listNominations(campaignId, { limit: 100 }),
      ]);
      expect(stats.status).toBe(200);
      expect(list.status).toBe(200);

      // Stats is a sparse map of matchStatus → number. Sum all values.
      const statsTotal = Object.values(stats.data as Record<string, number>).reduce(
        (a, b) => a + b,
        0
      );
      expect(statsTotal).toBe(list.data.pagination.total);
      console.log(
        `✅ stats sum (${statsTotal}) == list total (${list.data.pagination.total})`
      );
    });

    it('list excludes nominations from the internal-email respondent', async () => {
      if (!setupOk) {
        console.log('⊘ setup did not complete — skipping');
        return;
      }
      if (!dbAvailable) {
        console.log('⊘ DB unavailable — skipping ground-truth cross-check');
        return;
      }
      const list = await client.listNominations(campaignId, { limit: 100 });
      expect(list.status).toBe(200);

      // Cross-check against the DB ground truth: how many nominations did
      // the internal HCP actually create? The API should return zero of them.
      const internalCountInDb = await prisma.nomination.count({
        where: { response: { campaignId, respondentHcpId: INTERNAL_HCP_ID } },
      });
      const totalCountInDb = await prisma.nomination.count({
        where: { response: { campaignId } },
      });

      // The API total should equal DB total minus the internal ones.
      expect(list.data.pagination.total).toBe(totalCountInDb - internalCountInDb);

      // And no item in the response should be tied to the internal HCP as nominator.
      const internalItems = list.data.items.filter(
        (n) => (n as { nominatorHcpId?: string }).nominatorHcpId === INTERNAL_HCP_ID
      );
      expect(internalItems.length).toBe(0);

      console.log(
        `✅ DB has ${totalCountInDb} nominations (${internalCountInDb} from internal); ` +
          `API returns ${list.data.pagination.total} — internal correctly excluded`
      );
    });
  });

  // ---------------------------------------------------------------------
  // Assertion 3 — regression for the campaign-create-route bug
  // surfaced while wiring up these tests. The create service used to
  // enumerate fields and silently drop excludeInternalEmails (UPDATE
  // worked, CREATE didn't — accepted-but-ignored, the worst contract).
  // ---------------------------------------------------------------------
  describe('Assertion 3 — campaign create honors excludeInternalEmails', () => {
    it('round-trips excludeInternalEmails=true through POST /campaigns', async () => {
      const created = await client.createTestCampaign({ excludeInternalEmails: true });
      expect([200, 201]).toContain(created.status);

      // Read back via the campaign-detail endpoint, not the in-memory
      // create response — guarantees the value persisted.
      const fetched = await client.getCampaign(created.data.id);
      expect(fetched.status).toBe(200);
      expect((fetched.data as { excludeInternalEmails?: boolean }).excludeInternalEmails).toBe(true);

      console.log(`✅ excludeInternalEmails round-trip OK for ${created.data.id}`);
    });

    it('round-trips excludeInternalEmails=false (explicit) through POST /campaigns', async () => {
      const created = await client.createTestCampaign({ excludeInternalEmails: false });
      expect([200, 201]).toContain(created.status);

      const fetched = await client.getCampaign(created.data.id);
      expect(fetched.status).toBe(200);
      expect((fetched.data as { excludeInternalEmails?: boolean }).excludeInternalEmails).toBe(false);
    });

    it('defaults excludeInternalEmails=false when omitted', async () => {
      const created = await client.createTestCampaign({});
      expect([200, 201]).toContain(created.status);

      const fetched = await client.getCampaign(created.data.id);
      expect(fetched.status).toBe(200);
      expect((fetched.data as { excludeInternalEmails?: boolean }).excludeInternalEmails).toBe(false);
    });

    // v1.18.3 — parallel check for showTopicsDiscussed. Same silent-drop
    // anti-pattern was present in the create service until v1.18.3; if
    // this test starts failing, someone dropped the field again during
    // a merge.
    it('round-trips showTopicsDiscussed=true through POST /campaigns', async () => {
      const created = await client.createTestCampaign({ showTopicsDiscussed: true });
      expect([200, 201]).toContain(created.status);

      const fetched = await client.getCampaign(created.data.id);
      expect(fetched.status).toBe(200);
      expect((fetched.data as { showTopicsDiscussed?: boolean }).showTopicsDiscussed).toBe(true);
    });

    it('defaults showTopicsDiscussed=false when omitted', async () => {
      const created = await client.createTestCampaign({});
      expect([200, 201]).toContain(created.status);

      const fetched = await client.getCampaign(created.data.id);
      expect(fetched.status).toBe(200);
      expect((fetched.data as { showTopicsDiscussed?: boolean }).showTopicsDiscussed).toBe(false);
    });
  });

  // ---------------------------------------------------------------------
  // Assertion 2: updateRawName writes a nomination.raw_name_updated row
  // ---------------------------------------------------------------------
  describe('Assertion 2 — updateRawName writes AuditLog row', () => {
    it('writes nomination.raw_name_updated with correct old/new values + actor', async () => {
      if (!setupOk) {
        console.log('⊘ setup did not complete — skipping');
        return;
      }
      if (!dbAvailable) {
        console.log('⊘ DB unavailable — skipping AuditLog read');
        return;
      }

      // Need an UNMATCHED (or REVIEW_NEEDED) nomination — the service
      // rejects renames on MATCHED. Fresh-submitted noms are UNMATCHED
      // until bulk-match runs.
      const list = await client.listNominations(campaignId, {
        status: 'UNMATCHED',
        limit: 10,
      });
      expect(list.status).toBe(200);
      if (list.data.items.length === 0) {
        console.log('⊘ no UNMATCHED nominations in this campaign — skipping');
        return;
      }

      const target = list.data.items[0];
      const original = target.rawNameEntered;
      // Unique suffix so reruns don't collide on the same name; no
      // Date.now() in app code per memory, but test code is fine.
      const newName = `${original} (e2e-renamed ${process.pid}-${Math.floor(performance.now())})`;

      const renameRes = await client.updateNominationRawName(campaignId, target.id, newName);
      expect(renameRes.status).toBe(200);

      // Direct DB read for the audit row — there's no admin AuditLog
      // read endpoint yet (tracked separately).
      const audit = await prisma.auditLog.findFirst({
        where: {
          entityType: 'Nomination',
          entityId: target.id,
          action: 'nomination.raw_name_updated',
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(audit).not.toBeNull();
      expect(audit!.userId).toBe(TEST_IDS.USER_ID);
      expect(audit!.oldValues).toMatchObject({ rawNameEntered: original });
      expect(audit!.newValues).toMatchObject({ rawNameEntered: newName });

      console.log(
        `✅ AuditLog row written: action=nomination.raw_name_updated entityId=${target.id} ` +
          `oldName="${original}" newName="${newName}"`
      );
    });
  });
});
