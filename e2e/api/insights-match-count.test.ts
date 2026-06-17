/**
 * Insights match-count endpoints (v1.17.52 / Track B Apply Filters batch UX)
 *
 * Powers the live "N match" indicator next to the Apply Filters button.
 * Three count semantics:
 *   - kols (Sociometric Summary, KOL Explorer, Benchmarking) → distinct HCPs
 *   - respondents (Demographics)                              → distinct respondents
 *   - nominators (KOL Profile drill-down)                     → distinct nominators of an HCP
 *
 * Behavioral contracts asserted:
 *   1. 200 with { count: number } shape (parser doesn't reject the type param).
 *   2. Filter narrows the count vs the unfiltered baseline (monotonic).
 *   3. Count for `type=kols` matches the `total` returned by the corresponding
 *      sociometric-summary endpoint for the SAME filter set — proves the
 *      cheap count and the full aggregation agree, which is the parity
 *      signal users care about (the indicator must not lie before Apply).
 *   4. Count for `type=respondents` matches `totalRespondents` from the
 *      demographics endpoint for the SAME filter set — same parity contract.
 *
 * Run with: cd e2e && pnpm test:api:test:auth
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../api-client';
import { config } from '../config';

let CONFIGURED_DISEASE_AREA_ID: string;
let CONFIGURED_CLIENT_ID: string;

describe('Insights match-count endpoints (v1.17.52)', () => {
  let client: ApiClient;

  beforeAll(async () => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:test:auth');
    }
    client = new ApiClient();

    const { data: analyses } = await client.listKolAnalyses();
    const scored = analyses.items
      .slice()
      .sort((a, b) => b._count.scores - a._count.scores)[0];
    if (scored && scored._count.scores > 0) {
      CONFIGURED_CLIENT_ID = scored.clientId;
      CONFIGURED_DISEASE_AREA_ID = scored.diseaseAreaId;
    }
  });

  describe('GET /:da/match-count?type=kols', () => {
    it('returns 200 + { count } shape with no filters', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const { status, data } = await client.getInsightsMatchCount(CONFIGURED_DISEASE_AREA_ID, {
        type: 'kols',
        clientId: CONFIGURED_CLIENT_ID,
      });
      expect(status).toBe(200);
      expect(typeof data.count).toBe('number');
      expect(data.count).toBeGreaterThanOrEqual(0);
    });

    it('filtered count ≤ unfiltered count', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const baseline = await client.getInsightsMatchCount(CONFIGURED_DISEASE_AREA_ID, {
        type: 'kols',
        clientId: CONFIGURED_CLIENT_ID,
      });
      const filtered = await client.getInsightsMatchCount(CONFIGURED_DISEASE_AREA_ID, {
        type: 'kols',
        clientId: CONFIGURED_CLIENT_ID,
        states: 'CA',
      });
      expect(baseline.status).toBe(200);
      expect(filtered.status).toBe(200);
      expect(filtered.data.count).toBeLessThanOrEqual(baseline.data.count);
      console.log(
        `✅ kols match-count: baseline=${baseline.data.count} states=CA → ${filtered.data.count}`
      );
    });

    // Parity contract: the cheap count MUST match the expensive full
    // aggregation's `total` for the same filter set. Failing this means
    // the indicator would lie to users before they click Apply — the
    // exact "page recomputed mid-thought" footgun the Apply pattern
    // was designed to eliminate.
    it('count agrees with sociometric-summary total for the same filter set', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      // No-filter parity (the most common live-count case: user just
      // opened the tab).
      const countRes = await client.getInsightsMatchCount(CONFIGURED_DISEASE_AREA_ID, {
        type: 'kols',
        clientId: CONFIGURED_CLIENT_ID,
      });
      const summaryRes = await client.getInsightsSociometricSummary(CONFIGURED_DISEASE_AREA_ID, {
        clientId: CONFIGURED_CLIENT_ID,
        limit: 5000,
      });
      expect(countRes.status).toBe(200);
      expect(summaryRes.status).toBe(200);
      expect(countRes.data.count).toBe(summaryRes.data.total);
      console.log(
        `✅ kols match-count parity: count=${countRes.data.count} == summary.total=${summaryRes.data.total}`
      );
    });
  });

  describe('GET /:da/match-count?type=respondents', () => {
    it('returns 200 + { count } shape', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const { status, data } = await client.getInsightsMatchCount(CONFIGURED_DISEASE_AREA_ID, {
        type: 'respondents',
        clientId: CONFIGURED_CLIENT_ID,
      });
      expect(status).toBe(200);
      expect(typeof data.count).toBe('number');
      expect(data.count).toBeGreaterThanOrEqual(0);
    });

    it('returns 400 without clientId (analysis-backed contract)', async () => {
      const { status } = await client.getInsightsMatchCount(CONFIGURED_DISEASE_AREA_ID, {
        type: 'respondents',
      });
      expect(status).toBe(400);
    });

    // Parity contract: count must equal demographics.totalRespondents
    // for the same filter set.
    it('count agrees with demographics.totalRespondents for the same filter set', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const countRes = await client.getInsightsMatchCount(CONFIGURED_DISEASE_AREA_ID, {
        type: 'respondents',
        clientId: CONFIGURED_CLIENT_ID,
      });
      const demoRes = await client.getInsightsDemographics(CONFIGURED_DISEASE_AREA_ID, {
        clientId: CONFIGURED_CLIENT_ID,
      });
      expect(countRes.status).toBe(200);
      expect(demoRes.status).toBe(200);
      expect(countRes.data.count).toBe(demoRes.data.totalRespondents);
      console.log(
        `✅ respondents match-count parity: count=${countRes.data.count} == demographics.totalRespondents=${demoRes.data.totalRespondents}`
      );
    });

    it('filter narrows the count vs baseline (when test env has non-trivial response data)', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const baseline = await client.getInsightsMatchCount(CONFIGURED_DISEASE_AREA_ID, {
        type: 'respondents',
        clientId: CONFIGURED_CLIENT_ID,
      });
      if (baseline.data.count < 2) {
        console.log(`⊘ baseline=${baseline.data.count} too sparse — skipping`);
        return;
      }
      const filtered = await client.getInsightsMatchCount(CONFIGURED_DISEASE_AREA_ID, {
        type: 'respondents',
        clientId: CONFIGURED_CLIENT_ID,
        respondentRoles: 'Optometry',
      });
      expect(filtered.status).toBe(200);
      // Filtering tightens (or keeps equal). Even strict equality is
      // acceptable on a sparse env where all respondents share one role.
      expect(filtered.data.count).toBeLessThanOrEqual(baseline.data.count);
      console.log(
        `✅ respondents match-count tightens: baseline=${baseline.data.count} → ${filtered.data.count}`
      );
    });
  });

  describe('GET /:da/kol-profile/:hcpId/match-count', () => {
    it('returns 200 + { count } shape for a real HCP', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      // Pick the top KOL from sociometric-summary to test against.
      const summary = await client.getInsightsSociometricSummary(CONFIGURED_DISEASE_AREA_ID, {
        clientId: CONFIGURED_CLIENT_ID,
        limit: 1,
      });
      if (!summary.data.items.length) {
        console.log('⊘ Empty sociometric summary — skipping');
        return;
      }
      const hcpId = summary.data.items[0].id;
      const { status, data } = await client.getInsightsNominatorMatchCount(
        CONFIGURED_DISEASE_AREA_ID,
        hcpId,
        { clientId: CONFIGURED_CLIENT_ID }
      );
      expect(status).toBe(200);
      expect(typeof data.count).toBe('number');
      expect(data.count).toBeGreaterThanOrEqual(0);
    });
  });
});
