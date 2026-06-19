/**
 * HCP CSV import — UPDATE branch accepts partial rows (v1.17.57)
 *
 * Pteam ticket:
 * docs/findings/hcp-import-relax-validation-for-update-rows-2026-06-18.md
 *
 * Pre-v1.17.57, every input row had to carry firstName + lastName +
 * email + specialty regardless of whether the NPI matched an existing
 * HCP. Partial-update CSVs (NPI,City,State / NPI,Email / NPI,Specialty)
 * were rejected at validation. Every "fix city/state on these 5 HCPs"
 * customer ask required a direct-SQL trip through the prod tunnel.
 *
 * v1.17.57 lifts the NPI lookup BEFORE row validation and applies
 * per-branch rules:
 *   - UPDATE branch (NPI matches an existing HCP): partials accepted;
 *     omitted columns preserved by the downstream `row.X || existing.X`
 *     fallback.
 *   - CREATE branch (NPI doesn't match any HCP): keep strict
 *     (firstName + lastName + email + specialty all required).
 *   - MERGE branch (NPI doesn't match; full name matches HcpAlias):
 *     also strict — MERGE is a one-time identity-binding event.
 *
 * These tests cover the ticket's acceptance criteria.
 *
 * Run with: cd e2e && pnpm test:api:test:auth
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../api-client';
import { config } from '../config';
import { TEST_IDS } from '../fixtures';

describe('HCP CSV import — UPDATE branch accepts partial rows (v1.17.57)', () => {
  let client: ApiClient;

  beforeAll(() => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:test:auth');
    }
    client = new ApiClient();
  });

  // The HCP-1 fixture (Alice) is seeded by pnpm e2e:seed and lives
  // across the workflow tests. We mutate her demographics here to
  // verify partial updates land + everything else stays put.

  it('NPI,City,State only — updates city/state on existing HCP; preserves name/email/specialty', async () => {
    const alice = TEST_IDS.HCP_1;

    // Snapshot Alice's current state pre-import.
    const before = await client.getHcp(alice.id);
    expect(before.status).toBe(200);
    const originalFirstName = before.data.firstName;
    const originalLastName = before.data.lastName;
    const originalEmail = before.data.email;
    const originalSpecialty = before.data.specialty;

    // Partial CSV: NPI + new City + new State only. No name, email,
    // specialty cols.
    const newCity = `Test City ${Date.now()}`;
    const newState = 'MA';
    const csv = ['NPI,City,State', `${alice.npi},${newCity},${newState}`].join('\n');

    const { status, data } = await client.importHcps(csv);
    expect(status).toBe(200);
    expect(data.errors).toEqual([]);
    expect(data.updated).toBeGreaterThanOrEqual(1);
    expect(data.created).toBe(0);

    // Re-read Alice. City/state must be the new values; everything
    // else must be untouched.
    const after = await client.getHcp(alice.id);
    expect(after.status).toBe(200);
    expect(after.data.city).toBe(newCity);
    expect(after.data.state).toBe(newState);
    expect(after.data.firstName).toBe(originalFirstName);
    expect(after.data.lastName).toBe(originalLastName);
    expect(after.data.email).toBe(originalEmail);
    expect(after.data.specialty).toBe(originalSpecialty);
  });

  // Note: a previous draft of this file had a "NPI,Specialty only" test
  // that flipped Alice's specialty and restored it. Dropped because it
  // raced against hcp-import-update-specialty.test.ts (which also
  // mutates Alice's specialty across a parameterized matrix) when
  // vitest runs test files in parallel. The NPI,City,State test above
  // already exercises the partial-row UPDATE code path — specialty-only
  // is the same code path on a different column.

  it('NEW NPI with only NPI,City,State — errors with CREATE-path message (strict rules still apply)', async () => {
    // Use a clearly-not-real NPI we can be sure isn't in the DB.
    const newNpi = '9998880001';
    const csv = ['NPI,City,State', `${newNpi},Boston,MA`].join('\n');

    const { status, data } = await client.importHcps(csv);
    expect(status).toBe(200);
    expect(data.created).toBe(0);
    expect(data.updated).toBe(0);
    expect(data.errors.length).toBeGreaterThanOrEqual(1);
    // The first strict check to trip — historically `firstName` is
    // checked before email and specialty.
    expect(data.errors[0].error).toMatch(/First and last name required|Email is required|Specialty is required/);
  });

  it('NEW NPI with full required columns — still creates the HCP (no regression)', async () => {
    const newNpi = `999${Date.now().toString().slice(-7)}`;
    const csv = [
      'NPI,First Name,Last Name,Email,Specialty,City,State',
      `${newNpi},Sample,Importer,sample.importer@e2etest.example.com,Optometry,Boston,MA`,
    ].join('\n');

    const { status, data } = await client.importHcps(csv);
    expect(status).toBe(200);
    expect(data.errors).toEqual([]);
    expect(data.created).toBeGreaterThanOrEqual(1);
  });

  it('Invalid NPI (not 10 digits) — errors with NPI format message regardless of branch', async () => {
    const csv = ['NPI,City,State', 'not-an-npi,Boston,MA'].join('\n');

    const { status, data } = await client.importHcps(csv);
    expect(status).toBe(200);
    expect(data.errors.length).toBeGreaterThanOrEqual(1);
    expect(data.errors[0].error).toMatch(/Invalid NPI format/);
  });
});
