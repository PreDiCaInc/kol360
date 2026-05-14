/**
 * Opt-Out E2E Tests
 *
 * Verifies the email-based opt-out lookup behavior. Email is the canonical key —
 * opt-outs are stored against the HCP's email address and surfaced wherever the
 * same email appears (survey-status display, HCP filter, opt-out list).
 *
 * Background: previously some queries filtered opt-outs by hcpId, which:
 *  - missed email-link unsubscribes (only email, no hcpId)
 *  - behaved inconsistently when multiple HCP records shared an email
 *  - broke when an HCP record was re-imported and got a new id
 *
 * This file covers the API surface affected by the fix:
 *  - POST /api/v1/admin/opt-outs/hcp/:hcpId       (opt out + audit)
 *  - POST /api/v1/admin/opt-outs/:id/resubscribe  (reverse)
 *  - GET  /api/v1/admin/opt-outs                  (list with filters)
 *  - GET  /api/v1/campaigns/:id/survey-status     (surfaces optOutId/optOutScope by email)
 *  - GET  /api/v1/hcps?optOutStatus=...           (filter by email-keyed opt-out)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ApiClient, Campaign } from '../api-client';
import { config } from '../config';
import { TEST_IDS } from '../fixtures';

const SKIP_CLEANUP = process.env.SKIP_CLEANUP === 'true';

// Track created opt-outs and campaigns so we can clean up
const createdOptOutIds: string[] = [];
const createdCampaignIds: string[] = [];

describe('Opt-Out API (email-based)', () => {
  let client: ApiClient;
  let testCampaign: Campaign;

  beforeAll(async () => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:test:auth');
    }
    client = new ApiClient();

    // Resubscribe any pre-existing active opt-outs for HCP_1's email. The opt-out
    // table is shared across runs, so prior failed runs can leave residue that
    // causes alreadyOptedOut=true and confuses ordering assertions below.
    const { data: existing } = await client.listOptOuts({
      search: TEST_IDS.HCP_1.email,
      status: 'active',
      limit: 50,
    });
    for (const o of existing.items) {
      if (o.email.toLowerCase() === TEST_IDS.HCP_1.email.toLowerCase()) {
        try {
          await client.resubscribeOptOut(o.id, 'E2E test setup cleanup');
        } catch {
          // ignore
        }
      }
    }

    // Create a draft campaign + assign a test HCP to exercise survey-status surface
    const campaignName = `${TEST_IDS.CAMPAIGN_PREFIX}OPT_OUT_${Date.now()}`;
    const { status, data } = await client.createCampaign({
      name: campaignName,
      clientId: TEST_IDS.CLIENT_ID,
      diseaseAreaId: TEST_IDS.DISEASE_AREA_ID,
      surveyTemplateId: TEST_IDS.SURVEY_TEMPLATE_ID,
    });
    expect(status).toBe(201);
    testCampaign = data;
    createdCampaignIds.push(testCampaign.id);

    await client.assignHcpsToCampaign(testCampaign.id, [TEST_IDS.HCP_1.id]);
  });

  afterAll(async () => {
    // Resubscribe any opt-outs we created so test data is clean
    for (const optOutId of createdOptOutIds) {
      try {
        await client.resubscribeOptOut(optOutId, 'E2E test cleanup');
      } catch {
        // ignore
      }
    }

    if (SKIP_CLEANUP) {
      console.log('\n📋 SKIP_CLEANUP=true — leaving campaigns:');
      createdCampaignIds.forEach((id) => console.log(`  - ${id}`));
      return;
    }

    for (const id of createdCampaignIds) {
      try {
        await client.cleanupTestCampaign(id);
      } catch {
        // ignore
      }
    }
  });

  describe('Opt out and resubscribe by HCP', () => {
    it('opts out HCP at GLOBAL scope with audit reason', async () => {
      const { status, data } = await client.optOutHcp(
        TEST_IDS.HCP_1.id,
        'GLOBAL',
        'E2E test: HCP requested removal via email'
      );
      expect(status).toBe(200);
      expect(data.optOut).toBeDefined();
      expect(data.optOut.scope).toBe('GLOBAL');
      expect(data.optOut.email.toLowerCase()).toBe(TEST_IDS.HCP_1.email.toLowerCase());
      createdOptOutIds.push(data.optOut.id);
    });

    it('rejects opt-out with reason shorter than 10 chars', async () => {
      const { status } = await client.optOutHcp(
        TEST_IDS.HCP_1.id,
        'GLOBAL',
        'short'
      );
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500);
    });

    it('returns alreadyOptedOut=true on duplicate global opt-out', async () => {
      const { status, data } = await client.optOutHcp(
        TEST_IDS.HCP_1.id,
        'GLOBAL',
        'E2E test: duplicate opt-out check'
      );
      expect(status).toBe(200);
      expect(data.alreadyOptedOut).toBe(true);
    });

    it('lists the opt-out via /admin/opt-outs filtered by email', async () => {
      const { status, data } = await client.listOptOuts({
        search: TEST_IDS.HCP_1.email,
        status: 'active',
      });
      expect(status).toBe(200);
      const found = data.items.find(
        (o) => o.email.toLowerCase() === TEST_IDS.HCP_1.email.toLowerCase()
      );
      expect(found).toBeDefined();
      expect(found?.scope).toBe('GLOBAL');
      expect(found?.resubscribedAt).toBeNull();
    });
  });

  describe('Email-based surfacing', () => {
    it('survey-status surfaces optOutId/optOutScope for opted-out HCP', async () => {
      const { status, data } = await client.getSurveyStatus(testCampaign.id, {
        search: TEST_IDS.HCP_1.email,
        limit: 50,
      });
      expect(status).toBe(200);
      const row = data.items.find((r) => r.hcpId === TEST_IDS.HCP_1.id);
      expect(row).toBeDefined();
      // Critical: this is the design fix — opt-out is found by EMAIL, not hcpId
      expect(row?.optOutId).not.toBeNull();
      expect(row?.optOutScope).toBe('GLOBAL');
    });

    it('filters HCPs list by optOutStatus=global (email-keyed)', async () => {
      const { status, data } = await client.listHcps({
        query: TEST_IDS.HCP_1.email,
        optOutStatus: 'global',
        limit: 50,
      });
      expect(status).toBe(200);
      const found = data.items.find((h) => h.id === TEST_IDS.HCP_1.id);
      expect(found).toBeDefined();
    });

    it('excludes opted-out HCP when filtering by optOutStatus=none', async () => {
      const { status, data } = await client.listHcps({
        query: TEST_IDS.HCP_1.email,
        optOutStatus: 'none',
        limit: 50,
      });
      expect(status).toBe(200);
      const found = data.items.find((h) => h.id === TEST_IDS.HCP_1.id);
      expect(found).toBeUndefined();
    });
  });

  describe('Resubscribe', () => {
    it('resubscribes every active opt-out for the HCP email', async () => {
      // Find all currently-active opt-outs for HCP_1 email and resubscribe each.
      // More robust than relying on a single ID from earlier in the test file.
      const { data: active } = await client.listOptOuts({
        search: TEST_IDS.HCP_1.email,
        status: 'active',
        limit: 50,
      });
      const mine = active.items.filter(
        o => o.email.toLowerCase() === TEST_IDS.HCP_1.email.toLowerCase()
      );
      expect(mine.length).toBeGreaterThan(0);

      for (const o of mine) {
        const { status, data } = await client.resubscribeOptOut(
          o.id,
          'E2E test: HCP confirmed re-opt-in'
        );
        expect(status).toBe(200);
        expect(data.resubscribedAt).toBeTruthy();
      }
    });

    it('survey-status no longer marks the HCP as opted out', async () => {
      const { status, data } = await client.getSurveyStatus(testCampaign.id, {
        search: TEST_IDS.HCP_1.email,
        limit: 50,
      });
      expect(status).toBe(200);
      const row = data.items.find((r) => r.hcpId === TEST_IDS.HCP_1.id);
      expect(row).toBeDefined();
      expect(row?.optOutId).toBeNull();
      expect(row?.optOutScope).toBeNull();
    });

    it('HCPs list optOutStatus=none now includes the HCP again', async () => {
      // Pagination: the test HCP isn't guaranteed in the first 100 results
      // when many HCPs exist. Search-narrow by email to be sure.
      const { status, data } = await client.listHcps({
        query: TEST_IDS.HCP_1.email,
        optOutStatus: 'none',
        limit: 50,
      });
      expect(status).toBe(200);
      const found = data.items.find((h) => h.id === TEST_IDS.HCP_1.id);
      expect(found).toBeDefined();
    });
  });
});
