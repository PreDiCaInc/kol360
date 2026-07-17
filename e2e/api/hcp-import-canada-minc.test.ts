/**
 * HCP CSV import — Canada OneKey ID path (v1.17.68, relaxed v1.18.4,
 *                                          renamed MINC→ONEKEY_ID v1.19.0)
 *
 * Structural coverage for the country-aware validation. The
 * bulk-import endpoint accepts a `country=CA` query param that
 * switches its identifier validator from the 10-digit NPI regex to
 * the OneKey ID validator.
 *
 * v1.18.4 relaxed the format from strict CAMD######## to just
 * "10 or 12 alphanumeric chars after normalization" — real CA HCP
 * data via the Canada HCP table doesn't uniformly fit the old shape.
 * v1.19.0 renamed the nationalIdType value from 'MINC' to
 * 'ONEKEY_ID' (display "OneKey ID"). Backward-compat: CSV column
 * headers 'MINC' / 'minc' are still accepted alongside
 * 'OneKey ID' / 'OneKey' / 'OneKeyID' / 'onekey' / 'onekey_id' + NPI.
 *
 * Two paired blocks per the CLAUDE.md constraint-migration playbook:
 *   1. COMPATIBILITY — a valid OneKey ID in each accepted input
 *      shape creates a new HCP with country='CA' +
 *      nationalIdType='ONEKEY_ID'.
 *   2. REJECTION — inputs whose LENGTH isn't 10 or 12 after
 *      normalization come back as per-row errors (not 503).
 *
 * Filename kept as `hcp-import-canada-minc.test.ts` for git-blame
 * continuity; the file contents track the current OneKey ID
 * vocabulary.
 *
 * Ticket: docs/findings/canada-hcp-support-lite-plan-2026-06-25.md
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../api-client';
import { config } from '../config';

// Unique OneKey ID generator per test run. Canonical 12-char shape
// kept as the baseline — the relaxed validator still accepts it, and
// legacy CAMD-prefixed values also route to CA/ONEKEY_ID via the
// content-based auto-detect (any letter in a 10-or-12-char input).
function freshOneKeyId(): string {
  const serial = String(Date.now() % 10_000_000).padStart(7, '0');
  return `CAMD${serial}0`;
}

// A 10-char alphanumeric OneKey ID (post-v1.18.4 shape). Uses letters
// to avoid confusion with the 10-digit NPI shape (which the router
// prefers as US/NPI even in a CA import context).
function freshOneKeyId10(): string {
  const suffix = String(Date.now() % 100_000).padStart(5, '0');
  return `CA${suffix}A2C4`;
}

describe('HCP CSV import — Canada OneKey ID path (v1.19.0)', () => {
  let client: ApiClient;

  beforeAll(() => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:test:auth');
    }
    client = new ApiClient();
  });

  const VALID_INPUT_SHAPES = [
    // Canonical 12-char CAMD (legacy MINC form still works).
    (m: string) => m,
    // Hyphenated CA-MD-####-###-# display format.
    (m: string) => `${m.slice(0, 2)}-${m.slice(2, 4)}-${m.slice(4, 8)}-${m.slice(8, 11)}-${m.slice(11)}`,
    // Lowercase — normalizer uppercases.
    (m: string) => m.toLowerCase(),
    // Spaced — normalizer strips whitespace.
    (m: string) => `${m.slice(0, 2)} ${m.slice(2, 4)} ${m.slice(4, 8)} ${m.slice(8)}`,
  ];

  it.each(VALID_INPUT_SHAPES.map((fn, i) => [i + 1, fn] as const))(
    'accepts valid 12-char OneKey ID in input-shape variant %s',
    async (_variant, shape) => {
      const id = freshOneKeyId();
      const csv = [
        'NPI,First Name,Last Name,Email,Specialty,City,State',
        `${shape(id)},CATest,OneKeyHcp${Date.now()},onekey.${Date.now()}@e2etest.example.com,Ophthalmology,Toronto,ON`,
      ].join('\n');
      const { status, data } = await client.importHcps(csv, 'ca-onekey.csv', 'CA');
      expect(status).toBe(200);
      expect(data.errors).toEqual([]);
      expect(data.created).toBeGreaterThanOrEqual(1);
    },
  );

  // v1.18.4 — accept 12-char alphanumeric without CAMD prefix + 10-char
  // alphanumeric. Validator accepts any 10 or 12 char alphanumeric.
  it('accepts 12-char alphanumeric OneKey ID without CAMD prefix (v1.18.4)', async () => {
    const raw = `XYZK${String(Date.now() % 10_000_000).padStart(8, '0')}`;
    const csv = [
      'NPI,First Name,Last Name,Email,Specialty,City,State',
      `${raw},CATest,NonCAMD${Date.now()},noncamd.${Date.now()}@e2etest.example.com,Ophthalmology,Toronto,ON`,
    ].join('\n');
    const { status, data } = await client.importHcps(csv, 'ca-onekey-noncamd.csv', 'CA');
    expect(status).toBe(200);
    expect(data.errors).toEqual([]);
    expect(data.created).toBeGreaterThanOrEqual(1);
  });

  it('accepts 10-char alphanumeric OneKey ID (v1.18.4)', async () => {
    const raw = freshOneKeyId10();
    const csv = [
      'NPI,First Name,Last Name,Email,Specialty,City,State',
      `${raw},CATest,OneKeyHcp10${Date.now()},onekey10.${Date.now()}@e2etest.example.com,Ophthalmology,Toronto,ON`,
    ].join('\n');
    const { status, data } = await client.importHcps(csv, 'ca-onekey-10.csv', 'CA');
    expect(status).toBe(200);
    expect(data.errors).toEqual([]);
    expect(data.created).toBeGreaterThanOrEqual(1);
  });

  // v1.18.4 — only LENGTH-based rejections remain (dropped CAMD prefix
  // + digit-tail rules). Kept the batch-crash-vs-per-row guard.
  const INVALID_INPUTS = [
    // Too short (7 chars).
    'CAMD123',
    // 11 chars (length ≠ 10 or 12).
    'CAMD1234567',
    // 14 chars (still too long).
    'CAMD1234567890',
    // 8 chars (neither 10 nor 12).
    'AB123456',
    // Empty (missing identifier entirely).
    '',
    // Only separators — normalize strips to empty.
    '---',
  ];

  it.each(INVALID_INPUTS)(
    'rejects "%s" as per-row error (not 503)',
    async (raw) => {
      const csv = [
        'NPI,First Name,Last Name,Email,Specialty,City,State',
        `${raw},CATest,BadOneKey${Date.now()},reject.${Date.now()}@e2etest.example.com,Ophthalmology,Toronto,ON`,
      ].join('\n');
      const { status, data } = await client.importHcps(csv, 'ca-onekey-reject.csv', 'CA');
      // Import completes with per-row errors (not a batch-crash 503).
      expect(status).toBe(200);
      expect(data.errors.length).toBeGreaterThanOrEqual(1);
      expect(data.created).toBe(0);
    },
  );
});
