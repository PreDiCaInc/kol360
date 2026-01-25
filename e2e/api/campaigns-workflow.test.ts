/**
 * Campaign Workflow E2E Tests
 *
 * Tests the full campaign lifecycle:
 * 1. Create campaign
 * 2. Assign HCPs
 * 3. Send invitations (optional)
 * 4. Check stats
 * 5. Cleanup
 *
 * Requires:
 * - Test data to be seeded (run: pnpm e2e:seed)
 * - E2E_AUTH_TOKEN environment variable for authenticated requests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { config } from '../config';
import { ApiClient } from '../api-client';
import { TEST_IDS, generateTestCampaignName } from '../fixtures';

// Skip all tests if no auth token
const skipIfNoAuth = !config.authToken;

describe.skipIf(skipIfNoAuth)('Campaign Workflow E2E', () => {
  let api: ApiClient;
  let testCampaignId: string | null = null;

  beforeAll(() => {
    api = new ApiClient();
    console.log(`Testing against: ${config.apiUrl}`);
  });

  afterAll(async () => {
    // Cleanup: delete test campaign if it was created
    // Skip cleanup if SKIP_CLEANUP=true (to inspect test data)
    if (process.env.SKIP_CLEANUP === 'true') {
      console.log(`Skipping cleanup - campaign ${testCampaignId} left for inspection`);
      return;
    }
    if (testCampaignId) {
      try {
        await api.cleanupTestCampaign(testCampaignId);
        console.log(`Cleaned up test campaign: ${testCampaignId}`);
      } catch (error) {
        console.warn(`Failed to cleanup campaign ${testCampaignId}:`, error);
      }
    }
  });

  describe('Step 1: Create Campaign', () => {
    it('should create a new test campaign', async () => {
      const campaignName = generateTestCampaignName();

      const { status, data } = await api.createCampaign({
        name: campaignName,
        clientId: TEST_IDS.CLIENT_ID,
        diseaseAreaId: TEST_IDS.DISEASE_AREA_ID,
        description: 'E2E Test - Full workflow test',
      });

      expect(status).toBe(201); // 201 Created is the correct status for resource creation
      expect(data).toHaveProperty('id');
      expect(data.name).toBe(campaignName);
      expect(data.clientId).toBe(TEST_IDS.CLIENT_ID);
      expect(data.diseaseAreaId).toBe(TEST_IDS.DISEASE_AREA_ID);
      expect(data.status).toBe('DRAFT');

      // Save for subsequent tests
      testCampaignId = data.id;
      console.log(`Created campaign: ${testCampaignId}`);
    });

    it('should retrieve the created campaign', async () => {
      expect(testCampaignId).toBeTruthy();

      const { status, data } = await api.getCampaign(testCampaignId!);

      expect(status).toBe(200);
      expect(data.id).toBe(testCampaignId);
    });

    it('should list campaigns including the new one', async () => {
      const { status, data } = await api.listCampaigns();

      expect(status).toBe(200);
      expect(data.items).toBeInstanceOf(Array);

      const found = data.items.find((c) => c.id === testCampaignId);
      expect(found).toBeTruthy();
    });
  });

  describe('Step 2: Assign HCPs to Campaign', () => {
    it('should assign test HCPs to the campaign', async () => {
      expect(testCampaignId).toBeTruthy();

      const hcpIds = [TEST_IDS.HCP_1.id, TEST_IDS.HCP_2.id, TEST_IDS.HCP_3.id];

      const { status, data } = await api.assignHcpsToCampaign(testCampaignId!, hcpIds);

      expect(status).toBe(200);
      expect(data.added).toBe(3);
    });

    it('should list assigned HCPs', async () => {
      const { status, data } = await api.listCampaignHcps(testCampaignId!);

      expect(status).toBe(200);
      expect(data.items).toHaveLength(3);

      // Verify all test HCPs are assigned
      const assignedNpis = data.items.map((h) => h.hcp.npi);
      expect(assignedNpis).toContain(TEST_IDS.HCP_1.npi);
      expect(assignedNpis).toContain(TEST_IDS.HCP_2.npi);
      expect(assignedNpis).toContain(TEST_IDS.HCP_3.npi);
    });

    it('should not duplicate HCPs on re-assignment', async () => {
      // Try to assign same HCPs again
      const hcpIds = [TEST_IDS.HCP_1.id];

      const { status, data } = await api.assignHcpsToCampaign(testCampaignId!, hcpIds);

      // Should succeed but with 0 new assignments (already assigned)
      expect(status).toBe(200);
      expect(data.added).toBe(0);

      // Verify still only 3 HCPs
      const listResult = await api.listCampaignHcps(testCampaignId!);
      expect(listResult.data.items).toHaveLength(3);
    });
  });

  describe('Step 3: Distribution Stats', () => {
    it('should return correct distribution stats', async () => {
      const { status, data } = await api.getDistributionStats(testCampaignId!);

      expect(status).toBe(200);
      expect(data.total).toBe(3);
      expect(data.notInvited).toBe(3); // All not yet invited
      expect(data.invited).toBe(0);
      expect(data.completed).toBe(0);
    });
  });

  describe('Step 4: Update Campaign', () => {
    it('should update campaign description', async () => {
      const newDescription = 'Updated E2E Test Description';

      const { status, data } = await api.updateCampaign(testCampaignId!, {
        description: newDescription,
      });

      expect(status).toBe(200);
      expect(data.description).toBe(newDescription);
    });
  });

  describe('Step 5: Remove HCP', () => {
    it('should remove one HCP from campaign', async () => {
      const { status } = await api.removeHcpFromCampaign(
        testCampaignId!,
        TEST_IDS.HCP_3.id
      );

      expect(status).toBe(204); // 204 No Content for successful deletion

      // Verify only 2 HCPs remain
      const listResult = await api.listCampaignHcps(testCampaignId!);
      expect(listResult.data.items).toHaveLength(2);
    });

    it('should update stats after removal', async () => {
      const { status, data } = await api.getDistributionStats(testCampaignId!);

      expect(status).toBe(200);
      expect(data.total).toBe(2);
    });
  });

  describe('Step 6: Validation', () => {
    it('should reject invalid campaign data', async () => {
      const { status } = await api.createCampaign({
        name: '', // Invalid: empty name
        clientId: TEST_IDS.CLIENT_ID,
        diseaseAreaId: TEST_IDS.DISEASE_AREA_ID,
      });

      expect(status).toBeGreaterThanOrEqual(400);
    });

    it('should reject non-existent client', async () => {
      const { status } = await api.createCampaign({
        name: 'Test Campaign',
        clientId: 'non_existent_client_id',
        diseaseAreaId: TEST_IDS.DISEASE_AREA_ID,
      });

      expect(status).toBeGreaterThanOrEqual(400);
    });
  });
});

describe.skipIf(skipIfNoAuth)('HCP Search E2E', () => {
  let api: ApiClient;

  beforeAll(() => {
    api = new ApiClient();
  });

  it('should find test HCPs by name search', async () => {
    const { status, data } = await api.listHcps({ search: 'TestDoctor' });

    expect(status).toBe(200);
    expect(data.items.length).toBeGreaterThan(0);

    const found = data.items.find((h) => h.npi === TEST_IDS.HCP_1.npi);
    expect(found).toBeTruthy();
  });

  it('should find test HCPs by NPI', async () => {
    const { status, data } = await api.listHcps({ search: TEST_IDS.HCP_2.npi });

    expect(status).toBe(200);
    expect(data.items.length).toBeGreaterThan(0);
  });

  it('should get individual HCP by ID', async () => {
    const { status, data } = await api.getHcp(TEST_IDS.HCP_1.id);

    expect(status).toBe(200);
    expect(data.npi).toBe(TEST_IDS.HCP_1.npi);
    expect(data.firstName).toBe(TEST_IDS.HCP_1.firstName);
    expect(data.lastName).toBe(TEST_IDS.HCP_1.lastName);
  });
});
