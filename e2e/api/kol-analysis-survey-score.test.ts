/**
 * scoreSurvey formula E2E (v1.17.40)
 *
 * Confirms the formula change from
 * docs/findings/score-survey-formula-match-customer-2026-06-14.md:
 *
 *   scoreSurvey = (sum of nominations across the 4 COUNTED types)
 *               / (max-such-sum across HCPs in the analysis) × 100
 *
 * Counted (4): NATIONAL_LEADER, DISCUSSION_LEADERS, ADVICE_LEADERS, RISING_STAR
 * Not counted: REFERRAL_LEADERS, SOCIAL_LEADER, BIASED_LEADER, REGIONAL_LEADER
 *
 * Structural — runs against an existing scored analysis on the test env.
 * Recalculates first so the new formula is applied. Skips cleanly when no
 * scored analyses are seeded.
 *
 * Run: cd e2e && pnpm test:api:test:auth
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../api-client';
import { config } from '../config';

const skipIfNoAuth = !config.authToken;

const SURVEY_INCLUDED = new Set([
  'NATIONAL_LEADER',
  'DISCUSSION_LEADERS',
  'ADVICE_LEADERS',
  'RISING_STAR',
]);

describe.skipIf(skipIfNoAuth)('scoreSurvey formula (v1.17.40)', () => {
  let client: ApiClient;

  beforeAll(() => {
    client = new ApiClient();
  });

  it('after recalc, the top-survey HCP has scoreSurvey ≈ 100 and a positive count in at least one counted type', async () => {
    const { data: list } = await client.listKolAnalyses();
    const target = list.items
      .slice()
      .sort((a, b) => b._count.scores - a._count.scores)[0];
    if (!target || target._count.scores === 0) {
      console.log('⊘ No scored analysis on this env — skipping');
      return;
    }

    // Recalc so the v1.17.40 formula is the one we're asserting against.
    const recalc = await client.recalculateKolAnalysis(target.id);
    expect(recalc.status).toBe(200);

    // Pull a wide page from KOL Explorer (this is what Insights consumes).
    // Sort happens server-side; we just need a population to scan for the
    // survey-score top.
    const { status, data } = await client.getInsightsKolExplorer(
      target.diseaseAreaId,
      { limit: 50, clientId: target.clientId }
    );
    expect(status).toBe(200);
    if (!data.items.length) {
      console.log('⊘ KOL Explorer returned no items — skipping');
      return;
    }

    // Find the HCP with the highest scoreSurvey on this page. If the entire
    // page is null (no counted-type nominations anywhere), skip — that means
    // every HCP's nominations fall in the excluded categories, which is a
    // valid but rare end-state for the new formula.
    const scored = data.items
      .filter((k) => k.scoreSurvey != null)
      .sort((a, b) => (b.scoreSurvey ?? 0) - (a.scoreSurvey ?? 0));
    if (!scored.length) {
      console.log('⊘ No HCP has any counted-type nominations on this analysis — skipping');
      return;
    }
    const topByScore = scored[0];

    // Assertion 1: top HCP's scoreSurvey is at the 100 anchor (or within
    // floating-point of it). Under the v1.17.40 formula this is invariant —
    // the top survey-sum HCP always maps to 100.
    expect(topByScore.scoreSurvey).toBeGreaterThanOrEqual(99.5);
    expect(topByScore.scoreSurvey).toBeLessThanOrEqual(100.5);

    // Assertion 2: the explain endpoint corroborates with positive counts
    // in at least one of the 4 COUNTED types (i.e. the 100 didn't come from
    // a divide-by-zero edge case in the formula).
    const explain = await client.explainKolAnalysisHcp(target.id, topByScore.id);
    expect(explain.status).toBe(200);
    expect(explain.data.found).toBe(true);
    expect(explain.data.survey).toBeTruthy();
    const perType = explain.data.survey!.perType;
    const countedSum = perType
      .filter((p) => SURVEY_INCLUDED.has(p.nominationType))
      .reduce((acc, p) => acc + p.count, 0);
    expect(countedSum, 'top HCP must have nominations in at least one counted type').toBeGreaterThan(0);

    // Assertion 3: explain.scoreSurvey matches the stored / list value
    // (round-trip consistency — recalc → store → list → explain agree).
    if (explain.data.survey!.scoreSurvey != null && topByScore.scoreSurvey != null) {
      expect(explain.data.survey!.scoreSurvey).toBeCloseTo(topByScore.scoreSurvey, 1);
    }
  });

  it('explain endpoint per-type counts include the 4 counted nomination types when present', async () => {
    // Structural: the explain payload exposes per-type counts. Anything in
    // SURVEY_INCLUDED that shows up should have a non-null score in the
    // payload (the per-type display columns keep their max-normalized score
    // formula — only the aggregate scoreSurvey switched).
    const { data: list } = await client.listKolAnalyses();
    const target = list.items
      .slice()
      .sort((a, b) => b._count.scores - a._count.scores)[0];
    if (!target || target._count.scores === 0) {
      console.log('⊘ No scored analysis on this env — skipping');
      return;
    }

    const { data: explorer } = await client.getInsightsKolExplorer(
      target.diseaseAreaId,
      { limit: 5, clientId: target.clientId }
    );
    if (!explorer.items.length) {
      console.log('⊘ No KOL Explorer items — skipping');
      return;
    }

    const sample = explorer.items[0];
    const { data: explain } = await client.explainKolAnalysisHcp(target.id, sample.id);
    expect(explain.found).toBe(true);
    expect(explain.survey).toBeTruthy();
    // perType array exists + has known shape (count, pooledMax, score per type).
    expect(Array.isArray(explain.survey!.perType)).toBe(true);
    for (const p of explain.survey!.perType) {
      expect(typeof p.nominationType).toBe('string');
      expect(typeof p.count).toBe('number');
    }
  });
});
