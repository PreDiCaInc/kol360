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

  // v1.17.60 — this file uses TEST_IDS.STABLE_FIXTURE.PARTIAL_UPDATE_HCP_*,
  // a dedicated HCP seeded by `pnpm e2e:seed` whose city/state may be
  // mutated freely. Other test files MUST NOT mutate this HCP — that's
  // what makes the read-back deterministic under vitest's parallel-file
  // execution. Earlier drafts targeted TEST_IDS.HCP_1 (Alice) and raced
  // against hcp-import-update-specialty.test.ts (which writes Alice via
  // full-row CSVs that also pin city/state).
  // Ticket: docs/findings/e2e-hcp-import-partial-update-fixture-race-2026-06-22.md

  it('NPI,City,State only — updates city/state on existing HCP; preserves name/email/specialty', async () => {
    const fixture = TEST_IDS.STABLE_FIXTURE;
    const partialHcpId = fixture.PARTIAL_UPDATE_HCP_ID;
    const partialHcpNpi = fixture.PARTIAL_UPDATE_HCP_NPI;

    // Snapshot the fixture's current state pre-import.
    const before = await client.getHcp(partialHcpId);
    expect(before.status).toBe(200);
    const originalFirstName = before.data.firstName;
    const originalLastName = before.data.lastName;
    const originalEmail = before.data.email;
    const originalSpecialty = before.data.specialty;

    // Partial CSV: NPI + new City + new State only. No name, email,
    // specialty cols.
    const newCity = `Test City ${Date.now()}`;
    const newState = 'MA';
    const csv = ['NPI,City,State', `${partialHcpNpi},${newCity},${newState}`].join('\n');

    const { status, data } = await client.importHcps(csv);
    expect(status).toBe(200);
    expect(data.errors).toEqual([]);
    expect(data.updated).toBeGreaterThanOrEqual(1);
    expect(data.created).toBe(0);

    // Re-read the fixture. City/state must be the new values;
    // everything else must be untouched.
    const after = await client.getHcp(partialHcpId);
    expect(after.status).toBe(200);
    expect(after.data.city).toBe(newCity);
    expect(after.data.state).toBe(newState);
    expect(after.data.firstName).toBe(originalFirstName);
    expect(after.data.lastName).toBe(originalLastName);
    expect(after.data.email).toBe(originalEmail);
    expect(after.data.specialty).toBe(originalSpecialty);
  });

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
