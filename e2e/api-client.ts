/**
 * E2E API Client
 *
 * Helper class for making authenticated API requests during e2e tests.
 */

import { config } from './config';
import { TEST_IDS, generateTestCampaignName } from './fixtures';

export class ApiClient {
  private baseUrl: string;
  private authToken: string;

  constructor(authToken?: string) {
    this.baseUrl = config.apiUrl;
    this.authToken = authToken || config.authToken;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ status: number; data: T }> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    let data: T;
    try {
      data = await response.json();
    } catch {
      data = {} as T;
    }

    return { status: response.status, data };
  }

  // Health check
  async health() {
    return this.request<{ status: string }>('GET', '/health');
  }

  // ==================== Campaigns ====================

  async listCampaigns() {
    return this.request<{ campaigns: Campaign[] }>('GET', '/api/campaigns');
  }

  async getCampaign(id: string) {
    return this.request<Campaign>('GET', `/api/campaigns/${id}`);
  }

  async createCampaign(data: CreateCampaignInput) {
    return this.request<Campaign>('POST', '/api/campaigns', data);
  }

  async updateCampaign(id: string, data: Partial<CreateCampaignInput>) {
    return this.request<Campaign>('PUT', `/api/campaigns/${id}`, data);
  }

  async deleteCampaign(id: string) {
    return this.request<void>('DELETE', `/api/campaigns/${id}`);
  }

  // ==================== Distribution (Campaign HCPs) ====================

  async listCampaignHcps(campaignId: string) {
    return this.request<{ hcps: CampaignHcp[] }>(
      'GET',
      `/api/campaigns/${campaignId}/distribution`
    );
  }

  async assignHcpsToCampaign(campaignId: string, hcpIds: string[]) {
    return this.request<{ assigned: number }>(
      'POST',
      `/api/campaigns/${campaignId}/distribution/assign`,
      { hcpIds }
    );
  }

  async removeHcpFromCampaign(campaignId: string, hcpId: string) {
    return this.request<void>(
      'DELETE',
      `/api/campaigns/${campaignId}/distribution/${hcpId}`
    );
  }

  async getDistributionStats(campaignId: string) {
    return this.request<DistributionStats>(
      'GET',
      `/api/campaigns/${campaignId}/distribution/stats`
    );
  }

  async sendInvitations(campaignId: string, hcpIds?: string[]) {
    return this.request<{ sent: number }>(
      'POST',
      `/api/campaigns/${campaignId}/distribution/send-invitations`,
      { hcpIds }
    );
  }

  // ==================== HCPs ====================

  async listHcps(params?: { search?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.limit) query.set('limit', params.limit.toString());
    const queryStr = query.toString() ? `?${query.toString()}` : '';
    return this.request<{ hcps: Hcp[] }>('GET', `/api/hcps${queryStr}`);
  }

  async getHcp(id: string) {
    return this.request<Hcp>('GET', `/api/hcps/${id}`);
  }

  // ==================== Test Helpers ====================

  /**
   * Create a test campaign with default values
   */
  async createTestCampaign(overrides?: Partial<CreateCampaignInput>) {
    return this.createCampaign({
      name: generateTestCampaignName(),
      clientId: TEST_IDS.CLIENT_ID,
      diseaseAreaId: TEST_IDS.DISEASE_AREA_ID,
      description: 'E2E Test Campaign - auto-generated',
      ...overrides,
    });
  }

  /**
   * Create a test campaign and assign all test HCPs
   */
  async createTestCampaignWithHcps() {
    const { status, data: campaign } = await this.createTestCampaign();
    if (status !== 200 && status !== 201) {
      throw new Error(`Failed to create campaign: ${status}`);
    }

    const hcpIds = [TEST_IDS.HCP_1.id, TEST_IDS.HCP_2.id, TEST_IDS.HCP_3.id];
    await this.assignHcpsToCampaign(campaign.id, hcpIds);

    return campaign;
  }

  /**
   * Clean up a test campaign and all related data
   */
  async cleanupTestCampaign(campaignId: string) {
    // Remove HCPs first
    const { data } = await this.listCampaignHcps(campaignId);
    if (data?.hcps) {
      for (const hcp of data.hcps) {
        await this.removeHcpFromCampaign(campaignId, hcp.hcpId);
      }
    }

    // Delete the campaign
    await this.deleteCampaign(campaignId);
  }
}

// ==================== Types ====================

interface Campaign {
  id: string;
  name: string;
  clientId: string;
  diseaseAreaId: string;
  status: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

interface CreateCampaignInput {
  name: string;
  clientId: string;
  diseaseAreaId: string;
  description?: string;
  honorariumAmount?: number;
  surveyOpenDate?: string;
  surveyCloseDate?: string;
}

interface CampaignHcp {
  id: string;
  campaignId: string;
  hcpId: string;
  surveyToken: string;
  emailSentAt?: string;
  hcp: Hcp;
}

interface Hcp {
  id: string;
  npi: string;
  firstName: string;
  lastName: string;
  email?: string;
  specialty?: string;
  city?: string;
  state?: string;
}

interface DistributionStats {
  total: number;
  invited: number;
  pending: number;
  completed: number;
  inProgress: number;
}
