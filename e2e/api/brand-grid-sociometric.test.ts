/**
 * Brand-Affinity Grid — Sociometric Summary Phase 3.
 *
 * Covers the read-side contract:
 *   - GET /:diseaseAreaId/sociometric-summary always includes
 *     `brandColumns` (array; empty on classic-only or mixed-brand DAs).
 *   - Each item includes `brandFlagCounts` (object; empty on rows
 *     with no grid-flag data).
 *
 * Deep math verification (grid-mode biasedLeaders = SUM of BRAND flags
 * per HCP; brandFlagCounts values match DB) is deferred — that path
 * needs full setup: create a grid campaign, seed brands, submit a
 * brand-flagged survey, create + recalc a KolAnalysis, then query.
 * Scoped for the Phase 3 backend-shape ship; a follow-up test can
 * exercise the math end-to-end.
 *
 * Ticket: docs/findings/brand-affinity-grid-nomination-plan-2026-07-08.md
 */

import { describe, it, expect } from 'vitest';
import { config } from '../config';
import { ApiClient } from '../api-client';
import { TEST_IDS } from '../fixtures';

const skipIfNoAuth = !config.authToken;

describe.skipIf(skipIfNoAuth)('Brand-Affinity Grid — Sociometric Summary shape', () => {
  const api = new ApiClient();

  it('response includes brandColumns array (may be empty on classic-only DAs)', async () => {
    const { status, data } = await api.getInsightsSociometricSummary(
      TEST_IDS.DISEASE_AREA_ID,
      { limit: 5 }
    );
    expect(status).toBe(200);
    const d = data as unknown as {
      items: Array<Record<string, unknown>>;
      brandColumns?: Array<{ brandOptionId: string; displayName: string; displayOrder: number }>;
    };
    expect(d.brandColumns).toBeDefined();
    expect(Array.isArray(d.brandColumns)).toBe(true);
    // Every entry (if any) must have the three required fields shaped correctly.
    for (const b of d.brandColumns ?? []) {
      expect(typeof b.brandOptionId).toBe('string');
      expect(b.brandOptionId.length).toBeGreaterThan(0);
      expect(typeof b.displayName).toBe('string');
      expect(typeof b.displayOrder).toBe('number');
    }
  });

  it('each item includes brandFlagCounts (object, may be empty)', async () => {
    const { data } = await api.getInsightsSociometricSummary(
      TEST_IDS.DISEASE_AREA_ID,
      { limit: 5 }
    );
    const d = data as unknown as {
      items: Array<Record<string, unknown> & { brandFlagCounts?: Record<string, number> }>;
    };
    if (d.items.length === 0) {
      console.log('DA has no analysis / no HCPs — skipping row-shape assertions');
      return;
    }
    for (const item of d.items) {
      expect(item).toHaveProperty('brandFlagCounts');
      const flags = item.brandFlagCounts;
      expect(typeof flags).toBe('object');
      expect(flags).not.toBeNull();
      // Every value in the map (if any) must be a non-negative number.
      for (const [key, count] of Object.entries(flags ?? {})) {
        expect(typeof key).toBe('string');
        expect(typeof count).toBe('number');
        expect(count).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('parity DA sociometric also emits brandColumns (a different DA/analysis path)', async () => {
    const { status, data } = await api.getInsightsSociometricSummary(
      TEST_IDS.STABLE_FIXTURE.PARITY_DISEASE_AREA_ID,
      { limit: 5 }
    );
    expect(status).toBe(200);
    const d = data as unknown as {
      brandColumns?: Array<unknown>;
      items: Array<Record<string, unknown>>;
    };
    // Just proves the field is present regardless of DA. Classic-only DA
    // yields []; a future grid-enabled DA would yield >0 entries.
    expect(d.brandColumns).toBeDefined();
    expect(Array.isArray(d.brandColumns)).toBe(true);
  });
});
