/**
 * Insights Report API E2E Tests
 *
 * Tests the insights report endpoints that aggregate KOL data across campaigns
 * within a disease area. These endpoints power the 5-tab Insights dashboard.
 *
 * v1.17.2 contract change: 5 analysis-backed endpoints now return 400 when
 * clientId is omitted (was: silent {0,0,0, notConfigured:true} shape that
 * hid 5 latent dashboard prop-forwarding bugs for ~2 months). The 3
 * campaign-scoped endpoints (demographics,
 * kol-nomination-metadata) still accept clientId as an optional filter.
 *
 * Run with: cd e2e && pnpm test:api:test:auth
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../api-client';
import { config } from '../config';

// Dynamically discovered at startup — never hardcode prod/test row IDs in
// e2e (they differ per env and per re-seed). Prefer a DA with a backfilled
// KolAnalysis so the success-path tests exercise real data.
let DRY_EYE_DISEASE_AREA_ID: string;
// Paired (clientId, diseaseAreaId) for an analysis that actually has scores.
// Used by every analysis-backed assertion below.
let CONFIGURED_DISEASE_AREA_ID: string;
let CONFIGURED_CLIENT_ID: string;

describe('Insights Report API', () => {
  let client: ApiClient;

  beforeAll(async () => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:test:auth');
    }
    client = new ApiClient();

    const { status, data } = await client.getInsightsDiseaseAreas();
    if (status !== 200 || !data.items.length) {
      throw new Error(
        `Insights disease-areas endpoint returned no items (status ${status}). ` +
          `Cannot run insights tests without at least one disease area.`
      );
    }
    // Prefer a DA with kols, then with campaigns, then whatever's first.
    // Tie-break to "Dry Eye" by name so historical behavior is preserved
    // when that data exists.
    const sorted = data.items.slice().sort((a, b) => {
      const aHasKols = (a.kolCount ?? 0) > 0 ? 1 : 0;
      const bHasKols = (b.kolCount ?? 0) > 0 ? 1 : 0;
      if (aHasKols !== bHasKols) return bHasKols - aHasKols;
      const aHasCamp = (a.campaignCount ?? 0) > 0 ? 1 : 0;
      const bHasCamp = (b.campaignCount ?? 0) > 0 ? 1 : 0;
      if (aHasCamp !== bHasCamp) return bHasCamp - aHasCamp;
      const aIsDryEye = /dry\s*eye/i.test(a.name) ? 1 : 0;
      const bIsDryEye = /dry\s*eye/i.test(b.name) ? 1 : 0;
      return bIsDryEye - aIsDryEye;
    });
    DRY_EYE_DISEASE_AREA_ID = sorted[0].id;
    console.log(
      `✅ Insights tests pinned to DA "${sorted[0].name}" (id=${sorted[0].id}, ` +
        `kols=${sorted[0].kolCount ?? 0}, campaigns=${sorted[0].campaignCount ?? 0})`
    );

    // Find a (client, DA) pair with a configured + scored analysis so the
    // success-path assertions have real data to inspect. Falls back to the
    // most-scored analysis on whatever DA, if not on the preferred one.
    const { data: analyses } = await client.listKolAnalyses();
    const scored = analyses.items
      .slice()
      .sort((a, b) => b._count.scores - a._count.scores)[0];
    if (scored && scored._count.scores > 0) {
      CONFIGURED_CLIENT_ID = scored.clientId;
      CONFIGURED_DISEASE_AREA_ID = scored.diseaseAreaId;
      console.log(
        `✅ Configured analysis: clientId=${scored.clientId} diseaseAreaId=${scored.diseaseAreaId} scores=${scored._count.scores}`
      );
    } else {
      // No scored analysis on this env — success-path assertions will skip
      // gracefully, but contract assertions (400 on missing clientId) still run.
      console.log('⊘ No scored analysis on this env — success-path tests will skip');
    }
  });

  describe('Disease Areas Endpoint', () => {
    it('should return disease areas with campaign/KOL counts', async () => {
      const { status, data } = await client.getInsightsDiseaseAreas();

      expect(status).toBe(200);
      expect(Array.isArray(data.items)).toBe(true);

      if (data.items.length > 0) {
        const first = data.items[0];
        expect(first.id).toBeTruthy();
        expect(first.name).toBeTruthy();
        expect(typeof first.campaignCount).toBe('number');
        expect(typeof first.kolCount).toBe('number');
      }

      console.log(`✅ Disease areas: ${data.items.length} items`);
    });
  });

  describe('Summary Endpoint', () => {
    it('returns 400 when clientId is omitted (v1.17.2 contract)', async () => {
      const { status, data } = await client.getInsightsSummary(DRY_EYE_DISEASE_AREA_ID);
      expect(status).toBe(400);
      // Error envelope present (not the old silent-zero shape).
      expect((data as unknown as { error?: string }).error).toBeTruthy();
    });

    it('returns real data for a configured (client, DA) pair', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const { status, data } = await client.getInsightsSummary(
        CONFIGURED_DISEASE_AREA_ID,
        CONFIGURED_CLIENT_ID
      );
      expect(status).toBe(200);
      expect(data.notConfigured).toBeFalsy();
      expect(typeof data.totalKols).toBe('number');
      expect(data.totalKols).toBeGreaterThan(0);
      console.log(`✅ Insights summary: ${data.totalKols} KOLs, ${data.totalRespondents || 0} respondents`);
    });

    it('returns notConfigured (200) when clientId is provided but analysis is missing', async () => {
      // Reuse the seeded test client (almost certainly has no analysis for an
      // arbitrary DA — confirms the "configured but no analysis" shape still
      // works and is distinguishable from the 400 missing-clientId case).
      const fakeUnconfiguredDA = '00000000000000000000000000'; // any DA without an analysis
      const { status, data } = await client.getInsightsSummary(
        fakeUnconfiguredDA,
        CONFIGURED_CLIENT_ID ?? 'cme2e0test0client00001'
      );
      // 404 (disease area not found) is also valid behavior here — both prove
      // the endpoint isn't returning the silent-zero shape.
      expect([200, 404]).toContain(status);
      if (status === 200) {
        expect(data.notConfigured).toBe(true);
        expect(data.totalKols).toBe(0);
      }
    });

    it('should return 404 for non-existent disease area', async () => {
      const { status } = await client.getInsightsSummary(
        'non-existent-id',
        CONFIGURED_CLIENT_ID ?? 'cme2e0test0client00001'
      );
      expect([400, 404]).toContain(status);
    });
  });

  describe('Filter Options Endpoint', () => {
    it('should return available filter options', async () => {
      const { status, data } = await client.getInsightsFilterOptions(DRY_EYE_DISEASE_AREA_ID);

      expect(status).toBe(200);
      expect(Array.isArray(data.specialties)).toBe(true);
      expect(Array.isArray(data.states)).toBe(true);
      // 2026-06-02: coreFocuses added to drive the Demographics + Sociometric
      // Leaders core-focus filter dropdown (was empty pre-fix).
      expect(Array.isArray(data.coreFocuses)).toBe(true);

      console.log(
        `✅ Filter options: ${data.specialties.length} specialties, ` +
          `${data.states.length} states, ${data.coreFocuses.length} core foci`
      );
    });
  });

  // 2026-06-02: post-mortem applied. The prior contract tests only checked
  // structural shape ("byCoreFocus is an array"), which let an empty
  // array satisfy the regression. These add DB ground-truth invariants:
  //
  // (1) Cross-endpoint consistency — `summary.totalRespondents` must
  //     equal `demographics.totalRespondents` for the same (clientId, DA).
  // (2) Dedup math — both numbers must equal a Prisma-direct ground-truth
  //     query that applies the most-recent-response-per-respondent rule
  //     with per-campaign excludeInternalEmails honored.
  // (3) Data presence — when the DA's survey template includes a
  //     core-focus question and completed responses exist, `byCoreFocus`
  //     has > 0 buckets. This catches the v1.17.11 regression class
  //     where extraction returned NULL for MULTI_CHOICE questions.
  // (4) Filter-dropdown consistency — `filterOptions.coreFocuses` ⊇
  //     `demographics.byCoreFocus` (every dimension value is selectable
  //     in the filter).
  describe('Dedup contract (2026-06-02 bug bundle)', () => {
    it('summary.totalRespondents == demographics.totalRespondents (dedup-aware)', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const [summary, demographics] = await Promise.all([
        client.getInsightsSummary(CONFIGURED_DISEASE_AREA_ID, CONFIGURED_CLIENT_ID),
        client.getInsightsDemographics(CONFIGURED_DISEASE_AREA_ID, {
          clientId: CONFIGURED_CLIENT_ID,
        }),
      ]);
      expect(summary.status).toBe(200);
      expect(demographics.status).toBe(200);
      expect(summary.data.totalRespondents).toBe(demographics.data.totalRespondents);
      console.log(
        `✅ totalRespondents consistent across endpoints: ${summary.data.totalRespondents}`
      );
    });

    it('byCoreFocus is non-empty when survey has core-focus questions', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const { status, data } = await client.getInsightsDemographics(
        CONFIGURED_DISEASE_AREA_ID,
        { clientId: CONFIGURED_CLIENT_ID }
      );
      expect(status).toBe(200);
      // If there are completed responses at all (totalRespondents > 0),
      // and the survey templates for this DA include a core-focus question
      // (every realistic insights-relevant survey does), byCoreFocus must
      // have entries. An empty array is the regression signal.
      if (data.totalRespondents > 0) {
        expect(data.byCoreFocus.length).toBeGreaterThan(0);
        console.log(`✅ byCoreFocus has ${data.byCoreFocus.length} buckets`);
      } else {
        console.log('⊘ totalRespondents=0 — byCoreFocus check vacuous, skipping');
      }
    });

    it('filterOptions.coreFocuses covers every byCoreFocus value', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const [filterOpts, demographics] = await Promise.all([
        client.getInsightsFilterOptions(CONFIGURED_DISEASE_AREA_ID),
        client.getInsightsDemographics(CONFIGURED_DISEASE_AREA_ID, {
          clientId: CONFIGURED_CLIENT_ID,
        }),
      ]);
      expect(filterOpts.status).toBe(200);
      expect(demographics.status).toBe(200);

      // Every value that appears in byCoreFocus should be selectable in
      // the filter dropdown. (filterOpts.coreFocuses is DA-scoped; can be
      // a superset of any single client's byCoreFocus, never a subset.)
      const filterSet = new Set(filterOpts.data.coreFocuses);
      const dimensionValues = demographics.data.byCoreFocus.map(
        (d: { name: string }) => d.name
      );
      const missing = dimensionValues.filter((v: string) => !filterSet.has(v));
      expect(missing).toEqual([]);
      console.log(
        `✅ All ${dimensionValues.length} byCoreFocus values selectable in filter ` +
          `(${filterOpts.data.coreFocuses.length} options total)`
      );
    });
  });

  describe('KOL Explorer Endpoint', () => {
    it('returns 400 when clientId is omitted (v1.17.2 contract)', async () => {
      const { status } = await client.getInsightsKolExplorer(DRY_EYE_DISEASE_AREA_ID, {
        page: 1,
        limit: 10,
      });
      expect(status).toBe(400);
    });

    it('returns paginated KOL list when clientId is provided', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const { status, data } = await client.getInsightsKolExplorer(CONFIGURED_DISEASE_AREA_ID, {
        page: 1,
        limit: 10,
        clientId: CONFIGURED_CLIENT_ID,
      });

      expect(status).toBe(200);
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe('number');
      expect(data.total).toBeGreaterThan(0); // configured analysis must have KOLs

      const firstKol = data.items[0];
      expect(firstKol.id).toBeTruthy();
      expect(firstKol.firstName).toBeTruthy();
      expect(firstKol.lastName).toBeTruthy();

      console.log(`✅ KOL Explorer: ${data.items.length} items, ${data.total} total`);
    });

    it('should support search filter', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const { status, data } = await client.getInsightsKolExplorer(CONFIGURED_DISEASE_AREA_ID, {
        search: 'Smith',
        limit: 10,
        clientId: CONFIGURED_CLIENT_ID,
      });

      expect(status).toBe(200);
      expect(Array.isArray(data.items)).toBe(true);
      data.items.forEach((kol) => {
        const fullName = `${kol.firstName} ${kol.lastName}`.toLowerCase();
        expect(fullName).toContain('smith');
      });

      console.log(`✅ Search filter: ${data.items.length} results for "Smith"`);
    });

    // v1.17.7: regression test for the "joseph allen returns 0 records" bug.
    // Pre-fix, search was checking firstName.includes(search) || lastName.includes(search)
    // separately, so a multi-token full-name query could never match. Pick a real
    // KOL from the dataset and round-trip their full name through the search filter.
    it('matches multi-token full-name search (firstName lastName)', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const seed = await client.getInsightsKolExplorer(CONFIGURED_DISEASE_AREA_ID, {
        page: 1,
        limit: 1,
        clientId: CONFIGURED_CLIENT_ID,
      });
      if (seed.status !== 200 || seed.data.items.length === 0) {
        console.log('⊘ No KOLs to round-trip — skipping');
        return;
      }
      const seedKol = seed.data.items[0];
      const fullNameQuery = `${seedKol.firstName} ${seedKol.lastName}`;

      const { status, data } = await client.getInsightsKolExplorer(CONFIGURED_DISEASE_AREA_ID, {
        search: fullNameQuery,
        limit: 50,
        clientId: CONFIGURED_CLIENT_ID,
      });

      expect(status).toBe(200);
      expect(data.items.length).toBeGreaterThan(0);
      expect(data.items.some((k) => k.id === seedKol.id)).toBe(true);

      console.log(`✅ Full-name search "${fullNameQuery}": ${data.items.length} result(s)`);
    });

    // v1.17.7: thresholds moved from compiled const to InfluencerThreshold table.
    // Sanity-check that the refactor still produces one of the three expected
    // labels for every row. Doesn't mutate the threshold row (shared global
    // state); tuning happens out-of-band via Prisma Studio / psql.
    it('labels every KOL with a valid influencer type', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const { status, data } = await client.getInsightsKolExplorer(CONFIGURED_DISEASE_AREA_ID, {
        page: 1,
        limit: 50,
        clientId: CONFIGURED_CLIENT_ID,
      });
      expect(status).toBe(200);
      expect(data.items.length).toBeGreaterThan(0);

      const valid = new Set(['National Leaders', 'Rising Stars', 'Regional Influencers']);
      data.items.forEach((kol) => {
        expect(kol.influencerType).toBeDefined();
        expect(valid.has(kol.influencerType as string)).toBe(true);
      });

      console.log(`✅ Influencer-type labels valid for ${data.items.length} KOL(s)`);
    });
  });

  describe('Leader Rankings Endpoint', () => {
    it('returns 400 when clientId is omitted (v1.17.2 contract)', async () => {
      const { status } = await client.getInsightsLeaderRankings(DRY_EYE_DISEASE_AREA_ID, {
        nominationType: 'DISCUSSION_LEADERS',
        limit: 10,
      });
      expect(status).toBe(400);
    });

    it('returns rankings when clientId is provided', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const { status, data } = await client.getInsightsLeaderRankings(CONFIGURED_DISEASE_AREA_ID, {
        nominationType: 'DISCUSSION_LEADERS',
        limit: 10,
        clientId: CONFIGURED_CLIENT_ID,
      });

      // 200 with possibly-empty items is the right shape even if a particular
      // analysis happens to have no discussion-leader nominations.
      expect(status).toBe(200);
      expect(Array.isArray(data.items)).toBe(true);
      console.log(`✅ Leader rankings: ${data.items.length} leaders`);
    });
  });

  describe('Sociometric Summary Endpoint', () => {
    it('returns 400 when clientId is omitted (v1.17.2 contract)', async () => {
      const { status } = await client.getInsightsSociometricSummary(DRY_EYE_DISEASE_AREA_ID, {
        page: 1,
        limit: 10,
      });
      expect(status).toBe(400);
    });

    it('returns sociometric summary when clientId is provided', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const { status, data } = await client.getInsightsSociometricSummary(CONFIGURED_DISEASE_AREA_ID, {
        page: 1,
        limit: 10,
        clientId: CONFIGURED_CLIENT_ID,
      });

      expect(status).toBe(200);
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe('number');

      if (data.items.length > 0) {
        expect(data.items[0].hcpId).toBeTruthy();
      }

      console.log(`✅ Sociometric summary: ${data.items.length} items, ${data.total} total`);
    });
  });

  describe('KOL Profile Endpoint', () => {
    it('returns 400 when clientId is omitted (v1.17.2 contract)', async () => {
      const { status } = await client.getInsightsKolProfile(
        DRY_EYE_DISEASE_AREA_ID,
        'any-hcp-id'
      );
      expect(status).toBe(400);
    });

    it('returns the profile when clientId is provided', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      // First get a real HCP id from the explorer.
      const { data: explorerData } = await client.getInsightsKolExplorer(
        CONFIGURED_DISEASE_AREA_ID,
        { limit: 1, clientId: CONFIGURED_CLIENT_ID }
      );
      const testHcpId = explorerData?.items?.[0]?.id;
      if (!testHcpId) {
        console.log('⊘ No HCPs in this analysis — skipping');
        return;
      }
      const { status, data } = await client.getInsightsKolProfile(
        CONFIGURED_DISEASE_AREA_ID,
        testHcpId,
        CONFIGURED_CLIENT_ID
      );

      expect(status).toBe(200);
      expect(data.id).toBe(testHcpId);
      expect(data.scores).toBeTruthy();

      console.log(`✅ KOL profile: ${data.firstName} ${data.lastName}`);
    });

    it('should return 404 for non-existent HCP (when clientId is provided)', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const { status } = await client.getInsightsKolProfile(
        CONFIGURED_DISEASE_AREA_ID,
        'non-existent-hcp-id',
        CONFIGURED_CLIENT_ID
      );
      expect([400, 404]).toContain(status);
    });
  });

  // 2026-06-02: the /respondent-analytics endpoint and its e2e block were
  // removed in this PR. The Insights dashboard never rendered a Respondent
  // Analytics tab — the component file was orphan code, the endpoint had
  // no live consumer, and the contract test it carried locked in the
  // (broken) "1 row per CampaignHcp assignment" semantic that hid the
  // bigger respondent-counting bug elsewhere. See the PR description for
  // the dedup-rule refactor that supersedes it.

  describe('Demographics Endpoint (campaign-scoped, clientId optional)', () => {
    // Perf pass B contract checks for getDemographics. Same approach: only
    // assert invariants that hold for both the OLD and NEW impls.
    it('contract: structural invariants on Demographics shape', async () => {
      const { status, data } = await client.getInsightsDemographics(DRY_EYE_DISEASE_AREA_ID);
      expect(status).toBe(200);

      expect(typeof data.totalRespondents).toBe('number');
      expect(Array.isArray(data.byRole)).toBe(true);
      expect(Array.isArray(data.byPracticeSetting)).toBe(true);
      expect(Array.isArray(data.byCoreFocus)).toBe(true);
      expect(Array.isArray(data.byMonthlyPatients)).toBe(true);
      expect(Array.isArray(data.byDedPatients)).toBe(true);
      expect(Array.isArray(data.byYearsInPractice)).toBe(true);
      expect(Array.isArray(data.byState)).toBe(true);
      expect(Array.isArray(data.byDecile)).toBe(true);
      expect(Array.isArray(data.educationalResources)).toBe(true);
      expect(Array.isArray(data.educationalResourcesAcademic)).toBe(true);
      expect(Array.isArray(data.educationalResourcesOther)).toBe(true);
      expect(Array.isArray(data.coreFocusByPatients)).toBe(true);

      // Numeric bucket distributions are fixed-size (defined by app-side
      // range arrays — 8/6/7 entries respectively).
      expect(data.byMonthlyPatients.length).toBe(8);
      expect(data.byDedPatients.length).toBe(6);
      expect(data.byYearsInPractice.length).toBe(7);

      // Sum of bucket counts equals non-null answer count → percentages
      // must sum to ~100% (modulo float precision and zero-data case).
      for (const dim of [data.byMonthlyPatients, data.byDedPatients, data.byYearsInPractice]) {
        const totalCount = dim.reduce((s: number, d: { count: number }) => s + d.count, 0);
        const totalPct = dim.reduce((s: number, d: { percentage: number }) => s + d.percentage, 0);
        if (totalCount > 0) {
          expect(Math.abs(totalPct - 100)).toBeLessThan(1e-6);
        } else {
          expect(totalPct).toBe(0);
        }
      }

      // Distribution items have {name, count, percentage} shape across all dims.
      const allCat = [
        ...data.byRole, ...data.byPracticeSetting, ...data.byCoreFocus,
        ...data.byState, ...data.byDecile, ...(data.topicsDiscussed ?? []),
      ];
      for (const d of allCat) {
        expect(typeof d.name).toBe('string');
        expect(typeof d.count).toBe('number');
        expect(typeof d.percentage).toBe('number');
      }

      // Educational resources entries have rank1..5 keys.
      for (const dim of [data.educationalResources, data.educationalResourcesAcademic, data.educationalResourcesOther]) {
        for (const r of dim) {
          expect(typeof r.resource).toBe('string');
          for (const k of ['rank1', 'rank2', 'rank3', 'rank4', 'rank5'] as const) {
            expect(typeof r[k]).toBe('number');
          }
        }
      }

      // coreFocusByPatients entries.
      for (const c of data.coreFocusByPatients) {
        expect(typeof c.coreFocus).toBe('string');
        expect(typeof c.totalPatients).toBe('number');
        expect(typeof c.count).toBe('number');
      }

      console.log(
        `✅ Demographics invariants: totalRespondents=${data.totalRespondents}, ` +
          `${data.byRole.length} roles, ${data.byPracticeSetting.length} settings, ` +
          `${data.byState.length} states, ${data.byDecile.length} deciles`
      );
    });
  });
});
