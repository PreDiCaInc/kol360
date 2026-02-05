/**
 * E2E API Client
 *
 * Helper class for making authenticated API requests during e2e tests.
 * Covers the complete KOL360 workflow from campaign creation to payment processing.
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
    body?: unknown,
    options?: { timeout?: number; rawResponse?: boolean }
  ): Promise<{ status: number; data: T; headers?: Headers }> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {};

    // Only set Content-Type if we have a body
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const controller = new AbortController();
    const timeout = options?.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      let data: T;
      const contentType = response.headers.get('content-type');

      if (options?.rawResponse) {
        // Return raw buffer for file downloads
        const buffer = await response.arrayBuffer();
        data = buffer as unknown as T;
      } else if (contentType?.includes('application/json')) {
        try {
          data = await response.json();
        } catch {
          data = {} as T;
        }
      } else {
        data = {} as T;
      }

      return { status: response.status, data, headers: response.headers };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  // Health check
  async health() {
    return this.request<{ status: string }>('GET', '/health', undefined, { timeout: 15000 });
  }

  // ==================== Campaigns ====================

  async listCampaigns(params?: { clientId?: string; status?: string }) {
    const query = new URLSearchParams();
    if (params?.clientId) query.set('clientId', params.clientId);
    if (params?.status) query.set('status', params.status);
    const queryStr = query.toString() ? `?${query.toString()}` : '';
    return this.request<{ items: Campaign[]; pagination: Pagination }>('GET', `/api/v1/campaigns${queryStr}`);
  }

  async getCampaign(id: string) {
    return this.request<Campaign>('GET', `/api/v1/campaigns/${id}`);
  }

  async createCampaign(data: CreateCampaignInput) {
    return this.request<Campaign>('POST', '/api/v1/campaigns', data);
  }

  async updateCampaign(id: string, data: Partial<CreateCampaignInput>) {
    return this.request<Campaign>('PUT', `/api/v1/campaigns/${id}`, data);
  }

  async deleteCampaign(id: string) {
    return this.request<void>('DELETE', `/api/v1/campaigns/${id}`);
  }

  // Campaign Lifecycle
  async activateCampaign(id: string) {
    return this.request<Campaign>('POST', `/api/v1/campaigns/${id}/activate`);
  }

  async closeCampaign(id: string) {
    return this.request<Campaign>('POST', `/api/v1/campaigns/${id}/close`);
  }

  async reopenCampaign(id: string) {
    return this.request<Campaign>('POST', `/api/v1/campaigns/${id}/reopen`);
  }

  async publishCampaign(id: string) {
    return this.request<Campaign>('POST', `/api/v1/campaigns/${id}/publish`);
  }

  // Email Templates
  async getEmailTemplates(campaignId: string) {
    return this.request<EmailTemplates>('GET', `/api/v1/campaigns/${campaignId}/email-templates`);
  }

  async updateEmailTemplates(campaignId: string, data: Partial<EmailTemplates>) {
    return this.request<EmailTemplates>('PUT', `/api/v1/campaigns/${campaignId}/email-templates`, data);
  }

  // Survey Preview
  async getSurveyPreview(campaignId: string) {
    return this.request<SurveyPreview>('GET', `/api/v1/campaigns/${campaignId}/survey-preview`);
  }

  // Audit Log
  async getCampaignAuditLog(campaignId: string) {
    return this.request<{ items: AuditLogEntry[] }>('GET', `/api/v1/campaigns/${campaignId}/audit-log`);
  }

  // ==================== Distribution (Campaign HCPs) ====================

  async listCampaignHcps(campaignId: string, params?: { status?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    const queryStr = query.toString() ? `?${query.toString()}` : '';
    return this.request<{ items: CampaignHcp[]; pagination: Pagination }>(
      'GET',
      `/api/v1/campaigns/${campaignId}/distribution${queryStr}`
    );
  }

  async assignHcpsToCampaign(campaignId: string, hcpIds: string[]) {
    return this.request<{ added: number; skipped: number }>(
      'POST',
      `/api/v1/campaigns/${campaignId}/hcps`,
      { hcpIds }
    );
  }

  async removeHcpFromCampaign(campaignId: string, hcpId: string) {
    return this.request<void>(
      'DELETE',
      `/api/v1/campaigns/${campaignId}/hcps/${hcpId}`
    );
  }

  async getDistributionStats(campaignId: string) {
    return this.request<DistributionStats>(
      'GET',
      `/api/v1/campaigns/${campaignId}/distribution/stats`
    );
  }

  async sendInvitations(campaignId: string) {
    return this.request<{ sent: number; failed: number; skipped: number }>(
      'POST',
      `/api/v1/campaigns/${campaignId}/distribution/send-invitations`
    );
  }

  async sendReminders(campaignId: string, maxReminders?: number) {
    return this.request<{ sent: number; failed: number; skipped: number }>(
      'POST',
      `/api/v1/campaigns/${campaignId}/distribution/send-reminders`,
      { maxReminders }
    );
  }

  async sendSingleInvitation(campaignId: string, hcpId: string) {
    return this.request<{ success: boolean; messageId: string }>(
      'POST',
      `/api/v1/campaigns/${campaignId}/distribution/${hcpId}/send`
    );
  }

  // ==================== HCPs ====================

  async listHcps(params?: { query?: string; specialty?: string; state?: string; page?: number; limit?: number }) {
    const queryParams = new URLSearchParams();
    if (params?.query) queryParams.set('query', params.query);
    if (params?.specialty) queryParams.set('specialty', params.specialty);
    if (params?.state) queryParams.set('state', params.state);
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    const queryStr = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return this.request<{ items: Hcp[]; pagination: Pagination }>('GET', `/api/v1/hcps${queryStr}`);
  }

  async getHcp(id: string) {
    return this.request<Hcp>('GET', `/api/v1/hcps/${id}`);
  }

  async createHcp(data: CreateHcpInput) {
    return this.request<Hcp>('POST', '/api/v1/hcps', data);
  }

  async updateHcp(id: string, data: Partial<CreateHcpInput>) {
    return this.request<Hcp>('PUT', `/api/v1/hcps/${id}`, data);
  }

  async getHcpFilters() {
    return this.request<{ specialties: string[]; states: string[] }>('GET', '/api/v1/hcps/filters');
  }

  // ==================== Nominations ====================

  async listNominations(campaignId: string, params?: { status?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    const queryStr = query.toString() ? `?${query.toString()}` : '';
    return this.request<{ items: Nomination[]; pagination: Pagination }>(
      'GET',
      `/api/v1/campaigns/${campaignId}/nominations${queryStr}`
    );
  }

  async getNominationStats(campaignId: string) {
    return this.request<NominationStats>(
      'GET',
      `/api/v1/campaigns/${campaignId}/nominations/stats`
    );
  }

  async bulkMatchNominations(campaignId: string) {
    return this.request<{ matched: number; failed: number }>(
      'POST',
      `/api/v1/campaigns/${campaignId}/nominations/bulk-match`
    );
  }

  async matchNomination(campaignId: string, nominationId: string, data: { hcpId: string; addAlias?: boolean }) {
    return this.request<Nomination>(
      'POST',
      `/api/v1/campaigns/${campaignId}/nominations/${nominationId}/match`,
      data
    );
  }

  async excludeNomination(campaignId: string, nominationId: string, reason: string) {
    return this.request<Nomination>(
      'POST',
      `/api/v1/campaigns/${campaignId}/nominations/${nominationId}/exclude`,
      { reason }
    );
  }

  async createHcpFromNomination(campaignId: string, nominationId: string, data: CreateHcpInput) {
    return this.request<{ hcp: Hcp; nomination: Nomination }>(
      'POST',
      `/api/v1/campaigns/${campaignId}/nominations/${nominationId}/create-hcp`,
      data
    );
  }

  // ==================== Score Calculation ====================

  async getScores(campaignId: string) {
    return this.request<{ items: HcpCampaignScore[]; maxNominations: number; nominationTypes: string[]; total: number }>(
      'GET',
      `/api/v1/campaigns/${campaignId}/scores`
    );
  }

  async getScoreStatus(campaignId: string) {
    return this.request<ScoreStatus>(
      'GET',
      `/api/v1/campaigns/${campaignId}/scores/status`
    );
  }

  async calculateSurveyScores(campaignId: string) {
    return this.request<{ processed: number; created: number; updated: number }>(
      'POST',
      `/api/v1/campaigns/${campaignId}/scores/calculate-survey`
    );
  }

  async calculateCompositeScores(campaignId: string) {
    return this.request<{ processed: number; updated: number }>(
      'POST',
      `/api/v1/campaigns/${campaignId}/scores/calculate-composite`
    );
  }

  async calculateAllScores(campaignId: string) {
    return this.request<{
      surveyScores: { processed: number; created: number; updated: number };
      compositeScores: { processed: number; updated: number };
    }>(
      'POST',
      `/api/v1/campaigns/${campaignId}/scores/calculate-all`
    );
  }

  // ==================== Survey Taking (Public) ====================

  async getSurveyByToken(token: string) {
    return this.request<SurveyData>('GET', `/api/v1/survey/take/${token}`);
  }

  async startSurvey(token: string) {
    return this.request<{ status: string; startedAt: string }>(
      'POST',
      `/api/v1/survey/take/${token}/start`
    );
  }

  async saveSurveyProgress(token: string, answers: SurveyAnswer[]) {
    return this.request<{ saved: boolean }>(
      'POST',
      `/api/v1/survey/take/${token}/save`,
      { answers }
    );
  }

  async submitSurvey(token: string, answers: SurveyAnswer[]) {
    return this.request<{ status: string; completedAt: string }>(
      'POST',
      `/api/v1/survey/take/${token}/submit`,
      { answers }
    );
  }

  // ==================== Exports ====================

  async exportResponses(campaignId: string) {
    return this.request<ArrayBuffer>(
      'POST',
      `/api/v1/campaigns/${campaignId}/export/responses`,
      undefined,
      { rawResponse: true }
    );
  }

  async exportScores(campaignId: string) {
    return this.request<ArrayBuffer>(
      'POST',
      `/api/v1/campaigns/${campaignId}/export/scores`,
      undefined,
      { rawResponse: true }
    );
  }

  async exportPayments(campaignId: string) {
    return this.request<ArrayBuffer>(
      'POST',
      `/api/v1/campaigns/${campaignId}/export/payments`,
      undefined,
      { rawResponse: true }
    );
  }

  async reExportPayments(campaignId: string) {
    return this.request<ArrayBuffer>(
      'POST',
      `/api/v1/campaigns/${campaignId}/export/payments/reexport`,
      undefined,
      { rawResponse: true }
    );
  }

  // ==================== Payments ====================

  async listPayments(campaignId: string, params?: { status?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    const queryStr = query.toString() ? `?${query.toString()}` : '';
    return this.request<{ items: Payment[]; pagination: Pagination }>(
      'GET',
      `/api/v1/campaigns/${campaignId}/payments${queryStr}`
    );
  }

  async getPaymentStats(campaignId: string) {
    return this.request<PaymentStats>(
      'GET',
      `/api/v1/campaigns/${campaignId}/payments/stats`
    );
  }

  // ==================== Clients ====================

  async listClients() {
    return this.request<{ items: Client[]; pagination: Pagination }>('GET', '/api/v1/clients');
  }

  async getClient(id: string) {
    return this.request<Client>('GET', `/api/v1/clients/${id}`);
  }

  // ==================== Disease Areas ====================

  async listDiseaseAreas() {
    return this.request<{ items: DiseaseArea[]; pagination: Pagination }>('GET', '/api/v1/disease-areas');
  }

  // ==================== Survey Templates ====================

  async listSurveyTemplates() {
    // API returns array directly, wrap it in items for consistency
    const result = await this.request<SurveyTemplate[]>('GET', '/api/v1/survey-templates');
    return {
      status: result.status,
      data: { items: result.data },
      headers: result.headers,
    };
  }

  async getSurveyTemplate(id: string) {
    return this.request<SurveyTemplate>('GET', `/api/v1/survey-templates/${id}`);
  }

  // ==================== Test Helpers ====================

  /**
   * Create a test campaign with default values (including survey template)
   */
  async createTestCampaign(overrides?: Partial<CreateCampaignInput>) {
    return this.createCampaign({
      name: generateTestCampaignName(),
      clientId: TEST_IDS.CLIENT_ID,
      diseaseAreaId: TEST_IDS.DISEASE_AREA_ID,
      surveyTemplateId: TEST_IDS.SURVEY_TEMPLATE_ID, // Required for activation
      description: 'E2E Test Campaign - auto-generated',
      honorariumAmount: 150,
      ...overrides,
    });
  }

  /**
   * Create a test campaign and assign all test HCPs
   */
  async createTestCampaignWithHcps(hcpIds?: string[]) {
    const { status, data: campaign } = await this.createTestCampaign();
    if (status !== 200 && status !== 201) {
      throw new Error(`Failed to create campaign: ${status}`);
    }

    const ids = hcpIds || [TEST_IDS.HCP_1.id, TEST_IDS.HCP_2.id, TEST_IDS.HCP_3.id];
    await this.assignHcpsToCampaign(campaign.id, ids);

    return campaign;
  }

  /**
   * Run the full workflow: create campaign, assign HCPs, activate, send invitations
   */
  async runFullWorkflowSetup(hcpIds?: string[]) {
    // Create campaign
    const { status: createStatus, data: campaign } = await this.createTestCampaign();
    if (createStatus !== 200 && createStatus !== 201) {
      throw new Error(`Failed to create campaign: ${createStatus}`);
    }

    // Assign HCPs
    const ids = hcpIds || [TEST_IDS.HCP_1.id, TEST_IDS.HCP_2.id, TEST_IDS.HCP_3.id];
    await this.assignHcpsToCampaign(campaign.id, ids);

    // Activate campaign
    const { status: activateStatus } = await this.activateCampaign(campaign.id);
    if (activateStatus !== 200) {
      throw new Error(`Failed to activate campaign: ${activateStatus}`);
    }

    // Send invitations
    const { data: inviteResult } = await this.sendInvitations(campaign.id);

    return { campaign, inviteResult };
  }

  /**
   * Clean up a test campaign and all related data
   */
  async cleanupTestCampaign(campaignId: string) {
    // Try to get the campaign first
    const { status, data: campaign } = await this.getCampaign(campaignId);
    if (status === 404) {
      // Already deleted
      return;
    }

    // Only DRAFT campaigns can be deleted
    if (campaign.status !== 'DRAFT') {
      console.log(`Skipping cleanup of campaign ${campaignId} - status is ${campaign.status}`);
      return;
    }

    // Remove HCPs first
    const { data } = await this.listCampaignHcps(campaignId);
    if (data?.items) {
      for (const hcp of data.items) {
        await this.removeHcpFromCampaign(campaignId, hcp.hcpId);
      }
    }

    // Delete the campaign
    await this.deleteCampaign(campaignId);
  }

  /**
   * Get survey token for an HCP in a campaign
   */
  async getSurveyToken(campaignId: string, hcpId: string): Promise<string | null> {
    const { data } = await this.listCampaignHcps(campaignId);
    const hcp = data?.items?.find((h) => h.hcpId === hcpId);
    return hcp?.surveyToken || null;
  }
}

// ==================== Types ====================

export interface Campaign {
  id: string;
  name: string;
  clientId: string;
  diseaseAreaId: string;
  status: CampaignStatus;
  description?: string;
  honorariumAmount?: number;
  surveyOpenDate?: string;
  surveyCloseDate?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'PUBLISHED';

export interface CreateCampaignInput {
  name: string;
  clientId: string;
  diseaseAreaId: string;
  surveyTemplateId?: string;
  description?: string;
  honorariumAmount?: number;
  surveyOpenDate?: string;
  surveyCloseDate?: string;
}

export interface CampaignHcp {
  id: string;
  campaignId: string;
  hcpId: string;
  surveyToken: string;
  emailSentAt?: string;
  emailStatus?: string;
  responseStatus?: string;
  reminderCount?: number;
  hcp: Hcp;
}

export interface Hcp {
  id: string;
  npi: string;
  firstName: string;
  lastName: string;
  email?: string;
  specialty?: string;
  city?: string;
  state?: string;
}

export interface CreateHcpInput {
  npi: string;
  firstName: string;
  lastName: string;
  email?: string;
  specialty?: string;
  city?: string;
  state?: string;
}

export interface DistributionStats {
  total: number;
  invited: number;
  notInvited: number;
  opened: number;
  inProgress: number;
  completed: number;
  recentlySurveyed: number;
  optedOut: number;
  completionRate: number;
}

export interface Nomination {
  id: string;
  campaignId: string;
  rawNameEntered: string;
  matchStatus: 'PENDING' | 'MATCHED' | 'EXCLUDED';
  matchedHcpId?: string;
  nominationType?: string;
  nominationCount?: number;
}

export interface NominationStats {
  total: number;
  matched: number;
  pending: number;
  excluded: number;
}

export interface HcpCampaignScore {
  id: string;
  campaignId: string;
  hcpId: string;
  scoreSurvey: number;
  scoreComposite?: number;
  nominationCount: number;
  hcp: Hcp;
}

export interface ScoreStatus {
  hasScores: boolean;
  totalScores: number;
  lastCalculatedAt?: string;
}

export interface SurveyData {
  id: string;
  hcp: Hcp;
  campaign: {
    id: string;
    name: string;
    status: string;
    honorariumAmount?: number;
    surveyWelcomeTitle?: string;
    surveyWelcomeMessage?: string;
    surveyAlreadyDoneTitle?: string;
    surveyAlreadyDoneMessage?: string;
  };
  questions: SurveyQuestion[];
  response?: {
    status: string;
    answers?: SurveyAnswer[];
  };
}

export interface SurveyQuestion {
  id: string;
  text: string;
  type: string;
  section?: string;
  isRequired: boolean;
  options?: string[];
  nominationType?: string;
}

export interface SurveyAnswer {
  questionId: string;
  value: unknown;
}

export interface Payment {
  id: string;
  campaignId: string;
  hcpId: string;
  amount: number;
  status: PaymentStatus;
  exportedAt?: string;
  paidAt?: string;
  hcp: Hcp;
}

export type PaymentStatus = 'PENDING' | 'EXPORTED' | 'PAID' | 'FAILED';

export interface PaymentStats {
  total: number;
  pending: number;
  exported: number;
  paid: number;
  failed: number;
  totalAmount: number;
}

export interface EmailTemplates {
  invitationEmailSubject?: string;
  invitationEmailBody?: string;
  reminderEmailSubject?: string;
  reminderEmailBody?: string;
}

export interface SurveyPreview {
  campaignName: string;
  honorariumAmount?: number;
  welcomeTitle?: string;
  welcomeMessage?: string;
  thankYouTitle?: string;
  thankYouMessage?: string;
  questions: SurveyQuestion[];
  sections: Record<string, SurveyQuestion[]>;
  totalQuestions: number;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  newValues?: Record<string, unknown>;
  createdAt: string;
  user?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
}

export interface Client {
  id: string;
  name: string;
  createdAt: string;
}

export interface DiseaseArea {
  id: string;
  name: string;
  code: string;
  therapeuticArea?: string;
}

export interface SurveyTemplate {
  id: string;
  name: string;
  description?: string;
  sections?: Array<{
    id: string;
    sectionId: string;
    sortOrder: number;
    section?: {
      id: string;
      name: string;
      questions?: Array<{
        questionId: string;
        question?: {
          id: string;
          text: string;
          type: string;
        };
      }>;
    };
  }>;
  _count?: {
    campaigns: number;
  };
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}
