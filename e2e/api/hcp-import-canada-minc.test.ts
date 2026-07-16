/**
 * HCP CSV import — Canada MINC path (v1.17.68, relaxed v1.18.4)
 *
 * Structural coverage for the country-aware validation. The
 * bulk-import endpoint accepts a `country=CA` query param that
 * switches its identifier validator from the 10-digit NPI regex to
 * the MINC validator.
 *
 * v1.18.4 relaxed the MINC format from strict CAMD######## to just
 * "10 or 12 alphanumeric chars after normalization" per pteam ask —
 * real CA HCP data via the Canada HCP table doesn't uniformly fit
 * the old shape. This test file was rewritten around that: several
 * inputs that used to reject (USMD prefix, CADX prefix, non-CAMD
 * shape) now accept. Length-based rejections still hold.
 *
 * Two paired blocks per the CLAUDE.md constraint-migration playbook:
 *   1. COMPATIBILITY — a valid MINC in each accepted input shape
 *      creates a new HCP with country='CA' + nationalIdType='MINC'.
 *   2. REJECTION — inputs whose LENGTH isn't 10 or 12 after
 *      normalization come back as per-row errors (not 503).
 *
 * Ticket: docs/findings/canada-hcp-support-lite-plan-2026-06-25.md
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../api-client';
import { config } from '../config';

// Unique MINC generator per test run. Serial digits derived from the
// current millisecond to avoid collision with prior runs' accumulated
// CA HCPs. Canonical CAMD######## shape kept as the baseline — the
// relaxed validator still accepts it.
function freshMinc(): string {
  const serial = String(Date.now() % 10_000_000).padStart(7, '0');
  return `CAMD${serial}0`;
}

// A 10-char alphanumeric MINC (post-v1.18.4 shape). Uses letters to
// avoid confusion with the 10-digit NPI shape (which the router
// prefers as US/NPI even in a CA import context).
function freshMinc10(): string {
  const suffix = String(Date.now() % 100_000).padStart(5, '0');
  return `CA${suffix}A2C4`;
}

describe('HCP CSV import — Canada MINC path (v1.17.68, relaxed v1.18.4)', () => {
  let client: ApiClient;

  beforeAll(() => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:test:auth');
    }
    client = new ApiClient();
  });

  const VALID_MINC_SHAPES = [
    // Canonical 12-char CAMD (classic MINC still works).
    (m: string) => m,
    // Hyphenated CA-MD-####-###-# display format.
    (m: string) => `${m.slice(0, 2)}-${m.slice(2, 4)}-${m.slice(4, 8)}-${m.slice(8, 11)}-${m.slice(11)}`,
    // Lowercase — normalizer uppercases.
    (m: string) => m.toLowerCase(),
    // Spaced — normalizer strips whitespace.
    (m: string) => `${m.slice(0, 2)} ${m.slice(2, 4)} ${m.slice(4, 8)} ${m.slice(8)}`,
  ];

  it.each(VALID_MINC_SHAPES.map((fn, i) => [i + 1, fn] as const))(
    'accepts valid 12-char MINC in input-shape variant %s',
    async (_variant, shape) => {
      const minc = freshMinc();
      const csv = [
        'NPI,First Name,Last Name,Email,Specialty,City,State',
        `${shape(minc)},CATest,MincHcp${Date.now()},minc.${Date.now()}@e2etest.example.com,Ophthalmology,Toronto,ON`,
      ].join('\n');
      const { status, data } = await client.importHcps(csv, 'ca-minc.csv', 'CA');
      expect(status).toBe(200);
      expect(data.errors).toEqual([]);
      expect(data.created).toBeGreaterThanOrEqual(1);
    },
  );

  // v1.18.4 — new accept cases: 12-char alphanumerics without the
  // CAMD prefix, and 10-char alphanumerics. The relaxed validator
  // accepts any 10 or 12 char alphanumeric string after normalization.
  it('accepts 12-char alphanumeric MINC without CAMD prefix (v1.18.4)', async () => {
    const raw = `XYZK${String(Date.now() % 10_000_000).padStart(8, '0')}`;
    const csv = [
      'NPI,First Name,Last Name,Email,Specialty,City,State',
      `${raw},CATest,NonCAMD${Date.now()},noncamd.${Date.now()}@e2etest.example.com,Ophthalmology,Toronto,ON`,
    ].join('\n');
    const { status, data } = await client.importHcps(csv, 'ca-minc-noncamd.csv', 'CA');
    expect(status).toBe(200);
    expect(data.errors).toEqual([]);
    expect(data.created).toBeGreaterThanOrEqual(1);
  });

  it('accepts 10-char alphanumeric MINC (v1.18.4)', async () => {
    const raw = freshMinc10();
    const csv = [
      'NPI,First Name,Last Name,Email,Specialty,City,State',
      `${raw},CATest,MincHcp10${Date.now()},minc10.${Date.now()}@e2etest.example.com,Ophthalmology,Toronto,ON`,
    ].join('\n');
    const { status, data } = await client.importHcps(csv, 'ca-minc-10.csv', 'CA');
    expect(status).toBe(200);
    expect(data.errors).toEqual([]);
    expect(data.created).toBeGreaterThanOrEqual(1);
  });

  // v1.18.4 — only LENGTH-based rejections remain. Everything else is
  // valid MINC now (dropped CAMD prefix rule, dropped digit-tail
  // rule). Kept the batch-crash-vs-per-row guard.
  const INVALID_MINC_INPUTS = [
    // Too short (7 chars).
    'CAMD123',
    // 11 chars (was previously rejected because length ≠ 12; still
    // rejected under length ≠ 10 or 12).
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

  it.each(INVALID_MINC_INPUTS)(
    'rejects "%s" as per-row error (not 503)',
    async (raw) => {
      const csv = [
        'NPI,First Name,Last Name,Email,Specialty,City,State',
        `${raw},CATest,BadMinc${Date.now()},reject.${Date.now()}@e2etest.example.com,Ophthalmology,Toronto,ON`,
      ].join('\n');
      const { status, data } = await client.importHcps(csv, 'ca-minc-reject.csv', 'CA');
      // Import completes with per-row errors (not a batch-crash 503).
      expect(status).toBe(200);
      expect(data.errors.length).toBeGreaterThanOrEqual(1);
      expect(data.created).toBe(0);
    },
  );
});
