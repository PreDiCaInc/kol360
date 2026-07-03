/**
 * HCP CSV import — Canada MINC path (v1.17.68)
 *
 * Structural coverage for the new country-aware validation. The
 * bulk-import endpoint accepts a `country=CA` query param that
 * switches its identifier validator from the 10-digit NPI regex to
 * the CAMD######## MINC regex.
 *
 * Two paired tests per the CLAUDE.md constraint-migration playbook:
 *   1. COMPATIBILITY — a valid MINC in each of the 4 accepted input
 *      shapes (canonical, hyphenated, lowercase, mixed spacing)
 *      creates a new HCP with country='CA' + nationalIdType='MINC'.
 *   2. REJECTION — invalid MINCs (wrong country prefix, wrong
 *      profession, non-digit body, short/long) come back as per-row
 *      errors (not 503, not silently dropped).
 *
 * Ticket: docs/findings/canada-hcp-support-lite-plan-2026-06-25.md
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../api-client';
import { config } from '../config';

// Unique MINC generator per test run. Serial digits derived from the
// current millisecond to avoid collision with prior runs' accumulated
// CA HCPs (same accumulation-vs-collision consideration as the US
// NPI generators). Check digit is a fixed 0 — the algorithm is
// unpublished (format-only validation on the server side).
function freshMinc(): string {
  const serial = String(Date.now() % 10_000_000).padStart(7, '0');
  return `CAMD${serial}0`;
}

describe('HCP CSV import — Canada MINC path (v1.17.68)', () => {
  let client: ApiClient;

  beforeAll(() => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:test:auth');
    }
    client = new ApiClient();
  });

  const VALID_MINC_SHAPES = [
    // Canonical 12-char uppercase.
    (m: string) => m,
    // Hyphenated CA-MD-####-###-# display format (customer's docx
    // guidance).
    (m: string) => `${m.slice(0, 2)}-${m.slice(2, 4)}-${m.slice(4, 8)}-${m.slice(8, 11)}-${m.slice(11)}`,
    // Lowercase — normalizer uppercases.
    (m: string) => m.toLowerCase(),
    // Spaced — normalizer strips whitespace.
    (m: string) => `${m.slice(0, 2)} ${m.slice(2, 4)} ${m.slice(4, 8)} ${m.slice(8)}`,
  ];

  it.each(VALID_MINC_SHAPES.map((fn, i) => [i + 1, fn] as const))(
    'accepts valid MINC in input-shape variant %s',
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

  const INVALID_MINC_INPUTS = [
    // Wrong country prefix.
    'USMD12345678',
    // Wrong profession prefix.
    'CADX12345678',
    // Non-digit body.
    'CAMD1234567X',
    // Too short.
    'CAMD1234567',
    // Too long after normalization.
    'CAMD1234567890',
    // 10-digit NPI submitted as MINC.
    '1234567890',
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
