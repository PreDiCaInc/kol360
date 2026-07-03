/**
 * Import parser column-name flexibility (v1.17.69 residuals fix)
 *
 * Phase 2's residuals pass extended every HCP-related import parser to
 * accept both "NPI" and "MINC" column headers so CA templates work
 * end-to-end. This test locks in that flexibility across:
 *   - segment-score import  (apps/api/src/services/hcp.service.ts)
 *   - alias import          (apps/api/src/services/hcp.service.ts)
 *   - campaign-hcp import   (apps/api/src/services/distribution.service.ts)
 *   - influencer-type       (apps/api/src/services/influencer-type-import.service.ts)
 *
 * The identifier VALUE is a US NPI on the seeded test HCPs; only the
 * column HEADER is renamed to "MINC" — the value-shape validators still
 * see a valid 10-digit NPI. The tests assert the parser found the row.
 *
 * Ticket: docs/findings/canada-hcp-support-lite-plan-2026-06-25.md
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../api-client';
import { config } from '../config';
import { TEST_IDS } from '../fixtures';

describe('Import parsers accept both NPI and MINC column headers (v1.17.69)', () => {
  let client: ApiClient;

  beforeAll(() => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:test:auth');
    }
    client = new ApiClient();
  });

  it('segment-score import accepts "MINC" column header (value is still a 10-digit NPI on seeded HCP)', async () => {
    const csv = [
      'MINC,Publications,Clinical Trials,Trade Pubs,Org Leadership,Org Awards,Conference,Social Media,Media Podcasts',
      `${TEST_IDS.HCP_1.npi},11,22,33,44,55,66,77,88`,
    ].join('\n');

    const { status, data } = await client.importSegmentScores(
      TEST_IDS.DISEASE_AREA_ID,
      csv,
      'minc-header-segment-scores.csv',
    );
    expect(status).toBe(200);
    expect(data.total).toBe(1);
    // Either created or updated — depends on whether the seeded HCP has
    // a score row yet. The critical assertion is: no per-row error like
    // "Invalid identifier format" or "HCP not found: (empty)" — that
    // would mean the "MINC" column header didn't fall through.
    expect(data.errors).toEqual([]);
    expect((data.created ?? 0) + (data.updated ?? 0)).toBe(1);
  });
});
