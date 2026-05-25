/**
 * HCP CSV import: UPDATE path specialty normalization (v1.17.2 regression)
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
 * Why parameterized: the bug went undetected for ~2 months because the
 * existing import test only used a single canonical input ('Optometry').
 * Parameterizing over the full input matrix locks in the contract for
 * every recognized form — if anyone touches normalizeHcpSpecialty again,
 * all 10 input shapes get verified end-to-end against the actual prod
 * write path.
 *
 * Run with: cd e2e && pnpm test:api:test:auth
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../api-client';
import { config } from '../config';
import { TEST_IDS } from '../fixtures';

// Mirrors the 10 forms accepted by normalizeHcpSpecialty in
// packages/shared/src/schemas/hcp.ts. If you add/remove a form there,
// update this matrix too — the test will catch divergence.
const RECOGNIZED_SPECIALTIES: Array<{ input: string; canonical: 'Optometry' | 'Ophthalmology' }> = [
  // Canonical (field-form)
  { input: 'Optometry',       canonical: 'Optometry' },
  { input: 'Ophthalmology',   canonical: 'Ophthalmology' },
  // Role-form (legacy / pre-v1.15.31 — must still import cleanly)
  { input: 'Optometrist',     canonical: 'Optometry' },
  { input: 'Ophthalmologist', canonical: 'Ophthalmology' },
  // Credential-form (real NPI exports)
  { input: 'OD',              canonical: 'Optometry' },
  { input: 'MD',              canonical: 'Ophthalmology' },
  { input: 'DO',              canonical: 'Ophthalmology' },
  // Credential with periods
  { input: 'O.D.',            canonical: 'Optometry' },
  { input: 'M.D.',            canonical: 'Ophthalmology' },
  { input: 'D.O.',            canonical: 'Ophthalmology' },
];

// Out-of-domain values must NOT crash the batch. Should land as per-row
// errors in the response and let the rest of the rows process.
const UNRECOGNIZED_SPECIALTIES = [
  'Cardiology',
  'Oncology',
  'Surgeon',
  'xyz123', // pure noise — sanity that no fallback fuzzy-match leaks
];

describe('HCP CSV import — UPDATE path specialty normalization (v1.17.2)', () => {
  let client: ApiClient;

  beforeAll(() => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:test:auth');
    }
    client = new ApiClient();
  });

  it.each(RECOGNIZED_SPECIALTIES)(
    'UPDATE path: CSV with "$input" → DB column = "$canonical" (no 503)',
    async ({ input, canonical }) => {
      // Alice (TEST_IDS.HCP_1) is a seeded fixture — already exists in the
      // DB. Each iteration re-imports her with a different specialty input
      // form and verifies (a) the upload doesn't 503 and (b) the column
      // ends up canonical. Pre-fix: 'Optometrist'/'OD'/'MD' etc. produced
      // 'OD'/'MD' in the column → CHECK violation → 503 for the whole batch.
      const alice = TEST_IDS.HCP_1;
      const csv = [
        'NPI,First Name,Last Name,Email,Specialty,City,State',
        `${alice.npi},${alice.firstName},${alice.lastName},${alice.email},${input},${alice.city},${alice.state}`,
      ].join('\n');

      const { status, data } = await client.importHcps(csv);

      expect(status).toBe(200);
      expect(data.errors).toEqual([]);
      expect(data.updated).toBeGreaterThanOrEqual(1);

      const { status: getStatus, data: hcp } = await client.getHcp(alice.id);
      expect(getStatus).toBe(200);
      expect(hcp.specialty).toBe(canonical);
    }
  );

  it.each(UNRECOGNIZED_SPECIALTIES)(
    'rejects "%s" as a per-row error (no 503)',
    async (input) => {
      // Use a non-existent NPI so we don't accidentally mutate state — the
      // row should fail at the validation phase before any DB write attempt,
      // which exercises the "throw row-level, continue batch" contract
      // regardless of CREATE vs UPDATE.
      const csv = [
        'NPI,First Name,Last Name,Email,Specialty,City,State',
        `9991234567,Test,Doc,not.a.real@example.com,${input},NYC,NY`,
      ].join('\n');

      const { status, data } = await client.importHcps(csv);

      // 200 with row-level errors is the correct shape; the batch as a
      // whole succeeded (0 rows landed, 1 row reported as error).
      expect(status).toBe(200);
      expect(data.created).toBe(0);
      expect(data.updated).toBe(0);
      expect(data.errors.length).toBeGreaterThanOrEqual(1);
      expect(data.errors[0].error).toMatch(/specialty.*not recognized/i);
    }
  );
});
