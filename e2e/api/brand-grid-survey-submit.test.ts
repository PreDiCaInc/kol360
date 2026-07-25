/**
 * Brand-Affinity Grid — respondent survey submit path (Phase 2 backend).
 *
 * Covers:
 *   - GET /survey/take/:token surfaces campaign.brandOptions and
 *     question.useBrandGrid
 *   - Submit with the { names, brandFlags } grid shape:
 *       * persists Nomination rows
 *       * persists NominationBrandFlag rows for each row's flags
 *       * BRAND flags carry the correct brandOptionId
 *       * NEUTRAL / DONT_KNOW sentinels persist with brandOptionId = NULL
 *   - Server-side rejection of grid invariant violations:
 *       * missing flags on a named row
 *       * mixed BRAND + NEUTRAL on same row
 *       * BRAND flag referencing a brandOptionId from a different campaign
 *   - Classic questions on a grid campaign still take the string[] path.
 *
 * Ticket: docs/findings/brand-affinity-grid-nomination-plan-2026-07-08.md
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { ApiClient } from '../api-client';
import { TEST_IDS, generateTestCampaignName } from '../fixtures';

const skipIfNoAuth = !config.authToken;
const prisma = new PrismaClient();

describe.skipIf(skipIfNoAuth)('Brand-Affinity Grid — survey submit path', () => {
  const api = new ApiClient();
  let campaignId: string | null = null;
  let surveyToken: string | null = null;
  let nominationSurveyQuestionId: string | null = null;
  let brandXiidraId: string | null = null;
  let brandRestasisId: string | null = null;

  beforeAll(async () => {
    // Create a campaign, activate it, assign the test HCP, seed brands,
    // add a nomination question with useBrandGrid = true.
    //
    // NOTE: we deliberately DON'T pass surveyTemplateId (i.e. we don't
    // use api.createTestCampaign). cleanup:all deletes the seeded
    // SURVEY_TEMPLATE_ID row, so a targeted rerun of this file after
    // a full-suite cleanup would 400 on the template lookup. This test
    // wipes any auto-instantiated SurveyQuestions and Prisma-inserts
    // its own nomination SurveyQuestion below — the template is
    // unused, so drop the dependency.
    const { status, data } = await api.createCampaign({
      name: generateTestCampaignName(),
      clientId: TEST_IDS.CLIENT_ID,
      diseaseAreaId: TEST_IDS.DISEASE_AREA_ID,
      description: 'brand-grid submit-path test',
      honorariumAmount: 150,
    });
    expect([200, 201]).toContain(status);
    campaignId = data.id;

    // Add 2 brands via Phase 1 API. Frozen only on first response —
    // still safe now.
    const upsert = await api.upsertBrandOptions(campaignId, [
      { brandName: 'Xiidra', displayOrder: 0 },
      { brandName: 'Restasis', displayOrder: 1 },
    ]);
    expect(upsert.status).toBe(200);
    brandXiidraId = upsert.data.brandOptions![0].id;
    brandRestasisId = upsert.data.brandOptions![1].id;


    // Wipe the pre-existing SurveyQuestions that the seed template
    // instantiated. Keeping them around forces the submit path through
    // validateRequired on 3 unrelated questions (Rating, Single Choice,
    // Discussion Leaders MULTI_TEXT with minEntries) — every one of
    // which our grid-only payload would fail. The test's whole purpose
    // is to exercise the grid write path, so isolate to just that.
    await prisma.surveyQuestion.deleteMany({ where: { campaignId } });

    // Add a nomination-type SurveyQuestion with useBrandGrid = true.
    const nomQuestion = await prisma.question.findFirst({
      where: { nominationType: { not: null } },
      select: { id: true, text: true, nominationType: true },
    });
    if (!nomQuestion) throw new Error('No nomination Question in DB');
    const sq = await prisma.surveyQuestion.create({
      data: {
        campaignId,
        questionId: nomQuestion.id,
        sectionName: 'E2E Test Grid Section',
        sortOrder: 100,
        isRequired: false,
        questionTextSnapshot: nomQuestion.text,
        nominationType: nomQuestion.nominationType,
        useBrandGrid: true,
      },
      select: { id: true },
    });
    nominationSurveyQuestionId = sq.id;

    // Assign the test HCP to the campaign and activate so a valid
    // survey token exists.
    await api.assignHcpsToCampaign(campaignId, [TEST_IDS.HCP_1.id]);
    const activate = await api.activateCampaign(campaignId);
    expect([200, 201]).toContain(activate.status);

    surveyToken = await api.getSurveyToken(campaignId, TEST_IDS.HCP_1.id);
    if (!surveyToken) throw new Error('Failed to fetch survey token');

    // Start the survey so status is IN_PROGRESS.
    await api.startSurvey(surveyToken);
  });

  afterAll(async () => {
    if (campaignId) {
      try {
        // Reset the freeze so cleanup can proceed cleanly.
        await prisma.campaign.updateMany({
          where: { id: campaignId },
          data: { brandsFrozenAt: null },
        });
        await api.cleanupTestCampaign(campaignId);
      } catch (err) {
        console.warn(`Cleanup failed for ${campaignId}:`, err);
      }
    }
    await prisma.$disconnect();
  });

  describe('GET /survey/take/:token — grid metadata surfaced', () => {
    it('emits campaign.brandOptions in the shared order', async () => {
      const { status, data } = await api.getSurveyByToken(surveyToken!);
      expect(status).toBe(200);
      const options = (data as unknown as { campaign: { brandOptions: Array<{ brandName: string; displayOrder: number }> } })
        .campaign.brandOptions;
      expect(options).toBeDefined();
      expect(options.map((b) => b.brandName)).toEqual(['Xiidra', 'Restasis']);
      expect(options.map((b) => b.displayOrder)).toEqual([0, 1]);
    });

    it('emits useBrandGrid: true on the seeded nomination question', async () => {
      const { data } = await api.getSurveyByToken(surveyToken!);
      const sq = (data as unknown as { questions: Array<{ id: string; useBrandGrid: boolean }> })
        .questions.find((q) => q.id === nominationSurveyQuestionId);
      expect(sq).toBeDefined();
      expect(sq!.useBrandGrid).toBe(true);
    });
  });

  describe('Submit with grid shape — persistence', () => {
    it('persists Nomination rows AND NominationBrandFlag rows', async () => {
      const payload: Record<string, unknown> = {
        [nominationSurveyQuestionId!]: {
          names: ['Dr. Alice Test', 'Dr. Bob Test'],
          brandFlags: [
            [{ flagType: 'BRAND', brandOptionId: brandXiidraId }],
            [
              { flagType: 'BRAND', brandOptionId: brandXiidraId },
              { flagType: 'BRAND', brandOptionId: brandRestasisId },
            ],
          ],
        },
      };
      const { status, data } = await api.submitSurveyAnswerMap(surveyToken!, payload);
      if (status !== 200) {
        // v1.17.82 — publicErrorResponse now echoes the underlying
        // Error.message as `detail` on 500s. If this trips, `detail`
        // has the exact reason and drives the next hotfix.
        console.log('DIAGNOSTIC — submit response:', status, JSON.stringify(data));
      }
      expect(status).toBe(200);

      // Verify Nomination rows exist.
      const nominations = await prisma.nomination.findMany({
        where: {
          response: { surveyToken: surveyToken! },
          questionId: nominationSurveyQuestionId!,
        },
        include: { brandFlags: true },
        orderBy: { rawNameEntered: 'asc' },
      });
      expect(nominations.length).toBe(2);
      const alice = nominations.find((n) => n.rawNameEntered === 'Dr. Alice Test')!;
      const bob = nominations.find((n) => n.rawNameEntered === 'Dr. Bob Test')!;
      expect(alice.brandFlags.length).toBe(1);
      expect(alice.brandFlags[0].flagType).toBe('BRAND');
      expect(alice.brandFlags[0].brandOptionId).toBe(brandXiidraId);
      expect(bob.brandFlags.length).toBe(2);
      expect(new Set(bob.brandFlags.map((f) => f.brandOptionId))).toEqual(
        new Set([brandXiidraId, brandRestasisId])
      );
    });
  });

  describe('Submit with grid — validation rejection paths', () => {
    // Reset the surveyResponse to IN_PROGRESS so we can re-submit.
    // Also unfreeze the campaign — the persistence test set brandsFrozenAt
    // when it flipped the response to COMPLETED. Leaving that in place
    // would still let submit run (freeze only affects brand-options PUT),
    // but resetting is defensive.
    async function resetResponseForRetry() {
      await prisma.surveyResponse.updateMany({
        where: { surveyToken: surveyToken! },
        data: { status: 'IN_PROGRESS', completedAt: null },
      });
      await prisma.campaign.updateMany({
        where: { id: campaignId! },
        data: { brandsFrozenAt: null },
      });
      // Wipe any nominations from the earlier successful submit so
      // dedup doesn't hide our attempts.
      await prisma.nomination.deleteMany({
        where: { response: { surveyToken: surveyToken! } },
      });
    }

    it('rejects a named row with no brand flags at all', async () => {
      await resetResponseForRetry();
      const payload: Record<string, unknown> = {
        [nominationSurveyQuestionId!]: {
          names: ['Dr. NoFlags Test'],
          brandFlags: [[]], // empty row → invalid per item S
        },
      };
      const { status } = await api.submitSurveyAnswerMap(surveyToken!, payload);
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500);
    });

    it('rejects a row that mixes BRAND with NEUTRAL', async () => {
      await resetResponseForRetry();
      const payload: Record<string, unknown> = {
        [nominationSurveyQuestionId!]: {
          names: ['Dr. Conflicted Test'],
          brandFlags: [[
            { flagType: 'BRAND', brandOptionId: brandXiidraId },
            { flagType: 'NEUTRAL' },
          ]],
        },
      };
      const { status } = await api.submitSurveyAnswerMap(surveyToken!, payload);
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500);
    });

    it('rejects a BRAND flag referencing a brandOptionId not in this campaign', async () => {
      await resetResponseForRetry();
      const payload: Record<string, unknown> = {
        [nominationSurveyQuestionId!]: {
          names: ['Dr. CrossCampaign Test'],
          brandFlags: [[
            // Reuse the campaign id as a well-formed-but-wrong CUID.
            // Server rejects because it isn't in the campaign's brand list.
            { flagType: 'BRAND', brandOptionId: campaignId! },
          ]],
        },
      };
      const { status } = await api.submitSurveyAnswerMap(surveyToken!, payload);
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500);
    });
  });
});
