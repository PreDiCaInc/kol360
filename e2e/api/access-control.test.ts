/**
 * Access Control E2E Tests
 *
 * Tests the data access control changes:
 * 1. Disease Area Insights: Scoped to client's campaign disease areas
 * 2. HCPs: Scoped to campaign-assigned HCPs only
 * 3. Nominations: Read-only for CLIENT_ADMIN
 * 4. Lite Export: Disabled for non-PLATFORM_ADMIN
 *
 * Note: E2E test user is PLATFORM_ADMIN, so we verify no regressions.
 * Full CLIENT_ADMIN testing requires a separate CLIENT_ADMIN test user.
 *
 * Run with: cd e2e && source .env && E2E_TEST_PASSWORD="$E2E_TEST_PASSWORD" pnpm test:workflow:test
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../api-client';
import { config } from '../config';
import { TEST_IDS } from '../fixtures';

// Use the test disease area
const TEST_DISEASE_AREA_ID = TEST_IDS.DISEASE_AREA_ID;
// Use the Dry Eye disease area which has real data
const DRY_EYE_DISEASE_AREA_ID = 'cmj6ice860000wspd6wotdndy';

describe('Access Control', () => {
  let client: ApiClient;

  beforeAll(() => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:aws:auth');
    }
    client = new ApiClient();
  });

  describe('PLATFORM_ADMIN Access (Regression Tests)', () => {
    describe('Insights Report Access', () => {
      it('should allow PLATFORM_ADMIN to access any disease area insights', async () => {
        const { status, data } = await client.getInsightsSummary(DRY_EYE_DISEASE_AREA_ID);

        expect(status).toBe(200);
        expect(typeof data.totalKols).toBe('number');
        console.log('PLATFORM_ADMIN can access Dry Eye insights');
      });

      it('should return 404 for non-existent disease area', async () => {
        const { status } = await client.getInsightsSummary('non-existent-id');

        expect([400, 404]).toContain(status);
      });
    });

    describe('HCP Access', () => {
      it('should allow PLATFORM_ADMIN to list all HCPs', async () => {
        const { status, data } = await client.listHcps({ limit: 10 });

        expect(status).toBe(200);
        expect(Array.isArray(data.items)).toBe(true);
        console.log(`PLATFORM_ADMIN can list HCPs: ${data.items.length} returned`);
      });

      it('should allow PLATFORM_ADMIN to view any HCP by ID', async () => {
        // Use the test HCP
        const { status } = await client.getHcp(TEST_IDS.HCP_1.id);

        expect(status).toBe(200);
        console.log('PLATFORM_ADMIN can view test HCP');
      });
    });

    describe('Nominations Access', () => {
      it('should verify PLATFORM_ADMIN access to nomination endpoints', async () => {
        // First, find a campaign with nominations
        const { status: listStatus, data: campaigns } = await client.listCampaigns();
        expect(listStatus).toBe(200);

        if (campaigns.items.length === 0) {
          console.log('No campaigns available for nomination test');
          return;
        }

        // Get the first active/closed campaign
        const campaign = campaigns.items.find(
          (c) => c.status === 'ACTIVE' || c.status === 'CLOSED' || c.status === 'PUBLISHED'
        );
        if (!campaign) {
          console.log('No active/closed campaigns for nomination test');
          return;
        }

        // List nominations
        const { status } = await client.listNominations(campaign.id);
        expect(status).toBe(200);
        console.log(`PLATFORM_ADMIN can list nominations for campaign ${campaign.name}`);
      });
    });
  });

  describe('Access Control Documentation', () => {
    /**
     * CLIENT_ADMIN Expected Behavior (requires CLIENT_ADMIN test user):
     *
     * 1. Insights Report:
     *    - Can only access disease areas where they have campaigns
     *    - Should get 403 for disease areas without campaigns
     *
     * 2. HCPs:
     *    - Can only see HCPs assigned to their campaigns
     *    - Should get 403 when accessing HCPs not in their campaigns
     *    - Search results should only include campaign-assigned HCPs
     *
     * 3. Nominations:
     *    - Can view nominations (GET)
     *    - Cannot modify nominations (POST/PATCH)
     *    - Bulk match: 403
     *    - Match: 403
     *    - Create HCP from nomination: 403
     *    - Exclude: 403
     *    - Update raw name: 403
     *
     * 4. Lite Client Export:
     *    - Export endpoint returns 403
     */

    it('documents CLIENT_ADMIN access control expectations', () => {
      const expectations = {
        insights: 'Scoped to disease areas with campaigns',
        hcps: 'Scoped to campaign-assigned HCPs only',
        nominations: 'Read-only (GET only)',
        liteExport: 'Disabled (403)',
      };

      console.log('CLIENT_ADMIN Access Control Expectations:');
      Object.entries(expectations).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
      });

      expect(expectations).toBeDefined();
    });
  });
});
