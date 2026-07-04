import { describe, it, expect } from 'vitest';
import { getBeIdRequestSchema } from '../curation';

// v1.17.71 — curation-svc team review §2.1 asked kol360 to enforce
// country/nationalIdType pairing at the schema level rather than
// leaving it as a "documented invariant." These tests lock the
// enforcement in place.

const BASE_DISCOVERED_FROM = {
  source_url: 'https://example.com/j',
  scraper_run_id: 'run-1',
  ai_verification_snapshot_url: 's3://bucket/j.json',
  captured_at: '2026-07-01T00:00:00Z',
};

describe('getBeIdRequestSchema — country/nationalIdType pairing (v1.17.71)', () => {
  it('accepts paired US + NPI (canonical case)', () => {
    const result = getBeIdRequestSchema.safeParse({
      firstName: 'Jane',
      lastName: 'Smith',
      npi: '1234567890',
      country: 'US',
      nationalIdType: 'NPI',
      discoveredFrom: BASE_DISCOVERED_FROM,
    });
    expect(result.success).toBe(true);
  });

  it('accepts paired CA + MINC (canonical case)', () => {
    const result = getBeIdRequestSchema.safeParse({
      firstName: 'François',
      lastName: 'Tremblay',
      npi: 'CAMD12345678',
      country: 'CA',
      nationalIdType: 'MINC',
      discoveredFrom: BASE_DISCOVERED_FROM,
    });
    expect(result.success).toBe(true);
  });

  it('accepts defaults (both fields omitted → US + NPI)', () => {
    const result = getBeIdRequestSchema.safeParse({
      firstName: 'Jane',
      lastName: 'Smith',
      npi: '1234567890',
      discoveredFrom: BASE_DISCOVERED_FROM,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.country).toBe('US');
      expect(result.data.nationalIdType).toBe('NPI');
    }
  });

  it('rejects unpaired US + MINC', () => {
    const result = getBeIdRequestSchema.safeParse({
      firstName: 'Jane',
      lastName: 'Smith',
      npi: 'CAMD12345678',
      country: 'US',
      nationalIdType: 'MINC',
      discoveredFrom: BASE_DISCOVERED_FROM,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const pairingIssue = result.error.errors.find((e) => e.path[0] === 'nationalIdType');
      expect(pairingIssue?.message).toMatch(/paired/);
    }
  });

  it('rejects unpaired CA + NPI', () => {
    const result = getBeIdRequestSchema.safeParse({
      firstName: 'François',
      lastName: 'Tremblay',
      npi: '1234567890',
      country: 'CA',
      nationalIdType: 'NPI',
      discoveredFrom: BASE_DISCOVERED_FROM,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const pairingIssue = result.error.errors.find((e) => e.path[0] === 'nationalIdType');
      expect(pairingIssue?.message).toMatch(/paired/);
    }
  });

  it('rejects unpaired combos even when npi is omitted', () => {
    // Guards the no-NPI mint path from a wrong-country classification.
    const result = getBeIdRequestSchema.safeParse({
      firstName: 'Jane',
      lastName: 'Doe',
      country: 'CA',
      nationalIdType: 'NPI',
      discoveredFrom: BASE_DISCOVERED_FROM,
    });
    expect(result.success).toBe(false);
  });

  it('rejects MINC value under nationalIdType=NPI', () => {
    // Existing behavior (npi-vs-type validation) still fires — this
    // test guards against the pairing check swallowing the value-shape
    // validation when nationalIdType actually matches country.
    const result = getBeIdRequestSchema.safeParse({
      firstName: 'Jane',
      lastName: 'Smith',
      npi: 'CAMD12345678',
      country: 'US',
      nationalIdType: 'NPI',
      discoveredFrom: BASE_DISCOVERED_FROM,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const npiIssue = result.error.errors.find((e) => e.path[0] === 'npi');
      expect(npiIssue).toBeDefined();
    }
  });

  it('rejects NPI value under nationalIdType=MINC', () => {
    const result = getBeIdRequestSchema.safeParse({
      firstName: 'François',
      lastName: 'Tremblay',
      npi: '1234567890',
      country: 'CA',
      nationalIdType: 'MINC',
      discoveredFrom: BASE_DISCOVERED_FROM,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const npiIssue = result.error.errors.find((e) => e.path[0] === 'npi');
      expect(npiIssue).toBeDefined();
    }
  });
});
