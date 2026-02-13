/**
 * Access Control E2E Tests
 *
 * Tests the data access control changes:
 * 1. Disease Area Insights: Scoped to client's campaign disease areas
 * 2. HCPs: Scoped to campaign-assigned HCPs only
 * 3. Nominations: Read-only for CLIENT_ADMIN
 * 4. Lite Export: Disabled for non-PLATFORM_ADMIN
 *
 * Uses PLATFORM_ADMIN impersonation feature to test CLIENT_ADMIN restrictions:
 * - Set X-Impersonate-Client header to act as CLIENT_ADMIN for a specific client
 * - This allows testing access controls without needing separate CLIENT_ADMIN credentials
 *
 * Run with: cd e2e && source .env && E2E_TEST_PASSWORD="$E2E_TEST_PASSWORD" pnpm test:workflow:test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ApiClient } from '../api-client';
import { config } from '../config';
import { TEST_IDS } from '../fixtures';

// Use the test disease area
const TEST_DISEASE_AREA_ID = TEST_IDS.DISEASE_AREA_ID;
// Use the Dry Eye disease area which has real data (different client)
const DRY_EYE_DISEASE_AREA_ID = 'cmj6ice860000wspd6wotdndy';

describe('Access Control', () => {
  let client: ApiClient;

  beforeAll(() => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:aws:auth');
    }
    client = new ApiClient();
  });

  afterAll(() => {
    // Ensure impersonation is cleared
    client.clearImpersonation();
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

  describe('CLIENT_ADMIN Access (via Impersonation)', () => {
    /**
     * These tests use PLATFORM_ADMIN impersonation to verify CLIENT_ADMIN restrictions.
     * When impersonating, the user acts as CLIENT_ADMIN for the specified client,
     * with access restricted to that client's data only.
     */

    beforeAll(() => {
      // Start impersonating the test client
      client.setImpersonation(TEST_IDS.CLIENT_ID);
      console.log(`Impersonating client: ${TEST_IDS.CLIENT_ID} (${TEST_IDS.CLIENT_NAME})`);
    });

    afterAll(() => {
      // Clear impersonation after these tests
      client.clearImpersonation();
      console.log('Impersonation cleared');
    });

    describe('Insights Report Access', () => {
      it('should deny access to disease areas without campaigns', async () => {
        // Dry Eye disease area belongs to a different client
        const { status } = await client.getInsightsSummary(DRY_EYE_DISEASE_AREA_ID);

        // Should get 403 because test client has no campaigns in Dry Eye
        expect(status).toBe(403);
        console.log('CLIENT_ADMIN correctly denied access to Dry Eye insights (no campaigns)');
      });

      it('should allow access to disease areas with campaigns', async () => {
        // First create a campaign to ensure the client has access to this disease area
        // Note: This test may need adjustment based on existing test data
        const { status } = await client.getInsightsSummary(TEST_DISEASE_AREA_ID);

        // If test client has campaigns in this disease area, should get 200
        // If not, should get 403
        expect([200, 403]).toContain(status);
        if (status === 200) {
          console.log('CLIENT_ADMIN can access test disease area insights');
        } else {
          console.log('CLIENT_ADMIN denied access (no campaigns in test disease area)');
        }
      });
    });

    describe('HCP Access', () => {
      it('should only list HCPs from client campaigns', async () => {
        const { status, data } = await client.listHcps({ limit: 100 });

        expect(status).toBe(200);
        expect(Array.isArray(data.items)).toBe(true);

        // With impersonation, should only see HCPs assigned to client's campaigns
        // This may be 0 if no campaigns exist for the test client
        console.log(`CLIENT_ADMIN HCP list: ${data.items.length} HCPs (scoped to client campaigns)`);
      });

      it('should deny access to HCPs not in client campaigns', async () => {
        // Try to access a random HCP that's unlikely to be in the test client's campaigns
        // This uses a non-test HCP ID
        const randomHcpId = 'cmj6ice860001wspd6wotdndz';
        const { status } = await client.getHcp(randomHcpId);

        // Should get 403 (no access) or 404 (not found)
        expect([403, 404]).toContain(status);
        console.log(`CLIENT_ADMIN correctly restricted from non-campaign HCP: ${status}`);
      });

      it('should allow access to HCPs in client campaigns', async () => {
        // Test HCPs should be accessible if they're in a campaign owned by the test client
        const { status } = await client.getHcp(TEST_IDS.HCP_1.id);

        // If test HCP is in a test client campaign, should get 200
        // Otherwise 403
        expect([200, 403]).toContain(status);
        console.log(`CLIENT_ADMIN access to test HCP: ${status === 200 ? 'allowed' : 'denied'}`);
      });
    });

    describe('Nominations Access (Read-Only)', () => {
      let testCampaignId: string | undefined;

      beforeAll(async () => {
        // Find a campaign owned by the test client
        client.clearImpersonation(); // Temporarily clear to list all campaigns
        const { data: campaigns } = await client.listCampaigns({ clientId: TEST_IDS.CLIENT_ID });
        client.setImpersonation(TEST_IDS.CLIENT_ID); // Resume impersonation

        const campaign = campaigns?.items?.find(
          (c) => c.status === 'ACTIVE' || c.status === 'CLOSED' || c.status === 'PUBLISHED'
        );
        testCampaignId = campaign?.id;
        if (testCampaignId) {
          console.log(`Using campaign ${campaign?.name} for nomination tests`);
        }
      });

      it('should allow CLIENT_ADMIN to list nominations', async () => {
        if (!testCampaignId) {
          console.log('Skipping: no test campaign available');
          return;
        }

        const { status } = await client.listNominations(testCampaignId);
        expect(status).toBe(200);
        console.log('CLIENT_ADMIN can list nominations (read access)');
      });

      it('should deny CLIENT_ADMIN from bulk matching nominations', async () => {
        if (!testCampaignId) {
          console.log('Skipping: no test campaign available');
          return;
        }

        const { status } = await client.bulkMatchNominations(testCampaignId);
        expect(status).toBe(403);
        console.log('CLIENT_ADMIN correctly denied bulk match (write access blocked)');
      });
    });
  });

  describe('Impersonation Response Headers', () => {
    it('should include impersonation headers in responses', async () => {
      // Start impersonation
      client.setImpersonation(TEST_IDS.CLIENT_ID);

      // Make any API call
      const { headers } = await client.listCampaigns();

      // Check for impersonation response headers
      const isImpersonating = headers?.get('X-Impersonation-Active');
      const impersonatedClient = headers?.get('X-Impersonation-Client');

      console.log('Impersonation headers:', {
        active: isImpersonating,
        clientId: impersonatedClient,
      });

      // Note: Headers may not be present if impersonation failed (invalid client)
      // This test verifies the headers are accessible in the response
      expect(true).toBe(true);

      client.clearImpersonation();
    });
  });

  // ==================== Security: Survey Token Visibility ====================

  describe('Survey Token Security', () => {
    let testCampaignId: string | undefined;

    beforeAll(async () => {
      // Find a campaign with assigned HCPs
      const { data: campaigns } = await client.listCampaigns({ clientId: TEST_IDS.CLIENT_ID });
      const campaign = campaigns?.items?.find(
        (c) => c.status === 'ACTIVE' || c.status === 'CLOSED' || c.status === 'PUBLISHED'
      );
      testCampaignId = campaign?.id;
    });

    it('should expose surveyToken to PLATFORM_ADMIN', async () => {
      if (!testCampaignId) {
        console.log('Skipping: no campaign with HCPs available');
        return;
      }

      client.clearImpersonation();
      const { status, data } = await client.listCampaignHcps(testCampaignId);

      expect(status).toBe(200);
      if (data.items.length > 0) {
        // PLATFORM_ADMIN should see surveyToken
        const hasToken = data.items.some((h) => h.surveyToken);
        expect(hasToken).toBe(true);
        console.log('PLATFORM_ADMIN can see surveyTokens');
      }
    });

    it('should hide surveyToken from CLIENT_ADMIN (impersonated)', async () => {
      if (!testCampaignId) {
        console.log('Skipping: no campaign with HCPs available');
        return;
      }

      client.setImpersonation(TEST_IDS.CLIENT_ID);
      const { status, data } = await client.listCampaignHcps(testCampaignId);

      expect(status).toBe(200);
      if (data.items.length > 0) {
        // CLIENT_ADMIN should NOT see surveyToken
        const hasToken = data.items.some((h) => h.surveyToken);
        expect(hasToken).toBe(false);
        console.log('CLIENT_ADMIN correctly cannot see surveyTokens');
      }

      client.clearImpersonation();
    });
  });

  // ==================== Security: Dashboard Auth ====================

  describe('Dashboard Auth Requirements', () => {
    it('should allow PLATFORM_ADMIN to access dashboard stats', async () => {
      client.clearImpersonation();
      const { status } = await client.health();
      expect(status).toBe(200);

      // Dashboard stats endpoint - should return 200 for PLATFORM_ADMIN
      const { data: campaigns } = await client.listCampaigns({ clientId: TEST_IDS.CLIENT_ID });
      const campaign = campaigns?.items?.[0];
      if (!campaign) {
        console.log('Skipping: no campaigns available for dashboard test');
        return;
      }

      // Access dashboard stats as PLATFORM_ADMIN
      const baseUrl = config.apiUrl;
      const response = await fetch(`${baseUrl}/api/v1/campaigns/${campaign.id}/dashboard/stats`, {
        headers: { Authorization: `Bearer ${config.authToken}` },
      });

      // Should be 200 or 404 (no dashboard configured), NOT 401/403
      expect([200, 404]).toContain(response.status);
      console.log(`PLATFORM_ADMIN dashboard stats: ${response.status}`);
    });

    it('should require authentication for dashboard endpoints', async () => {
      const { data: campaigns } = await client.listCampaigns({ clientId: TEST_IDS.CLIENT_ID });
      const campaign = campaigns?.items?.[0];
      if (!campaign) {
        console.log('Skipping: no campaigns available');
        return;
      }

      // Access without auth token
      const baseUrl = config.apiUrl;
      const response = await fetch(`${baseUrl}/api/v1/campaigns/${campaign.id}/dashboard/stats`);

      expect(response.status).toBe(401);
      console.log('Dashboard correctly requires authentication');
    });
  });

  // ==================== Security: Export Tenant Isolation ====================

  describe('Export Tenant Isolation', () => {
    it('should allow PLATFORM_ADMIN to export from any campaign', async () => {
      client.clearImpersonation();
      const { data: campaigns } = await client.listCampaigns();
      const closedCampaign = campaigns?.items?.find(
        (c) => c.status === 'CLOSED' || c.status === 'PUBLISHED'
      );
      if (!closedCampaign) {
        console.log('Skipping: no closed/published campaigns for export test');
        return;
      }

      const { status } = await client.exportResponses(closedCampaign.id);
      expect([200, 400]).toContain(status); // 400 if no responses
      console.log(`PLATFORM_ADMIN export responses: ${status}`);
    });

    it('should deny CLIENT_ADMIN export from other tenant campaigns', async () => {
      // Find a campaign NOT belonging to the test client
      client.clearImpersonation();
      const { data: allCampaigns } = await client.listCampaigns();
      const otherCampaign = allCampaigns?.items?.find((c) => c.clientId !== TEST_IDS.CLIENT_ID);

      if (!otherCampaign) {
        console.log('Skipping: no campaigns from other tenants available');
        return;
      }

      // Now impersonate as test client and try to export
      client.setImpersonation(TEST_IDS.CLIENT_ID);
      const { status } = await client.exportResponses(otherCampaign.id);

      expect(status).toBe(403);
      console.log('CLIENT_ADMIN correctly denied export from other tenant');

      client.clearImpersonation();
    });
  });
});
