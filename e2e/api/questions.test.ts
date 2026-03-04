/**
 * Question API E2E Tests
 *
 * Tests for question CRUD, sorting, filtering, tags/categories endpoints,
 * and the 409 guard for editing questions used in active campaigns.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ApiClient } from '../api-client';
import { TEST_IDS } from '../fixtures';

describe('Question API', () => {
  let client: ApiClient;

  beforeAll(() => {
    client = new ApiClient();
  });

  describe('List Questions', () => {
    it('should return paginated questions', async () => {
      const { status, data } = await client.listQuestions({ limit: 10 });
      expect(status).toBe(200);
      expect(data.items).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
      expect(data.pagination).toBeDefined();
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.limit).toBe(10);
      expect(data.pagination.total).toBeGreaterThan(0);
      console.log(`✅ Listed ${data.items.length} questions (total: ${data.pagination.total})`);
    });

    it('should include createdAt on question items', async () => {
      const { status, data } = await client.listQuestions({ limit: 5 });
      expect(status).toBe(200);
      expect(data.items.length).toBeGreaterThan(0);
      for (const q of data.items) {
        expect(q.createdAt).toBeDefined();
        expect(new Date(q.createdAt).getTime()).not.toBeNaN();
      }
      console.log(`✅ All ${data.items.length} questions have valid createdAt`);
    });

    it('should support sortBy=createdAt sortOrder=asc', async () => {
      const { status, data } = await client.listQuestions({
        sortBy: 'createdAt',
        sortOrder: 'asc',
        limit: 10,
      });
      expect(status).toBe(200);
      expect(data.items.length).toBeGreaterThan(1);

      // Verify ascending order
      for (let i = 1; i < data.items.length; i++) {
        const prev = new Date(data.items[i - 1].createdAt).getTime();
        const curr = new Date(data.items[i].createdAt).getTime();
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
      console.log(`✅ Questions sorted by createdAt ASC`);
    });

    it('should support sortBy=createdAt sortOrder=desc', async () => {
      const { status, data } = await client.listQuestions({
        sortBy: 'createdAt',
        sortOrder: 'desc',
        limit: 10,
      });
      expect(status).toBe(200);
      expect(data.items.length).toBeGreaterThan(1);

      // Verify descending order
      for (let i = 1; i < data.items.length; i++) {
        const prev = new Date(data.items[i - 1].createdAt).getTime();
        const curr = new Date(data.items[i].createdAt).getTime();
        expect(curr).toBeLessThanOrEqual(prev);
      }
      console.log(`✅ Questions sorted by createdAt DESC`);
    });

    it('should filter by type', async () => {
      const { status, data } = await client.listQuestions({ type: 'RATING' });
      expect(status).toBe(200);
      for (const q of data.items) {
        expect(q.type).toBe('RATING');
      }
      console.log(`✅ Filtered by type RATING: ${data.items.length} results`);
    });

    it('should filter by tags', async () => {
      const { status, data } = await client.listQuestions({ tags: 'e2e-test' });
      expect(status).toBe(200);
      expect(data.items.length).toBeGreaterThan(0);
      for (const q of data.items) {
        expect(q.tags).toBeDefined();
        expect(q.tags).toContain('e2e-test');
      }
      console.log(`✅ Filtered by tag 'e2e-test': ${data.items.length} results`);
    });

    it('should filter by search text', async () => {
      const { status, data } = await client.listQuestions({ search: 'E2E Test Rating' });
      expect(status).toBe(200);
      expect(data.items.length).toBeGreaterThan(0);
      expect(data.items[0].text).toContain('E2E Test Rating');
      console.log(`✅ Search for 'E2E Test Rating': ${data.items.length} results`);
    });

    it('should return empty results for non-matching filters', async () => {
      const { status, data } = await client.listQuestions({ search: 'xyznonexistent12345' });
      expect(status).toBe(200);
      expect(data.items.length).toBe(0);
      expect(data.pagination.total).toBe(0);
      console.log(`✅ Non-matching search returns empty results`);
    });
  });

  describe('Get Question by ID', () => {
    it('should return a specific question', async () => {
      const { status, data } = await client.getQuestion(TEST_IDS.QUESTION_1_ID);
      expect(status).toBe(200);
      expect(data.id).toBe(TEST_IDS.QUESTION_1_ID);
      expect(data.type).toBe('RATING');
      expect(data.text).toContain('E2E Test Rating');
      console.log(`✅ Got question: ${data.text.substring(0, 50)}...`);
    });

    it('should return 404 for non-existent question', async () => {
      const { status } = await client.getQuestion('cme2e0nonexistent000001');
      expect(status).toBe(404);
      console.log(`✅ Returns 404 for non-existent question`);
    });
  });

  describe('Categories Endpoint', () => {
    it('should return question categories with counts', async () => {
      const { status, data } = await client.getQuestionCategories();
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      console.log(`✅ Categories: ${data.length} categories returned`);
    });
  });

  describe('Tags Endpoint', () => {
    it('should return question tags with counts', async () => {
      const { status, data } = await client.getQuestionTags();
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      // e2e-test tag should exist from seeded questions
      const e2eTag = data.find((t: { name: string }) => t.name === 'e2e-test');
      expect(e2eTag).toBeDefined();
      expect(e2eTag!.count).toBeGreaterThanOrEqual(3); // 3 seeded questions
      console.log(`✅ Tags: ${data.length} tags, e2e-test count=${e2eTag!.count}`);
    });
  });
});

describe('Question Edit 409 Guard', () => {
  let client: ApiClient;
  let campaignId: string | null = null;

  beforeAll(() => {
    client = new ApiClient();
  });

  afterAll(async () => {
    // Clean up test campaign
    if (campaignId) {
      try {
        await client.cleanupTestCampaign(campaignId);
        console.log(`🧹 Cleaned up 409 test campaign: ${campaignId}`);
      } catch {
        console.log(`⚠️ Failed to clean up campaign ${campaignId}`);
      }
    }
  });

  it('should setup: create and activate a campaign using test questions', async () => {
    // Create a campaign that uses the seeded survey template (which includes test questions)
    const { status, data: campaign } = await client.createTestCampaign();
    expect([200, 201]).toContain(status);
    campaignId = campaign.id;

    // Assign HCPs (required for activation)
    await client.assignHcpsToCampaign(campaign.id, [
      TEST_IDS.HCP_1.id,
      TEST_IDS.HCP_2.id,
      TEST_IDS.HCP_3.id,
    ]);

    // Activate campaign — this creates SurveyQuestion records linking questions to the active campaign
    const { status: activateStatus } = await client.activateCampaign(campaign.id);
    expect(activateStatus).toBe(200);
    console.log(`✅ Campaign ${campaign.id} activated for 409 guard tests`);
  });

  it('should return 409 when modifying text of question used in active campaign', async () => {
    if (!campaignId) {
      console.log('⚠️ Skipping: no active campaign');
      return;
    }

    const { status } = await client.updateQuestion(TEST_IDS.QUESTION_1_ID, {
      text: 'Modified text that should be blocked',
    });
    expect(status).toBe(409);
    console.log(`✅ 409 returned when modifying text of question in active campaign`);
  });

  it('should allow updating text to the same value (no actual change)', async () => {
    if (!campaignId) {
      console.log('⚠️ Skipping: no active campaign');
      return;
    }

    // First get the current text
    const { data: question } = await client.getQuestion(TEST_IDS.QUESTION_1_ID);
    const currentText = question.text;

    // Update with the exact same text — should succeed (new v1.11.0 behavior)
    const { status } = await client.updateQuestion(TEST_IDS.QUESTION_1_ID, {
      text: currentText,
    });
    expect(status).toBe(200);
    console.log(`✅ Updating text to same value succeeds (no actual change)`);
  });

  it('should allow updating non-text fields of question in active campaign', async () => {
    if (!campaignId) {
      console.log('⚠️ Skipping: no active campaign');
      return;
    }

    const { status, data } = await client.updateQuestion(TEST_IDS.QUESTION_1_ID, {
      category: 'E2E Updated Category',
    });
    expect(status).toBe(200);
    expect(data.category).toBe('E2E Updated Category');
    console.log(`✅ Non-text field update succeeds for question in active campaign`);

    // Restore the original category
    await client.updateQuestion(TEST_IDS.QUESTION_1_ID, {
      category: undefined as unknown as string,
    });
  });
});
