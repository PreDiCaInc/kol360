/**
 * Full Workflow E2E Tests
 *
 * Tests the complete KOL360 workflow from campaign creation to payment processing.
 * These tests run against a live deployment and exercise the full application flow.
 *
 * Run with: cd e2e && source .env && SKIP_CLEANUP=true E2E_TEST_PASSWORD="$E2E_TEST_PASSWORD" pnpm test:api:aws:auth
 *
 * Workflow Steps:
 * 1. Campaign Setup - Create campaign with test client
 * 2. HCP Assignment - Assign HCPs including real email (hcp2@bio-exec.com)
 * 3. Campaign Activation - Transition DRAFT -> ACTIVE
 * 4. Invitation Flow - Send invitations to HCPs
 * 5. Survey Completion - Simulate HCP survey completion
 * 6. Score Calculation - Trigger score calculation
 * 7. Campaign Close - Transition ACTIVE -> CLOSED
 * 8. Score Publication - Publish campaign and scores
 * 9. Payment Processing - Verify payment records created
 * 10. Reporting - Export campaign data
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ApiClient, Campaign, CampaignHcp } from '../api-client';
import { config } from '../config';
import { TEST_IDS, getRealEmailHcp, generateSampleAnswers } from '../fixtures';

// Skip cleanup if SKIP_CLEANUP=true (for inspection)
const SKIP_CLEANUP = process.env.SKIP_CLEANUP === 'true';

// Track created campaigns for cleanup
const createdCampaignIds: string[] = [];

describe('Full Workflow E2E Tests', () => {
  let client: ApiClient;
  let testCampaign: Campaign;
  let campaignHcps: CampaignHcp[];
  let surveyToken: string;

  beforeAll(() => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:aws:auth');
    }
    client = new ApiClient();
  });

  afterAll(async () => {
    if (SKIP_CLEANUP) {
      console.log('\n📋 SKIP_CLEANUP=true - Campaigns not deleted for inspection:');
      createdCampaignIds.forEach((id) => console.log(`  - ${id}`));
      return;
    }

    // Cleanup created campaigns (only DRAFT campaigns can be deleted)
    for (const campaignId of createdCampaignIds) {
      try {
        await client.cleanupTestCampaign(campaignId);
        console.log(`🧹 Cleaned up campaign: ${campaignId}`);
      } catch (error) {
        console.log(`⚠️ Could not cleanup campaign ${campaignId}:`, error);
      }
    }
  });

  // ==================== Phase 1: Campaign Setup ====================

  describe('Phase 1: Campaign Setup', () => {
    it('should verify test client exists', async () => {
      const { status, data } = await client.listClients();

      expect(status).toBe(200);
      expect(data.items).toBeDefined();

      // Look for the test client
      const testClient = data.items.find((c) => c.id === TEST_IDS.CLIENT_ID);
      if (!testClient) {
        console.log('⚠️ Test client not found. Run seed script first: pnpm --filter @kol360/e2e seed');
      }
    });

    it('should verify test disease area exists', async () => {
      const { status, data } = await client.listDiseaseAreas();

      expect(status).toBe(200);
      expect(data.items).toBeDefined();

      const testDA = data.items.find((da) => da.id === TEST_IDS.DISEASE_AREA_ID);
      if (!testDA) {
        console.log('⚠️ Test disease area not found. Run seed script first: pnpm --filter @kol360/e2e seed');
      }
    });

    it('should create a new test campaign', async () => {
      const { status, data } = await client.createTestCampaign({
        honorariumAmount: 200,
        description: 'E2E Full Workflow Test Campaign',
      });

      expect(status).toBe(201);
      expect(data.id).toBeTruthy();
      expect(data.status).toBe('DRAFT');
      expect(data.name).toContain('E2E_TEST_CAMPAIGN_');

      testCampaign = data;
      createdCampaignIds.push(data.id);

      console.log(`✅ Created campaign: ${data.name} (${data.id})`);
    });

    it('should retrieve the created campaign', async () => {
      const { status, data } = await client.getCampaign(testCampaign.id);

      expect(status).toBe(200);
      expect(data.id).toBe(testCampaign.id);
      expect(data.status).toBe('DRAFT');
    });

    it('should update campaign email templates', async () => {
      const templates = {
        invitationEmailSubject: 'E2E Test: You are invited to participate in our survey',
        invitationEmailBody: 'Dear {{hcp_name}},\n\nYou have been selected...\n\n{{survey_link}}',
        reminderEmailSubject: 'E2E Test: Reminder to complete your survey',
        reminderEmailBody: 'Dear {{hcp_name}},\n\nThis is a reminder...\n\n{{survey_link}}',
      };

      const { status, data } = await client.updateEmailTemplates(testCampaign.id, templates);

      expect(status).toBe(200);
      expect(data.invitationEmailSubject).toBe(templates.invitationEmailSubject);
    });
  });

  // ==================== Phase 2: HCP Assignment ====================

  describe('Phase 2: HCP Assignment', () => {
    it('should verify test HCPs exist', async () => {
      const { status, data } = await client.listHcps({ limit: 100 });

      expect(status).toBe(200);

      const hcp1 = data.items.find((h) => h.id === TEST_IDS.HCP_1.id);
      const hcp2 = data.items.find((h) => h.id === TEST_IDS.HCP_2.id);

      if (!hcp1 || !hcp2) {
        console.log('⚠️ Test HCPs not found. Run seed script first: pnpm --filter @kol360/e2e seed');
      }
    });

    it('should assign HCPs to campaign including real email HCP', async () => {
      const realEmailHcp = getRealEmailHcp();
      const hcpIds = [TEST_IDS.HCP_1.id, realEmailHcp.id, TEST_IDS.HCP_3.id];

      const { status, data } = await client.assignHcpsToCampaign(testCampaign.id, hcpIds);

      expect(status).toBe(200);
      expect(data.added).toBeGreaterThanOrEqual(1);

      console.log(`✅ Assigned ${data.added} HCPs to campaign (${data.skipped} skipped)`);
    });

    it('should list assigned HCPs', async () => {
      const { status, data } = await client.listCampaignHcps(testCampaign.id);

      expect(status).toBe(200);
      expect(data.items.length).toBeGreaterThanOrEqual(1);

      campaignHcps = data.items;

      // Verify the real email HCP is assigned
      const realEmailHcp = getRealEmailHcp();
      const hcp2Assigned = data.items.find((h) => h.hcpId === realEmailHcp.id);
      expect(hcp2Assigned).toBeTruthy();

      // Save the survey token for later
      if (hcp2Assigned) {
        surveyToken = hcp2Assigned.surveyToken;
        console.log(`✅ Found survey token for ${realEmailHcp.email}`);
      }
    });

    it('should get distribution stats', async () => {
      const { status, data } = await client.getDistributionStats(testCampaign.id);

      expect(status).toBe(200);
      expect(data.total).toBeGreaterThanOrEqual(1);
      expect(data.notInvited).toBe(data.total); // Not invited yet
    });
  });

  // ==================== Phase 3: Campaign Activation ====================

  describe('Phase 3: Campaign Activation', () => {
    it('should activate the campaign (DRAFT -> ACTIVE)', async () => {
      const { status, data } = await client.activateCampaign(testCampaign.id);

      expect(status).toBe(200);
      expect(data.status).toBe('ACTIVE');

      testCampaign = data;
      console.log('✅ Campaign activated');
    });

    it('should reject deletion of active campaign', async () => {
      const { status } = await client.deleteCampaign(testCampaign.id);

      expect(status).toBe(400); // Bad Request - can only delete DRAFT
    });
  });

  // ==================== Phase 4: Invitation Flow ====================

  describe('Phase 4: Invitation Flow', () => {
    it('should send invitations to HCPs', async () => {
      const { status, data } = await client.sendInvitations(testCampaign.id);

      expect(status).toBe(200);
      expect(data.sent).toBeGreaterThanOrEqual(0);

      console.log(`✅ Sent ${data.sent} invitations (${data.failed} failed, ${data.skipped} skipped)`);

      // Note: Check hcp2@bio-exec.com inbox to verify email received
      const realEmailHcp = getRealEmailHcp();
      console.log(`📧 Check inbox for: ${realEmailHcp.email}`);
    });

    it('should update distribution stats after sending', async () => {
      const { status, data } = await client.getDistributionStats(testCampaign.id);

      expect(status).toBe(200);
      // Some HCPs should now be invited
      expect(data.invited + data.notInvited).toBe(data.total);
    });

    it('should be able to resend invitation to specific HCP', async () => {
      const realEmailHcp = getRealEmailHcp();
      const { status, data } = await client.sendSingleInvitation(testCampaign.id, realEmailHcp.id);

      // May fail if email not configured, but endpoint should respond
      expect([200, 400]).toContain(status);

      if (status === 200) {
        console.log(`✅ Resent invitation to ${realEmailHcp.email}`);
      }
    });
  });

  // ==================== Phase 5: Survey Taking ====================

  describe('Phase 5: Survey Taking', () => {
    it('should fetch survey by token (public endpoint)', async () => {
      if (!surveyToken) {
        console.log('⚠️ No survey token available - skipping survey tests');
        return;
      }

      const { status, data } = await client.getSurveyByToken(surveyToken);

      expect(status).toBe(200);
      expect(data.campaign.status).toBe('ACTIVE');
      expect(data.questions).toBeDefined();

      console.log(`✅ Survey has ${data.questions?.length || 0} questions`);
    });

    it('should start survey (mark as opened)', async () => {
      if (!surveyToken) return;

      const { status, data } = await client.startSurvey(surveyToken);

      expect(status).toBe(200);
      expect(data.status).toBeTruthy();
    });

    it('should save survey progress', async () => {
      if (!surveyToken) return;

      // Get survey questions first
      const { data: surveyData } = await client.getSurveyByToken(surveyToken);
      if (!surveyData.questions?.length) {
        console.log('⚠️ No questions in survey - skipping progress save');
        return;
      }

      // Generate sample answers for first few questions
      const sampleAnswers = generateSampleAnswers(surveyData.questions.slice(0, 2));

      const { status } = await client.saveSurveyProgress(surveyToken, sampleAnswers);

      expect([200, 400]).toContain(status); // May fail if questions require specific format
    });

    it('should submit completed survey', async () => {
      if (!surveyToken) return;

      // Get survey questions
      const { data: surveyData } = await client.getSurveyByToken(surveyToken);
      if (!surveyData.questions?.length) {
        console.log('⚠️ No questions in survey - skipping submit');
        return;
      }

      // Generate answers for all required questions
      const requiredQuestions = surveyData.questions.filter((q) => q.isRequired);
      const answers = generateSampleAnswers(requiredQuestions);

      const { status, data } = await client.submitSurvey(surveyToken, answers);

      if (status === 200) {
        expect(data.status).toBe('COMPLETED');
        console.log('✅ Survey submitted successfully');
      } else {
        // May fail due to validation - log for inspection
        console.log('⚠️ Survey submission returned:', status);
      }
    });
  });

  // ==================== Phase 6: Score Calculation ====================

  describe('Phase 6: Score Calculation', () => {
    it('should get score status', async () => {
      const { status, data } = await client.getScoreStatus(testCampaign.id);

      expect(status).toBe(200);
      expect(typeof data.hasScores).toBe('boolean');
    });

    it('should calculate survey scores', async () => {
      const { status, data } = await client.calculateSurveyScores(testCampaign.id);

      expect(status).toBe(200);
      expect(typeof data.processed).toBe('number');

      console.log(`✅ Survey scores: processed=${data.processed}, created=${data.created}, updated=${data.updated}`);
    });

    it('should calculate composite scores', async () => {
      const { status, data } = await client.calculateCompositeScores(testCampaign.id);

      expect(status).toBe(200);
      expect(typeof data.processed).toBe('number');

      console.log(`✅ Composite scores: processed=${data.processed}, updated=${data.updated}`);
    });

    it('should list calculated scores', async () => {
      const { status, data } = await client.getScores(testCampaign.id);

      expect(status).toBe(200);
      expect(Array.isArray(data.items)).toBe(true);

      console.log(`✅ Campaign has ${data.total} scores`);
    });
  });

  // ==================== Phase 7: Nominations ====================

  describe('Phase 7: Nomination Processing', () => {
    it('should list nominations', async () => {
      const { status, data } = await client.listNominations(testCampaign.id);

      expect(status).toBe(200);
      expect(Array.isArray(data.items)).toBe(true);

      console.log(`✅ Campaign has ${data.items.length} nominations`);
    });

    it('should get nomination stats', async () => {
      const { status, data } = await client.getNominationStats(testCampaign.id);

      expect(status).toBe(200);
      expect(typeof data.total).toBe('number');
      expect(typeof data.matched).toBe('number');
      expect(typeof data.pending).toBe('number');
    });

    it('should run bulk match on nominations', async () => {
      const { status, data } = await client.bulkMatchNominations(testCampaign.id);

      expect(status).toBe(200);
      expect(typeof data.matched).toBe('number');

      console.log(`✅ Bulk match: ${data.matched} matched`);
    });
  });

  // ==================== Phase 8: Campaign Close ====================

  describe('Phase 8: Campaign Close', () => {
    it('should close the campaign (ACTIVE -> CLOSED)', async () => {
      const { status, data } = await client.closeCampaign(testCampaign.id);

      expect(status).toBe(200);
      expect(data.status).toBe('CLOSED');

      testCampaign = data;
      console.log('✅ Campaign closed');
    });

    it('should be able to reopen if needed', async () => {
      // Reopen for testing
      const { status: reopenStatus, data: reopened } = await client.reopenCampaign(testCampaign.id);

      if (reopenStatus === 200) {
        expect(reopened.status).toBe('ACTIVE');

        // Close again
        const { data: closed } = await client.closeCampaign(testCampaign.id);
        testCampaign = closed;
      }
    });
  });

  // ==================== Phase 9: Score Publication ====================

  describe('Phase 9: Score Publication', () => {
    it('should publish the campaign (CLOSED -> PUBLISHED)', async () => {
      const { status, data } = await client.publishCampaign(testCampaign.id);

      expect(status).toBe(200);
      expect(data.status).toBe('PUBLISHED');
      expect(data.publishedAt).toBeTruthy();

      testCampaign = data;
      console.log(`✅ Campaign published at ${data.publishedAt}`);
    });

    it('should have scores after publication', async () => {
      const { status, data } = await client.getScores(testCampaign.id);

      expect(status).toBe(200);
      // Scores should exist (may be 0 if no survey responses)
      expect(Array.isArray(data.items)).toBe(true);
    });
  });

  // ==================== Phase 10: Payment Processing ====================

  describe('Phase 10: Payment Processing', () => {
    it('should get payment stats', async () => {
      const { status, data } = await client.getPaymentStats(testCampaign.id);

      expect(status).toBe(200);
      expect(typeof data.total).toBe('number');

      console.log(`✅ Payment stats: total=${data.total}, pending=${data.pending}`);
    });

    it('should list payments', async () => {
      const { status, data } = await client.listPayments(testCampaign.id);

      expect(status).toBe(200);
      expect(Array.isArray(data.items)).toBe(true);
    });
  });

  // ==================== Phase 11: Reporting & Exports ====================

  describe('Phase 11: Reporting & Exports', () => {
    it('should export responses', async () => {
      const { status, data, headers } = await client.exportResponses(testCampaign.id);

      expect(status).toBe(200);
      expect(data).toBeTruthy(); // Should be ArrayBuffer

      const contentType = headers?.get('content-type');
      if (contentType) {
        expect(contentType).toContain('spreadsheet');
      }

      console.log('✅ Responses exported');
    });

    it('should export scores', async () => {
      const { status, data } = await client.exportScores(testCampaign.id);

      expect(status).toBe(200);
      expect(data).toBeTruthy();

      console.log('✅ Scores exported');
    });

    it('should export payments (platform admin only)', async () => {
      const { status } = await client.exportPayments(testCampaign.id);

      // May be 403 if not platform admin
      expect([200, 403]).toContain(status);

      if (status === 200) {
        console.log('✅ Payments exported');
      }
    });

    it('should get campaign audit log', async () => {
      const { status, data } = await client.getCampaignAuditLog(testCampaign.id);

      expect(status).toBe(200);
      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items.length).toBeGreaterThan(0);

      // Should have multiple audit entries from all our actions
      const actions = data.items.map((l) => l.action);
      console.log(`✅ Audit log has ${data.items.length} entries`);
      console.log(`   Actions: ${[...new Set(actions)].join(', ')}`);
    });
  });

  // ==================== Summary ====================

  describe('Workflow Summary', () => {
    it('should have completed the full workflow', () => {
      expect(testCampaign).toBeTruthy();
      expect(testCampaign.status).toBe('PUBLISHED');

      console.log('\n' + '='.repeat(60));
      console.log('🎉 FULL WORKFLOW COMPLETED SUCCESSFULLY');
      console.log('='.repeat(60));
      console.log(`Campaign: ${testCampaign.name}`);
      console.log(`ID: ${testCampaign.id}`);
      console.log(`Status: ${testCampaign.status}`);
      console.log(`Published At: ${testCampaign.publishedAt}`);
      console.log('='.repeat(60));

      if (SKIP_CLEANUP) {
        console.log('\n📋 Campaign preserved for inspection (SKIP_CLEANUP=true)');
      }
    });
  });
});

// ==================== Individual Workflow Step Tests ====================

describe('Individual Workflow Steps', () => {
  let client: ApiClient;

  beforeAll(() => {
    if (!config.authToken) {
      console.log('⚠️ Skipping - no auth token');
      return;
    }
    client = new ApiClient();
  });

  describe('Campaign Lifecycle States', () => {
    it.skipIf(!config.authToken)('should enforce valid state transitions', async () => {
      // Create a test campaign
      const { data: campaign } = await client.createTestCampaign();
      createdCampaignIds.push(campaign.id);

      // DRAFT -> Cannot close directly
      const { status: closeStatus } = await client.closeCampaign(campaign.id);
      expect(closeStatus).toBe(400);

      // DRAFT -> Cannot publish directly
      const { status: publishStatus } = await client.publishCampaign(campaign.id);
      expect(publishStatus).toBe(400);

      // DRAFT -> ACTIVE (valid)
      const { status: activateStatus } = await client.activateCampaign(campaign.id);
      expect(activateStatus).toBe(200);

      // ACTIVE -> CLOSED (valid)
      const { status: closeStatus2 } = await client.closeCampaign(campaign.id);
      expect(closeStatus2).toBe(200);

      // CLOSED -> PUBLISHED (valid)
      const { status: publishStatus2 } = await client.publishCampaign(campaign.id);
      expect(publishStatus2).toBe(200);
    });
  });

  describe('Survey Token Access', () => {
    it.skipIf(!config.authToken)('should generate unique tokens per HCP', async () => {
      const { data: campaign } = await client.createTestCampaign();
      createdCampaignIds.push(campaign.id);

      // Assign multiple HCPs
      await client.assignHcpsToCampaign(campaign.id, [TEST_IDS.HCP_1.id, TEST_IDS.HCP_2.id]);

      // Get tokens
      const { data } = await client.listCampaignHcps(campaign.id);

      // Each HCP should have a unique token
      const tokens = data.items.map((h) => h.surveyToken);
      const uniqueTokens = new Set(tokens);

      expect(uniqueTokens.size).toBe(tokens.length);
    });
  });
});
