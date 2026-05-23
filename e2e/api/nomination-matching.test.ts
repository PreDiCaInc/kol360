/**
 * Nomination Matching E2E Tests (v1.15.14)
 *
 * Covers behavior changes from the matching-quality fixes:
 *  - Manual match always sets matchStatus=MATCHED, even when confidence < 100.
 *    Rationale: a human picked the row from the suggestion dialog; that's a
 *    confirmation, not a "needs review" signal.
 *  - bulkAutoMatch returns { matched, upgraded, total, errors } — `upgraded`
 *    counts REVIEW_NEEDED rows that were re-scored to a better candidate.
 *
 * Out of scope here (covered by unit tests):
 *  - Apostrophe normalization (D'Aversa curly vs straight)
 *  - State/specialty scoring boost
 *  - Tier 1/2/3 suggestion search
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ApiClient } from '../api-client';
import { config } from '../config';

describe('Nomination Matching (v1.15.14)', () => {
  let client: ApiClient;
  // Dedicated DRAFT campaign owned by this file. Used by the empty-array
  // input-validation tests so they don't fish from listCampaigns() and race
  // with full-workflow.test.ts cleanup running in a parallel worker.
  // The name prefix deliberately differs from E2E_TEST_CAMPAIGN_ so other
  // suites won't pick it up.
  let ownedCampaignId: string | null = null;

  beforeAll(async () => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:test:auth');
    }
    client = new ApiClient();
    const { status, data } = await client.createTestCampaign({
      name: `E2E_NOMINATION_EMPTY_INPUT_${Date.now()}`,
      description: 'Owned by nomination-matching.test.ts for input-validation tests',
    });
    if (status === 200 || status === 201) {
      ownedCampaignId = data.id;
    }
  });

  afterAll(async () => {
    if (ownedCampaignId) {
      await client.deleteCampaign(ownedCampaignId);
    }
  });

  describe('Manual match status', () => {
    // This test relies on the full-workflow having produced at least one
    // nomination on some test campaign. We scan recent test campaigns and
    // skip if no candidate row is available — the assertion still proves
    // the behavior when it runs.
    it('should mark a manual match as MATCHED even at partial confidence', async () => {
      const { data: campaigns } = await client.listCampaigns();
      const testCampaign = campaigns.items.find(c =>
        c.name.startsWith('E2E_TEST_CAMPAIGN_') && c.status !== 'DRAFT'
      );
      if (!testCampaign) {
        console.log('⊘ No active test campaign with nominations — skipping');
        return;
      }

      const { data: nominations } = await client.listNominations(testCampaign.id, {
        status: 'UNMATCHED',
        limit: 1,
      });
      const target = nominations.items[0];
      if (!target) {
        console.log('⊘ No UNMATCHED nomination available — skipping');
        return;
      }

      // Get the top suggestion (whatever score it has — partial is fine)
      const { data: suggestions } = await client.getNominationSuggestions(testCampaign.id, target.id);
      const pick = suggestions[0];
      if (!pick) {
        console.log('⊘ No suggestion for nomination — skipping');
        return;
      }

      // Pass an intentionally low confidence to prove the manual-MATCHED rule
      // works regardless of score. Pre-v1.15.14 this would have produced REVIEW_NEEDED.
      const { status, data: matched } = await client.matchNomination(testCampaign.id, target.id, {
        hcpId: pick.hcp.id,
        addAlias: false,
        matchType: 'partial',
        matchConfidence: 50,
      });

      expect(status).toBe(200);
      expect(matched.matchStatus).toBe('MATCHED');
    });
  });

  describe('Batch top-suggestions (v1.15.29)', () => {
    it('returns a topSuggestion (or null) for each requested id', async () => {
      const { data: campaigns } = await client.listCampaigns();
      const testCampaign = campaigns.items.find(c =>
        c.name.startsWith('E2E_TEST_CAMPAIGN_') && c.status !== 'DRAFT'
      );
      if (!testCampaign) {
        console.log('⊘ No active test campaign with nominations — skipping');
        return;
      }
      const { data: nominations } = await client.listNominations(testCampaign.id, {
        limit: 10,
      });
      const ids = nominations.items.map((n) => n.id);
      if (ids.length === 0) {
        console.log('⊘ No nominations on test campaign — skipping');
        return;
      }
      const { status, data } = await client.getNominationTopSuggestions(testCampaign.id, ids);
      expect(status).toBe(200);
      // Every requested id must appear in the map (value may be null).
      for (const id of ids) {
        expect(Object.prototype.hasOwnProperty.call(data, id)).toBe(true);
        const top = data[id];
        if (top !== null) {
          expect(top.hcpId).toBeTruthy();
          expect(typeof top.score).toBe('number');
          expect(top.score).toBeGreaterThanOrEqual(50);
        }
      }
      console.log(`✅ top-suggestions: ${ids.length} requested, ${ids.filter(id => data[id]).length} with candidates`);
    });

    it('rejects empty id array with 400', async () => {
      if (!ownedCampaignId) {
        throw new Error('beforeAll failed to provision the owned campaign');
      }
      const { status } = await client.getNominationTopSuggestions(ownedCampaignId, []);
      expect(status).toBe(400);
    });

    it('does not leak suggestions for nominations from another campaign', async () => {
      // Tenant-safety check: ids that don't belong to the campaignId in the URL
      // come back as null in the response, not as a real suggestion.
      const { data: campaigns } = await client.listCampaigns();
      const testCampaigns = campaigns.items.filter(c =>
        c.name.startsWith('E2E_TEST_CAMPAIGN_') && c.status !== 'DRAFT'
      );
      if (testCampaigns.length < 2) {
        console.log('⊘ Need 2 test campaigns to cross-check — skipping');
        return;
      }
      const [a, b] = testCampaigns;
      const { data: aNoms } = await client.listNominations(a.id, { limit: 1 });
      const { data: bNoms } = await client.listNominations(b.id, { limit: 1 });
      if (!aNoms.items.length || !bNoms.items.length) return;
      // Ask campaign A for campaign B's nomination — should be null.
      const { status, data } = await client.getNominationTopSuggestions(a.id, [bNoms.items[0].id]);
      expect(status).toBe(200);
      expect(data[bNoms.items[0].id]).toBeNull();
    });
  });

  describe('Bulk-accept top suggestions (v1.15.29)', () => {
    it('accepts top suggestions and returns per-row counts', async () => {
      const { data: campaigns } = await client.listCampaigns();
      const testCampaign = campaigns.items.find(c =>
        c.name.startsWith('E2E_TEST_CAMPAIGN_') && c.status !== 'DRAFT'
      );
      if (!testCampaign) {
        console.log('⊘ No active test campaign — skipping');
        return;
      }
      const { data: nominations } = await client.listNominations(testCampaign.id, {
        status: 'UNMATCHED',
        limit: 3,
      });
      const candidateIds = nominations.items.map((n) => n.id);
      if (candidateIds.length === 0) {
        console.log('⊘ No UNMATCHED nominations to bulk-accept — skipping');
        return;
      }
      const { status, data } = await client.bulkAcceptNominations(testCampaign.id, candidateIds);
      expect(status).toBe(200);
      expect(typeof data.accepted).toBe('number');
      expect(typeof data.skipped).toBe('number');
      expect(Array.isArray(data.errors)).toBe(true);
      // accepted + skipped must total the input batch size (errors are a
      // subset of attempts that crashed mid-row; they don't increment skipped).
      expect(data.accepted + data.skipped + data.errors.length).toBe(candidateIds.length);
      console.log(
        `✅ bulk-accept: ${data.accepted} accepted, ${data.skipped} skipped, ${data.errors.length} errors`
      );
    });

    it('rejects empty id array with 400', async () => {
      if (!ownedCampaignId) {
        throw new Error('beforeAll failed to provision the owned campaign');
      }
      const { status } = await client.bulkAcceptNominations(ownedCampaignId, []);
      expect(status).toBe(400);
    });
  });

  describe('createHcpFromNomination specialty enum (regression for prod-team bug 2026-05-21)', () => {
    // The pre-fix createHcpFromNominationSchema used z.string() for specialty
    // instead of hcpSpecialtySchema, letting old-form values ('Optometrist',
    // 'Ophthalmologist') slip past Zod and hit the DB CHECK constraint with
    // a raw Prisma error. This test asserts: clean 400, no Prisma leakage.
    // The UI dropdown already constrains to canonical values, but stale
    // browser tabs (during the v1.15.31 cutover) hit this path.

    it('rejects old role-form specialty with a clean 400 (not 500/Prisma error)', async () => {
      const { data: campaigns } = await client.listCampaigns();
      const testCampaign = campaigns.items.find(c =>
        c.name.startsWith('E2E_TEST_CAMPAIGN_') && c.status !== 'DRAFT'
      );
      if (!testCampaign) {
        console.log('⊘ No active test campaign — skipping');
        return;
      }
      const { data: nominations } = await client.listNominations(testCampaign.id, {
        status: 'UNMATCHED',
        limit: 1,
      });
      const target = nominations.items[0];
      if (!target) {
        console.log('⊘ No UNMATCHED nomination available — skipping');
        return;
      }

      // Synthetic 10-digit NPI in the test reserved range. The request would
      // create the HCP if Zod didn't reject it.
      const npi = `99${Math.floor(10000000 + Math.random() * 89999999)}`;
      const { status } = await client.createHcpFromNomination(testCampaign.id, target.id, {
        npi,
        firstName: 'RegressionTest',
        lastName: 'OldFormSpecialty',
        email: `regression.test.${npi}@e2etest.example.com`,
        // The bug input — old role-form value the UI no longer emits, but
        // a stale-tab user might POST. Pre-fix: 500 + Prisma error. Post-fix: 400.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        specialty: 'Optometrist' as any,
      });
      expect(status).toBe(400);
    });
  });
});
