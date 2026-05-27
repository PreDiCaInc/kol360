/**
 * Insights respondent-filter smoke (v1.17.5)
 *
 * Item #3 from the 2026-05-26 bug bundle: respondent filters carry over
 * from the Demographics tab to Sociometric Leaders + Dynamic Benchmarking
 * (additive — KOL-side filters preserved). Backend recomputes counts on
 * the fly from filtered nominations.
 *
 * Smoke coverage:
 *  - Endpoints accept the new respondent-filter query params without
 *    rejecting them as unknown (parser shape matches).
 *  - Applying a recognizably-narrow respondent filter shrinks (or keeps
 *    equal — never grows) the result vs the unfiltered call. This is the
 *    minimum-truth assertion: filters tighten data, not widen.
 *
 * Deeper assertions (exact counts under a specific role filter) are
 * deferred — they'd require known-fixture data that doesn't drift between
 * test-env re-seeds.
 *
 * Run with: cd e2e && pnpm test:api:test:auth
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../api-client';
import { config } from '../config';

let CONFIGURED_DISEASE_AREA_ID: string;
let CONFIGURED_CLIENT_ID: string;

describe('Insights respondent filters (v1.17.5)', () => {
  let client: ApiClient;

  beforeAll(async () => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:test:auth');
    }
    client = new ApiClient();

    // Find a (client, DA) with a configured analysis + scores so the
    // respondent-filter assertions have data to filter against.
    const { data: analyses } = await client.listKolAnalyses();
    const scored = analyses.items
      .slice()
      .sort((a, b) => b._count.scores - a._count.scores)[0];
    if (scored && scored._count.scores > 0) {
      CONFIGURED_CLIENT_ID = scored.clientId;
      CONFIGURED_DISEASE_AREA_ID = scored.diseaseAreaId;
    }
  });

  describe('Leader Rankings — respondent filter', () => {
    it('accepts respondent-filter query params without 400', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const { status } = await client.getInsightsLeaderRankings(CONFIGURED_DISEASE_AREA_ID, {
        nominationType: 'DISCUSSION_LEADERS',
        clientId: CONFIGURED_CLIENT_ID,
        limit: 10,
        respondentRoles: 'Optometry',
        coreFocuses: 'Dry Eye',
      });
      // 200 (data found) OR empty result is fine — what we're guarding
      // against is 400 (param parse failure) or 500 (server crash).
      expect(status).toBe(200);
    });

    it('respondent-filtered result is <= unfiltered result for the same nominationType', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const baseline = await client.getInsightsLeaderRankings(CONFIGURED_DISEASE_AREA_ID, {
        nominationType: 'DISCUSSION_LEADERS',
        clientId: CONFIGURED_CLIENT_ID,
        limit: 500, // big enough to capture everything for the assertion
      });
      const filtered = await client.getInsightsLeaderRankings(CONFIGURED_DISEASE_AREA_ID, {
        nominationType: 'DISCUSSION_LEADERS',
        clientId: CONFIGURED_CLIENT_ID,
        limit: 500,
        respondentRoles: 'Optometry',
      });
      expect(baseline.status).toBe(200);
      expect(filtered.status).toBe(200);
      // Filtering tightens (or keeps equal) — never widens.
      expect(filtered.data.items.length).toBeLessThanOrEqual(baseline.data.items.length);
      console.log(
        `✅ Leader rankings respondent filter: baseline=${baseline.data.items.length} filtered=${filtered.data.items.length}`
      );
    });
  });

  describe('Sociometric Summary — respondent filter', () => {
    it('accepts respondent-filter query params without 400', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const { status } = await client.getInsightsSociometricSummary(CONFIGURED_DISEASE_AREA_ID, {
        clientId: CONFIGURED_CLIENT_ID,
        limit: 10,
        respondentRoles: 'Optometry,Ophthalmology',
        practiceSettings: 'Private Practice',
      });
      expect(status).toBe(200);
    });

    it('respondent-filtered result is <= unfiltered result', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const baseline = await client.getInsightsSociometricSummary(CONFIGURED_DISEASE_AREA_ID, {
        clientId: CONFIGURED_CLIENT_ID,
        limit: 5000,
      });
      const filtered = await client.getInsightsSociometricSummary(CONFIGURED_DISEASE_AREA_ID, {
        clientId: CONFIGURED_CLIENT_ID,
        limit: 5000,
        respondentRoles: 'Optometry',
      });
      expect(baseline.status).toBe(200);
      expect(filtered.status).toBe(200);
      expect(filtered.data.total).toBeLessThanOrEqual(baseline.data.total);
      console.log(
        `✅ Sociometric respondent filter: baseline.total=${baseline.data.total} filtered.total=${filtered.data.total}`
      );
    });
  });
});
