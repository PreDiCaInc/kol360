/**
 * Insights survey-question endpoints (v1.17.53)
 *
 * Powers the (i) info popovers on the Benchmarking tab (per
 * nominationType) and the Demographics tab (per chart dimension).
 *
 * Smoke contracts:
 *  - Both endpoints return 200 + { items: [...] } shape.
 *  - When the configured analysis has included campaigns with
 *    nomination questions, the nomination-questions response covers
 *    at least one NominationType.
 *  - When the configured analysis has demographic questions, the
 *    demographic-questions response includes at least one of the
 *    well-known dimension keys.
 *  - Both endpoints 400 when clientId is omitted (analysis-backed
 *    contract, same as the other 5 analysis-backed surfaces).
 *
 * Run with: cd e2e && pnpm test:api:test:auth
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../api-client';
import { config } from '../config';

let CONFIGURED_DISEASE_AREA_ID: string;
let CONFIGURED_CLIENT_ID: string;

describe('Insights survey-question endpoints (v1.17.53)', () => {
  let client: ApiClient;

  beforeAll(async () => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:test:auth');
    }
    client = new ApiClient();
    const { data: analyses } = await client.listKolAnalyses();
    const scored = analyses.items
      .slice()
      .sort((a, b) => b._count.scores - a._count.scores)[0];
    if (scored && scored._count.scores > 0) {
      CONFIGURED_CLIENT_ID = scored.clientId;
      CONFIGURED_DISEASE_AREA_ID = scored.diseaseAreaId;
    }
  });

  describe('GET /:da/nomination-questions', () => {
    it('returns 200 + { items } shape', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const { status, data } = await client.getInsightsNominationQuestions(
        CONFIGURED_DISEASE_AREA_ID,
        CONFIGURED_CLIENT_ID
      );
      expect(status).toBe(200);
      expect(Array.isArray(data.items)).toBe(true);
      for (const item of data.items) {
        expect(typeof item.nominationType).toBe('string');
        expect(typeof item.text).toBe('string');
        expect(typeof item.campaignName).toBe('string');
        expect(item.text.length).toBeGreaterThan(0);
      }
      console.log(`✅ nomination-questions: ${data.items.length} types covered`);
    });

    it('returns 400 without clientId (analysis-backed contract)', async () => {
      const { status } = await client.getInsightsNominationQuestions(CONFIGURED_DISEASE_AREA_ID);
      expect(status).toBe(400);
    });
  });

  describe('GET /:da/demographic-questions', () => {
    it('returns 200 + { items } shape', async () => {
      if (!CONFIGURED_CLIENT_ID) {
        console.log('⊘ No scored analysis on this env — skipping');
        return;
      }
      const { status, data } = await client.getInsightsDemographicQuestions(
        CONFIGURED_DISEASE_AREA_ID,
        CONFIGURED_CLIENT_ID
      );
      expect(status).toBe(200);
      expect(Array.isArray(data.items)).toBe(true);
      const KNOWN = new Set([
        'role',
        'coreFocus',
        'practiceSetting',
        'yearsInPractice',
        'monthlyPatients',
        'dedPatients',
        'topicsDiscussed',
        'educationalResources',
        'socialMedia',
        'valuableContent',
        'objectivity',
      ]);
      for (const item of data.items) {
        expect(KNOWN.has(item.dimension)).toBe(true);
        expect(typeof item.text).toBe('string');
        expect(item.text.length).toBeGreaterThan(0);
      }
      console.log(`✅ demographic-questions: ${data.items.length} dimensions covered`);
    });

    it('returns 400 without clientId', async () => {
      const { status } = await client.getInsightsDemographicQuestions(CONFIGURED_DISEASE_AREA_ID);
      expect(status).toBe(400);
    });
  });
});
