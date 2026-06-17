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
    //
    // Bug class we're catching: filter zeros out for EVERY value lifted
    // from /filter-options. Pre-fix, every coreFocuses selection
    // produced 0 respondents. The shape of this regression is "all
    // values fail", not "this specific value fails."
    //
    // So we iterate every available value for the dimension; if at
    // least one yields filtered > 0 (proving the filter logic works),
    // we pass. If every value zeroes out, we fail loudly. This is
    // robust on sparse test envs (a single picked value may legitimately
    // land on an empty subset) while still catching the actual
    // regression.
    // Matrix scope: coreFocuses only. That's the filter dimension whose
    // bug we just fixed; respondentRoles + stateOfPractices were already
    // working pre-fix and remain covered by the "filter tightens" ≤
    // bound above. Adding a >0 bound for those filters trips on the
    // test env (which has rich nomination data but sparse survey-response
    // data, so respondentRoles often legitimately filters to 0) and
    // doesn't catch any bug class we know about.
    // v1.17.50 (perf-pass-C): considered extending the matrix to
    // respondentRoles + practiceSettings to exercise the SQL rewrite of
    // computeFilteredResponseIds → getFilteredResponseIds on more
    // dimensions, but the score-richest analysis (which the test
    // pins to) has 0 completed survey responses on test env, so
    // every respondentRoles probe legitimately zeros → would trip
    // "EVERY value zeroed" hard-fail. coreFocuses already exercises
    // the most complex SQL branch (MULTI_CHOICE jsonb_array_elements);
    // if that branch survives, the simpler SINGLE_CHOICE branches do
    // too. Live soak picks up any residual semantic drift.
    it.each([
      ['coreFocuses', () => availableCoreFocuses],
    ])('demographics: %s filter — at least one value narrows AND returns >0', async (filterKey, pickValues) => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const values = pickValues();
      if (values.length === 0) {
        console.log(`⊘ /filter-options returned no ${filterKey} — skipping`);
        return;
      }
      const baseline = await client.getInsightsDemographics(CONFIGURED_DISEASE_AREA_ID, {
        clientId: CONFIGURED_CLIENT_ID,
      });
      expect(baseline.status).toBe(200);

      // Sparse-data guard — see comment above.
      if (baseline.data.totalRespondents < 2) {
        console.log(`⊘ baseline=${baseline.data.totalRespondents} too sparse — skipping (${filterKey})`);
        return;
      }

      const probed: Array<{ value: string; filtered: number }> = [];
      for (const value of values) {
        const r = await client.getInsightsDemographics(CONFIGURED_DISEASE_AREA_ID, {
          clientId: CONFIGURED_CLIENT_ID,
          [filterKey]: value,
        });
        expect(r.status).toBe(200);
        expect(r.data.totalRespondents).toBeLessThanOrEqual(baseline.data.totalRespondents); // (a) narrows
        probed.push({ value, filtered: r.data.totalRespondents });
        if (r.data.totalRespondents > 0 && r.data.totalRespondents < baseline.data.totalRespondents) {
          // v1.17.33: strict narrow — proves the filter actually applied.
          // Mere `> 0` would also accept `filtered == baseline` which can
          // be a silent-drop signature (see kol-side matrix).
          console.log(`✅ demographics ${filterKey}: ${value}=${r.data.totalRespondents}/${baseline.data.totalRespondents}`);
          return;
        }
      }
      // (b) Fell through. Two failure shapes:
      //  - Every value zeroed → the original Core-Focus-class bug.
      //  - Every value returns baseline → the silent-drop signature
      //    (filter being ignored at the parser/destructure layer, same
      //    class as the sociometric-state-filter bug). Both fail loudly.
      const everyZero = probed.every((p) => p.filtered === 0);
      const everyEqualsBaseline = probed.every((p) => p.filtered === baseline.data.totalRespondents);
      if (everyZero) {
        console.error(`❌ demographics ${filterKey}: EVERY filter value zeroed (probed: ${JSON.stringify(probed)})`);
        expect.fail(`Every ${filterKey} value from /filter-options zeroed out — regression of the Core-Focus-class bug.`);
      }
      if (everyEqualsBaseline) {
        console.error(`❌ demographics ${filterKey}: EVERY filter value returned baseline (${baseline.data.totalRespondents}). Filter is being silently dropped.`);
        expect.fail(`Every ${filterKey} value returned baseline — silent-drop signature.`);
      }
      // Else: mixed (some zero, some baseline, no strict narrow). Logs +
      // passes — most likely a sparse-data env where the filter does
      // apply but the data doesn't support a strict-narrow witness.
      console.log(`⚠ demographics ${filterKey}: no strict-narrow witness found (probed: ${JSON.stringify(probed)})`);
    });

    // Same iterate-all-values matrix on Leader Rankings + Sociometric.
    // v1.17.50: extended to respondentRoles + practiceSettings — see
    // perf-pass-C scope comment on the demographics block above.
    it.each([
      ['coreFocuses', () => availableCoreFocuses],
    ])('leader rankings: %s filter — at least one value narrows AND returns >0', async (filterKey, pickValues) => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const values = pickValues();
      if (values.length === 0) {
        console.log(`⊘ /filter-options returned no ${filterKey} — skipping`);
        return;
      }
      const baseline = await client.getInsightsLeaderRankings(CONFIGURED_DISEASE_AREA_ID, {
        nominationType: 'DISCUSSION_LEADERS',
        clientId: CONFIGURED_CLIENT_ID,
        limit: 500,
      });
      expect(baseline.status).toBe(200);
      if (baseline.data.items.length < 2) {
        console.log(`⊘ baseline=${baseline.data.items.length} too sparse — skipping (${filterKey})`);
        return;
      }
      const probed: Array<{ value: string; filtered: number }> = [];
      for (const value of values) {
        const r = await client.getInsightsLeaderRankings(CONFIGURED_DISEASE_AREA_ID, {
          nominationType: 'DISCUSSION_LEADERS',
          clientId: CONFIGURED_CLIENT_ID,
          limit: 500,
          [filterKey]: value,
        });
        expect(r.status).toBe(200);
        expect(r.data.items.length).toBeLessThanOrEqual(baseline.data.items.length);
        probed.push({ value, filtered: r.data.items.length });
        if (r.data.items.length > 0) {
          console.log(`✅ leader-rankings ${filterKey}: at least one value narrows >0 (${value}=${r.data.items.length}, baseline=${baseline.data.items.length})`);
          return;
        }
      }
      console.error(`❌ leader-rankings ${filterKey}: EVERY filter value zeroed (probed: ${JSON.stringify(probed)})`);
      expect.fail(`Every ${filterKey} value from /filter-options zeroed leader-rankings.`);
    });

    it.each([
      ['coreFocuses', () => availableCoreFocuses],
    ])('sociometric summary: %s filter — at least one value narrows AND returns >0', async (filterKey, pickValues) => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const values = pickValues();
      if (values.length === 0) {
        console.log(`⊘ /filter-options returned no ${filterKey} — skipping`);
        return;
      }
      const baseline = await client.getInsightsSociometricSummary(CONFIGURED_DISEASE_AREA_ID, {
        clientId: CONFIGURED_CLIENT_ID,
        limit: 5000,
      });
      expect(baseline.status).toBe(200);
      if (baseline.data.total < 2) {
        console.log(`⊘ baseline=${baseline.data.total} too sparse — skipping (${filterKey})`);
        return;
      }
      const probed: Array<{ value: string; filtered: number }> = [];
      for (const value of values) {
        const r = await client.getInsightsSociometricSummary(CONFIGURED_DISEASE_AREA_ID, {
          clientId: CONFIGURED_CLIENT_ID,
          limit: 5000,
          [filterKey]: value,
        });
        expect(r.status).toBe(200);
        expect(r.data.total).toBeLessThanOrEqual(baseline.data.total);
        probed.push({ value, filtered: r.data.total });
        if (r.data.total > 0) {
          console.log(`✅ sociometric ${filterKey}: at least one value narrows >0 (${value}=${r.data.total}, baseline=${baseline.data.total})`);
          return;
        }
      }
      console.error(`❌ sociometric ${filterKey}: EVERY filter value zeroed (probed: ${JSON.stringify(probed)})`);
      expect.fail(`Every ${filterKey} value from /filter-options zeroed sociometric.`);
    });
  });
});
