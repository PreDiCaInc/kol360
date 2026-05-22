/**
 * Segment-score import regression test: within-file dedup (v1.17.1 fix)
 *
 * Bug flagged by prod team 2026-05-22 during prod-rel-4.1.1 soak. Importer
 * categorizes rows in a single pass without refreshing the in-memory
 * existing-scores map after each insert. If the same (hcpId, diseaseAreaId)
 * appears twice in the CSV, both occurrences were routed into toCreate →
 * the second hit the @@unique([hcpId, diseaseAreaId]) constraint.
 *
 * v1.17.1 fix: dedupe rowsWithHcps by NPI before phase 3 (last row wins).
 * The result now reports a `deduped` count so customers see what collapsed.
 *
 * Run with: cd e2e && pnpm test:workflow:test
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../api-client';
import { config } from '../config';
import { TEST_IDS } from '../fixtures';

describe('Segment score import — within-file dedup (v1.17.1)', () => {
  let client: ApiClient;

  beforeAll(() => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:test:auth');
    }
    client = new ApiClient();
  });

  it('collapses duplicate (npi, diseaseAreaId) CSV rows; last row wins; reports deduped count', async () => {
    // Use the seeded test HCPs (Alice 9990000001, hcp2 9990000002, Carol 9990000003).
    // Build a CSV that intentionally has Alice twice — different score values.
    // Pre-fix: would fail with a Prisma unique-constraint error on the second
    // Alice row. Post-fix: succeeds with deduped=1 + Alice's row using the
    // SECOND value (last-row-wins semantics).
    const aliceNpi = TEST_IDS.HCP_1.npi; // 9990000001
    const carolNpi = TEST_IDS.HCP_3.npi; // 9990000003
    const csv = [
      'NPI,Publications,Clinical Trials,Trade Pubs,Org Leadership,Org Awards,Conference,Social Media,Media Podcasts',
      `${aliceNpi},10,20,30,40,50,60,70,80`,
      `${aliceNpi},99,99,99,99,99,99,99,99`,
      `${carolNpi},5,5,5,5,5,5,5,5`,
    ].join('\n');

    const { status, data } = await client.importSegmentScores(TEST_IDS.DISEASE_AREA_ID, csv);
    expect(status).toBe(200);
    // total = 3 input rows
    expect(data.total).toBe(3);
    // deduped = 1 (Alice's duplicate)
    expect(data.deduped).toBe(1);
    // created + updated = 2 (Alice + Carol, after dedup)
    expect(data.created + data.updated).toBe(2);
    // No errors
    expect(data.errors.length).toBe(0);

    console.log(
      `✅ Segment import dedup: total=${data.total}, deduped=${data.deduped}, created=${data.created}, updated=${data.updated}`
    );
  });
});
