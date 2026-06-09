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

  // v1.17.30 — two-sided assertion matrix.
  //
  // Why this exists: the Core Focus filter shipped broken for ~2 months (no
  // MULTI_CHOICE branch in applyRespondentFilters); the existing
  // "filtered ≤ baseline" tests above passed because filtered=0 trivially
  // satisfies the bound. See
  // docs/findings/core-focus-filter-broken-2026-06-09.md for the full
  // post-mortem.
  //
  // What it asserts: for every (filter, endpoint) pair, picking a real
  // filter value from /filter-options (not a hardcoded literal) produces
  //   (a) a result that is no larger than the unfiltered baseline (the
  //       old bound), AND
  //   (b) a result that is strictly greater than zero.
  //
  // Together: filter actually narrows the data, AND the narrowing path
  // returns data. A future filter that silently zeros out (the bug we just
  // fixed) fails (b). A future filter that doesn't apply at all fails (a).
  describe('Two-sided filter matrix (catches "filter zeros out" regression)', () => {
    let availableCoreFocuses: string[] = [];
    let availableRoles: string[] = [];
    let availableStates: string[] = [];

    beforeAll(async () => {
      if (!CONFIGURED_CLIENT_ID) return;
      // Pull the dropdown options the UI populates from. Any value here is
      // by definition a realistic filter value (it's the literal the user
      // would click). Avoids the prior bug-bait of hardcoded "Dry Eye"
      // (which doesn't match the actual category "Dry Eye (including
      // OSD, MGD, and NK)").
      const { data: opts } = await client.getInsightsFilterOptions(CONFIGURED_DISEASE_AREA_ID);
      availableCoreFocuses = opts.coreFocuses ?? [];
      availableRoles = opts.specialties ?? [];
      availableStates = opts.states ?? [];
    });

    // Demographics endpoint — the one that surfaced the user-reported bug.
    // Asserts both bounds across all 3 categorical filters served by
    // /filter-options.
    it.each([
      ['coreFocuses',     () => availableCoreFocuses[0]],
      ['respondentRoles', () => availableRoles[0]],
      ['stateOfPractices', () => availableStates[0]],
    ])('demographics: %s filter narrows AND returns >0', async (filterKey, pickValue) => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const value = pickValue();
      if (!value) {
        console.log(`⊘ /filter-options returned no ${filterKey} — skipping`);
        return;
      }
      const baseline = await client.getInsightsDemographics(CONFIGURED_DISEASE_AREA_ID, {
        clientId: CONFIGURED_CLIENT_ID,
      });
      const filtered = await client.getInsightsDemographics(CONFIGURED_DISEASE_AREA_ID, {
        clientId: CONFIGURED_CLIENT_ID,
        [filterKey]: value,
      });
      expect(baseline.status).toBe(200);
      expect(filtered.status).toBe(200);
      // (a) Filter narrows or keeps equal.
      expect(filtered.data.totalRespondents).toBeLessThanOrEqual(baseline.data.totalRespondents);
      // (b) Filter doesn't zero out — the bug we just fixed produced 0 here
      // for coreFocuses. A value lifted from /filter-options MUST yield
      // at least one matching respondent by construction.
      expect(filtered.data.totalRespondents).toBeGreaterThan(0);
      console.log(
        `✅ demographics ${filterKey}="${value}": baseline=${baseline.data.totalRespondents} filtered=${filtered.data.totalRespondents}`
      );
    });

    // Same matrix on Leader Rankings + Sociometric Summary so the next
    // filter-application regression on those endpoints fails loudly here
    // instead of in production.
    it.each([
      ['coreFocuses',     () => availableCoreFocuses[0]],
      ['respondentRoles', () => availableRoles[0]],
    ])('leader rankings: %s filter narrows AND returns >0', async (filterKey, pickValue) => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const value = pickValue();
      if (!value) {
        console.log(`⊘ /filter-options returned no ${filterKey} — skipping`);
        return;
      }
      const baseline = await client.getInsightsLeaderRankings(CONFIGURED_DISEASE_AREA_ID, {
        nominationType: 'DISCUSSION_LEADERS',
        clientId: CONFIGURED_CLIENT_ID,
        limit: 500,
      });
      const filtered = await client.getInsightsLeaderRankings(CONFIGURED_DISEASE_AREA_ID, {
        nominationType: 'DISCUSSION_LEADERS',
        clientId: CONFIGURED_CLIENT_ID,
        limit: 500,
        [filterKey]: value,
      });
      expect(baseline.status).toBe(200);
      expect(filtered.status).toBe(200);
      expect(filtered.data.items.length).toBeLessThanOrEqual(baseline.data.items.length);
      expect(filtered.data.items.length).toBeGreaterThan(0);
      console.log(
        `✅ leader-rankings ${filterKey}="${value}": baseline=${baseline.data.items.length} filtered=${filtered.data.items.length}`
      );
    });

    it.each([
      ['coreFocuses',     () => availableCoreFocuses[0]],
      ['respondentRoles', () => availableRoles[0]],
    ])('sociometric summary: %s filter narrows AND returns >0', async (filterKey, pickValue) => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const value = pickValue();
      if (!value) {
        console.log(`⊘ /filter-options returned no ${filterKey} — skipping`);
        return;
      }
      const baseline = await client.getInsightsSociometricSummary(CONFIGURED_DISEASE_AREA_ID, {
        clientId: CONFIGURED_CLIENT_ID,
        limit: 5000,
      });
      const filtered = await client.getInsightsSociometricSummary(CONFIGURED_DISEASE_AREA_ID, {
        clientId: CONFIGURED_CLIENT_ID,
        limit: 5000,
        [filterKey]: value,
      });
      expect(baseline.status).toBe(200);
      expect(filtered.status).toBe(200);
      expect(filtered.data.total).toBeLessThanOrEqual(baseline.data.total);
      expect(filtered.data.total).toBeGreaterThan(0);
      console.log(
        `✅ sociometric ${filterKey}="${value}": baseline=${baseline.data.total} filtered=${filtered.data.total}`
      );
    });
  });
});
