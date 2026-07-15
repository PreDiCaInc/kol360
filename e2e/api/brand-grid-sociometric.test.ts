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

import { describe, it, expect, beforeAll } from 'vitest';
import { config } from '../config';
import { ApiClient } from '../api-client';

const skipIfNoAuth = !config.authToken;

describe.skipIf(skipIfNoAuth)('Brand-Affinity Grid — Sociometric Summary shape', () => {
  const api = new ApiClient();
  // Discovered at runtime — same pattern as insights-kol-side-filters.
  // Sociometric-summary requires an existing KolAnalysis on the (client, DA);
  // hitting a random DA yields 400. Pick the analysis with the most
  // scored HCPs so items[] is non-empty for row-shape assertions.
  let configuredClientId = '';
  let configuredDiseaseAreaId = '';

  beforeAll(async () => {
    const { data: analyses } = await api.listKolAnalyses();
    const best = analyses.items
      .slice()
      .sort((a, b) => b._count.scores - a._count.scores)[0];
    if (best && best._count.scores > 0) {
      configuredClientId = best.clientId;
      configuredDiseaseAreaId = best.diseaseAreaId;
    }
  });

  it('response includes brandColumns array (may be empty on classic-only DAs)', async () => {
    if (!configuredDiseaseAreaId) {
      console.log('No scored analysis found on test env — skipping');
      return;
    }
    const { status, data } = await api.getInsightsSociometricSummary(
      configuredDiseaseAreaId,
      { clientId: configuredClientId, limit: 5 }
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
    if (!configuredDiseaseAreaId) {
      console.log('No scored analysis found on test env — skipping');
      return;
    }
    const { status, data } = await api.getInsightsSociometricSummary(
      configuredDiseaseAreaId,
      { clientId: configuredClientId, limit: 5 }
    );
    expect(status).toBe(200);
    const d = data as unknown as {
      items: Array<Record<string, unknown> & { brandFlagCounts?: Record<string, number> }>;
    };
    if (d.items.length === 0) {
      console.log('DA has zero HCPs — skipping row-shape assertions');
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

  it('brandColumns is always an array — invariant across analyses', async () => {
    // Runs against the same analysis but confirms the field is always
    // present even when the response items list is empty (no filter,
    // just re-verifies invariant). Two hits give a small blast-radius
    // check that repeated calls stay stable.
    if (!configuredDiseaseAreaId) return;
    for (let i = 0; i < 2; i++) {
      const { status, data } = await api.getInsightsSociometricSummary(
        configuredDiseaseAreaId,
        { clientId: configuredClientId, limit: 1 }
      );
      expect(status).toBe(200);
      const d = data as unknown as { brandColumns?: Array<unknown> };
      expect(Array.isArray(d.brandColumns)).toBe(true);
    }
  });
});
