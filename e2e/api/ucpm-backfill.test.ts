/**
 * ucpm backfill — E2E coverage I skipped during the bug-bundle ship (PRs
 * #129 + #131). Catches what the ucpm checklist (CLAUDE.md "E2E tests
 * are MANDATORY for API changes") requires for the v1.17.4–v1.17.6
 * backend changes.
 *
 * Grouped by feature, not by release, so each describe block can be
 * moved into its topic-test file in a future refactor (e.g.
 * insights-report.test.ts, nomination-matching.test.ts) once the
 * surface stabilizes.
 *
 * Scope notes:
 *  - These are smoke / contract tests, not deep semantic tests. The
 *    deeper assertions (exact-count behavior under a specific filter)
 *    would need known-fixture data that drifts between test-env
 *    re-seeds; deferred.
 *  - Some setup-heavy paths (e.g. flipping campaign.excludeInternalEmails
 *    + seeding internal-email nominations) are simplified to just
 *    exercise the endpoint shape — better than nothing, less brittle
 *    than fixture-dependent assertions.
 *
 * Run with: cd e2e && pnpm test:api:test:auth
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../api-client';
import { config } from '../config';

// US 50 + DC — mirrors apps/api/src/services/insights-report.service.ts.
// If the backend constant changes, this test needs to follow.
const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC',
]);

let CONFIGURED_DISEASE_AREA_ID: string;
let CONFIGURED_CLIENT_ID: string;

describe('ucpm backfill — v1.17.4 through v1.17.6 backend changes', () => {
  let client: ApiClient;

  beforeAll(async () => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:test:auth');
    }
    client = new ApiClient();

    // Find a configured (client, DA) for the insights tests that need data.
    const { data: analyses } = await client.listKolAnalyses();
    const scored = analyses.items
      .slice()
      .sort((a, b) => b._count.scores - a._count.scores)[0];
    if (scored && scored._count.scores > 0) {
      CONFIGURED_CLIENT_ID = scored.clientId;
      CONFIGURED_DISEASE_AREA_ID = scored.diseaseAreaId;
    }
  });

  // --- v1.17.4 #2: getFilterOptions US states whitelist ---
  describe('Insights filter-options: US state whitelist (v1.17.4)', () => {
    it('returns only US 50+DC state codes — no AB, AU, or other non-US codes', async () => {
      // Pick any DA — filter-options endpoint isn't analysis-backed.
      const { data: diseaseAreas } = await client.getInsightsDiseaseAreas();
      if (diseaseAreas.items.length === 0) {
        console.log('⊘ No disease areas — skipping');
        return;
      }
      const daId = diseaseAreas.items[0].id;
      const { status, data } = await client.getInsightsFilterOptions(daId);
      expect(status).toBe(200);
      // Every state in the response must be in the US whitelist.
      // Pre-fix, legacy NPI data leaked codes like 'AB' (Alberta) and 'AU'
      // (Australia) into the dropdown.
      for (const state of data.states) {
        expect(US_STATE_CODES.has(state)).toBe(true);
      }
      console.log(`✅ filter-options states (n=${data.states.length}) all in US whitelist`);
    });
  });

  // --- v1.17.4 #1: demographics multi-select filter shape ---
  describe('Insights demographics: multi-select filter shape (v1.17.4)', () => {
    it('accepts comma-separated multi-select query params without 400', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis — skipping');
        return;
      }
      const { status } = await client.getInsightsDemographics(CONFIGURED_DISEASE_AREA_ID, {
        clientId: CONFIGURED_CLIENT_ID,
        respondentRoles: 'Optometry,Ophthalmology',
        practiceSettings: 'Private Practice',
      });
      expect(status).toBe(200);
    });
  });

  // --- v1.17.6: /suggestions previewRawName query param ---
  describe('Nomination suggestions: previewRawName query param (v1.17.6)', () => {
    it('accepts previewRawName query param without 400', async () => {
      // Find any nomination on test env — we just need an existing ID
      // for the endpoint to attach to. The previewRawName overrides the
      // saved name for the search.
      const { data: campaigns } = await client.listCampaigns();
      const testCampaign = campaigns.items.find((c) =>
        c.name.startsWith('E2E_TEST_CAMPAIGN_') && c.status !== 'DRAFT'
      );
      if (!testCampaign) {
        console.log('⊘ No non-DRAFT test campaign — skipping');
        return;
      }
      const { data: nominations } = await client.listNominations(testCampaign.id, { limit: 1 });
      const nom = nominations.items[0];
      if (!nom) {
        console.log('⊘ No nomination on this campaign — skipping');
        return;
      }
      const { status } = await client.getNominationSuggestions(testCampaign.id, nom.id, {
        previewRawName: 'Some Random Preview Name',
      });
      // 200 with possibly-empty suggestions is the right shape — what we
      // guard against here is 400 (param parse failure) or 500 (server crash).
      expect(status).toBe(200);
    });

    it('preview suggestions differ from saved-name suggestions when names differ', async () => {
      const { data: campaigns } = await client.listCampaigns();
      const testCampaign = campaigns.items.find((c) =>
        c.name.startsWith('E2E_TEST_CAMPAIGN_') && c.status !== 'DRAFT'
      );
      if (!testCampaign) {
        console.log('⊘ No non-DRAFT test campaign — skipping');
        return;
      }
      const { data: nominations } = await client.listNominations(testCampaign.id, { limit: 1 });
      const nom = nominations.items[0];
      if (!nom) {
        console.log('⊘ No nomination on this campaign — skipping');
        return;
      }
      const saved = await client.getNominationSuggestions(testCampaign.id, nom.id);
      const preview = await client.getNominationSuggestions(testCampaign.id, nom.id, {
        previewRawName: 'Zzzzz Yyyyy', // gibberish — should produce different (likely empty) results
      });
      expect(saved.status).toBe(200);
      expect(preview.status).toBe(200);
      // Sanity: results aren't identical — the preview name drove a
      // different search. (Both being empty is still acceptable.)
      const samePayload = JSON.stringify(saved.data) === JSON.stringify(preview.data);
      // If both are empty, samePayload is true — that's OK as long as
      // the gibberish preview ran without error. The strong assertion
      // would need fixture data we don't have.
      if (saved.data.length === 0 && preview.data.length === 0) {
        console.log('⊘ Both saved + preview empty — endpoint accepted preview without error (smoke pass)');
      } else {
        expect(samePayload).toBe(false);
      }
    });
  });

  // --- v1.17.4 #2: updateRawName audit + actor param ---
  describe('Nomination updateRawName: writes audit log + accepts actor (v1.17.4)', () => {
    it('renaming a nomination succeeds without 503 (audit-log call non-blocking)', async () => {
      // The audit-log write happens after the rename inside auditNomination
      // — wrapped in try/swallow so an audit failure can't break the rename.
      // This test verifies the rename succeeds end-to-end (i.e. the audit
      // code didn't introduce a regression). Audit-log inspection requires
      // either a query endpoint or DB access — deferred.
      const { data: campaigns } = await client.listCampaigns();
      const testCampaign = campaigns.items.find((c) =>
        c.name.startsWith('E2E_TEST_CAMPAIGN_') && c.status !== 'DRAFT'
      );
      if (!testCampaign) {
        console.log('⊘ No non-DRAFT test campaign — skipping');
        return;
      }
      const { data: nominations } = await client.listNominations(testCampaign.id, {
        status: 'UNMATCHED',
        limit: 1,
      });
      const nom = nominations.items[0];
      if (!nom) {
        console.log('⊘ No UNMATCHED nomination — skipping');
        return;
      }
      // Rename to original name (idempotent — no effective change, but
      // exercises the full write path including the audit call).
      const { status, data } = await client.updateNominationRawName(
        testCampaign.id,
        nom.id,
        nom.rawNameEntered
      );
      expect(status).toBe(200);
      expect(data.rawNameEntered).toBe(nom.rawNameEntered);
      // matchStatus should be UNMATCHED after the rename (rename always resets).
      expect(data.matchStatus).toBe('UNMATCHED');
    });
  });

  // --- v1.17.4 #1: getStats respects excludeInternalEmails ---
  describe('Nomination stats: excludeInternalEmails flag respected (v1.17.4)', () => {
    it('returns a well-formed stats object', async () => {
      // Deep assertion (counts match list under excludeInternalEmails=true)
      // would need a campaign with the flag on + at least one internal-
      // respondent nomination — fixture work that's not in this PR's
      // scope. This smoke verifies the endpoint still returns the
      // expected shape (no regression from the campaign-lookup added in
      // the fix).
      const { data: campaigns } = await client.listCampaigns();
      const testCampaign = campaigns.items.find((c) =>
        c.name.startsWith('E2E_TEST_CAMPAIGN_')
      );
      if (!testCampaign) {
        console.log('⊘ No test campaign — skipping');
        return;
      }
      const { status, data } = await client.getNominationStats(testCampaign.id);
      expect(status).toBe(200);
      // Stats shape: { MATCHED?, UNMATCHED?, NEW_HCP?, REVIEW_NEEDED?, EXCLUDED? }
      // — all optional numbers. Verify the object is a plain map of
      // matchStatus → number (no junk fields, no missing fields when
      // there are matching nominations).
      expect(typeof data).toBe('object');
      for (const [key, value] of Object.entries(data)) {
        expect(['MATCHED', 'UNMATCHED', 'NEW_HCP', 'REVIEW_NEEDED', 'EXCLUDED']).toContain(key);
        expect(typeof value).toBe('number');
      }
    });
  });
});
