/**
 * HCP CSV import: UPDATE path with role-form specialty (v1.17.2 regression)
 *
 * P1 bug flagged by prod team 2026-05-25 during 4.1.2 soak: every HCP CSV
 * upload was crashing with 503 since the 4.1.1 deploy 3 days earlier.
 *
 * Root cause: hcp.service.ts had a local normalizeSpecialty() that output
 * credentials (MD/DO/OD). The v1.15.31 fix piped that output through the
 * canonical normalizeHcpSpecialty() only on the CREATE path — UPDATE +
 * MERGE paths wrote raw 'MD'/'OD' into the column. Latent until the
 * v1.17.0 whitelist CHECK (Hcp_specialty_check) turned every existing-HCP
 * row in a CSV into a 503.
 *
 * v1.17.2 fix: normalize at the validation phase so all 3 write paths see
 * canonical values. Local normalizeSpecialty deleted. Unrecognized values
 * now reported as per-row errors instead of crashing the batch.
 *
 * Run with: cd e2e && pnpm test:api:test:auth
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../api-client';
import { config } from '../config';
import { TEST_IDS } from '../fixtures';

describe('HCP CSV import — UPDATE path with role-form specialty (v1.17.2)', () => {
  let client: ApiClient;

  beforeAll(() => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:test:auth');
    }
    client = new ApiClient();
  });

  it('updates an existing HCP with role-form specialty without crashing (200, not 503)', async () => {
    // Alice (TEST_IDS.HCP_1) is a seeded fixture — already exists with
    // canonical specialty. Upload a CSV that matches her NPI and provides
    // a ROLE-form specialty ("Optometrist"). Pre-fix: UPDATE path wrote
    // 'OD' into the column → CHECK violation → 503 for the whole batch.
    // Post-fix: validation normalizes to 'Optometry' → UPDATE succeeds.
    const alice = TEST_IDS.HCP_1;
    const csv = [
      'NPI,First Name,Last Name,Email,Specialty,City,State',
      `${alice.npi},${alice.firstName},${alice.lastName},${alice.email},Optometrist,${alice.city},${alice.state}`,
    ].join('\n');

    const { status, data } = await client.importHcps(csv);

    // Pre-fix behavior would be: status=503, data shape malformed.
    expect(status).toBe(200);
    expect(data.errors).toEqual([]);
    expect(data.updated).toBeGreaterThanOrEqual(1);

    // Verify the column ended up canonical (Optometry), not the raw 'Optometrist'
    // or the credential-form 'OD' that the old local normalizer would have produced.
    const { status: getStatus, data: hcp } = await client.getHcp(alice.id);
    expect(getStatus).toBe(200);
    expect(hcp.specialty).toBe('Optometry');

    console.log(`✅ HCP UPDATE with role-form specialty: updated=${data.updated}, errors=${data.errors.length}, specialty="${hcp.specialty}"`);
  });

  it('rejects an unrecognized specialty as a per-row error (not 503)', async () => {
    // Pre-fix: 'Cardiology' would either slip through (pre-4.1.1) or 503 the
    // batch (post-4.1.1, on UPDATE path). Post-fix: validation phase throws
    // per-row, batch continues, error is reported in the response.
    const csv = [
      'NPI,First Name,Last Name,Email,Specialty,City,State',
      // Use a non-existent NPI so we're not actually mutating any state — the
      // row should fail at validation before any DB write attempt.
      '9991234567,Test,Cardiologist,not.a.real@example.com,Cardiology,NYC,NY',
    ].join('\n');

    const { status, data } = await client.importHcps(csv);
    // 200 with row-level errors is the correct shape; the batch as a whole
    // succeeded (0 rows landed, 1 row reported).
    expect(status).toBe(200);
    expect(data.created).toBe(0);
    expect(data.updated).toBe(0);
    expect(data.errors.length).toBeGreaterThanOrEqual(1);
    expect(data.errors[0].error).toMatch(/specialty.*not recognized|Cardiology/i);

    console.log(`✅ Unrecognized specialty reported as row error, not 503: "${data.errors[0].error}"`);
  });
});
