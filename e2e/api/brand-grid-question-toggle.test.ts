/**
 * Brand-Affinity Grid — per-question useBrandGrid toggle (Phase 1 UI backend).
 *
 * Covers:
 *   - GET /survey-preview surfaces useBrandGrid: false on every question of a
 *     fresh campaign (additive field, non-breaking to existing consumers).
 *   - PATCH /:id/survey-questions/:sqId round-trips the toggle for a
 *     nomination question.
 *   - 400 on invalid body, 404 on unknown campaign / mismatched sqId,
 *     403 on cross-tenant (skipped — needs a second tenant context).
 *
 * Ticket: docs/findings/brand-affinity-grid-nomination-plan-2026-07-08.md
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { ApiClient } from '../api-client';

const skipIfNoAuth = !config.authToken;
const prisma = new PrismaClient();

describe.skipIf(skipIfNoAuth)('Brand-Affinity Grid — useBrandGrid per-question toggle', () => {
  const api = new ApiClient();
  let campaignId: string | null = null;
  let nominationSurveyQuestionId: string | null = null;

  beforeAll(async () => {
    // createTestCampaign attaches TEST_IDS.SURVEY_TEMPLATE_ID. The seeded
    // template happens to contain no nomination-type questions (the seed
    // covers Demographics/free-text only), so we self-provision one for
    // the test rather than depending on unrelated seed content.
    const created = await api.createTestCampaign({
      description: 'brand-grid question-toggle test',
    });
    expect([200, 201]).toContain(created.status);
    campaignId = created.data.id;
    console.log(`Created campaign ${campaignId} for question-toggle tests`);

    // Look up any Question in the bank with a nominationType — the fixture
    // question ids drift over time, so we search dynamically.
    const nomQuestion = await prisma.question.findFirst({
      where: { nominationType: { not: null } },
      select: { id: true, text: true, nominationType: true },
    });
    if (!nomQuestion) {
      throw new Error(
        'No Question row with nominationType found in the DB — cannot run useBrandGrid toggle test'
      );
    }

    // Insert a SurveyQuestion into the fresh test campaign referencing
    // that nomination Question. Cleanup cascades when the campaign gets
    // deleted in afterAll.
    const sq = await prisma.surveyQuestion.create({
      data: {
        campaignId: campaignId!,
        questionId: nomQuestion.id,
        sectionName: 'E2E Test Nomination Section',
        sortOrder: 100,
        isRequired: false,
        questionTextSnapshot: nomQuestion.text,
        nominationType: nomQuestion.nominationType,
      },
      select: { id: true },
    });
    nominationSurveyQuestionId = sq.id;

    // Sanity: survey-preview now surfaces the injected question with
    // useBrandGrid: false (the additive default).
    const preview = await api.getSurveyPreview(campaignId!);
    expect(preview.status).toBe(200);
    const injected = preview.data.questions.find(
      (q) => q.id === nominationSurveyQuestionId
    );
    expect(injected).toBeDefined();
    expect(injected!.useBrandGrid).toBe(false);
  });

  afterAll(async () => {
    if (campaignId) {
      try {
        await api.cleanupTestCampaign(campaignId);
      } catch (err) {
        console.warn(`Cleanup failed for campaign ${campaignId}:`, err);
      }
    }
    await prisma.$disconnect();
  });

  describe('GET /survey-preview shape', () => {
    it('includes useBrandGrid: false on every question of a fresh campaign', async () => {
      const { status, data } = await api.getSurveyPreview(campaignId!);
      expect(status).toBe(200);
      for (const q of data.questions) {
        expect(q).toHaveProperty('useBrandGrid');
        expect(q.useBrandGrid).toBe(false);
      }
    });
  });

  describe('PATCH /:id/survey-questions/:sqId — round-trip', () => {
    it('turns useBrandGrid on for a nomination question', async () => {
      const { status, data } = await api.updateSurveyQuestionBrandGrid(
        campaignId!,
        nominationSurveyQuestionId!,
        true
      );
      expect(status).toBe(200);
      expect(data.id).toBe(nominationSurveyQuestionId);
      expect(data.useBrandGrid).toBe(true);
    });

    it('the survey-preview response reflects the flip', async () => {
      const { data } = await api.getSurveyPreview(campaignId!);
      const q = data.questions.find((x) => x.id === nominationSurveyQuestionId);
      expect(q?.useBrandGrid).toBe(true);
    });

    it('turns it back off', async () => {
      const { status, data } = await api.updateSurveyQuestionBrandGrid(
        campaignId!,
        nominationSurveyQuestionId!,
        false
      );
      expect(status).toBe(200);
      expect(data.useBrandGrid).toBe(false);
      const preview = await api.getSurveyPreview(campaignId!);
      const q = preview.data.questions.find((x) => x.id === nominationSurveyQuestionId);
      expect(q?.useBrandGrid).toBe(false);
    });
  });

  describe('Validation + error paths', () => {
    it('rejects a non-boolean useBrandGrid with 400', async () => {
      const { status } = await api.updateSurveyQuestionBrandGrid(
        campaignId!,
        nominationSurveyQuestionId!,
        'yes' as unknown as boolean
      );
      expect(status).toBe(400);
    });

    it('returns 404 for a nonexistent campaign id', async () => {
      const { status } = await api.updateSurveyQuestionBrandGrid(
        'cme2e0nonexistent001x',
        nominationSurveyQuestionId!,
        true
      );
      expect(status).toBe(404);
    });

    it('returns 404 when the sqId does not belong to the campaign', async () => {
      // Any well-formed cuid that isn't a real survey-question for this
      // campaign. Uses the campaign's own id as a stand-in — guaranteed
      // to be a valid CUID but not a real SurveyQuestion.
      const { status } = await api.updateSurveyQuestionBrandGrid(
        campaignId!,
        campaignId!,
        true
      );
      expect(status).toBe(404);
    });
  });
});
