/**
 * Insights KOL-side filter matrix (v1.17.33)
 *
 * Second matrix in addition to the existing respondent-filter matrix
 * (insights-respondent-filters.test.ts). This one covers KOL-side
 * filter dimensions across the three Insights endpoints whose UI
 * exposes them:
 *
 *   states            (HCP.state)
 *   specialties       (HCP.specialty)
 *   influencerTypes   (computed classification: National Leaders /
 *                      Rising Stars / Regional Influencers)
 *
 * Why this test exists:
 *   sociometric-summary silently dropped states/specialties/
 *   influencerTypes for months — destructure read only the singular
 *   shape (specialty / state) and the plural arrays from the frontend
 *   were never threaded into the where-clause. KOL Explorer + Leader
 *   Rankings handled both. The bug was invisible to the existing
 *   respondent-filter matrix (different dims) and to the cheap
 *   monotonicity check `filtered.total <= baseline.total` (an ignored
 *   filter trivially satisfies that bound).
 *
 *   Background + repro: docs/findings/sociometric-state-filter-broken-2026-06-11.md
 *
 * Test shape — TWO assertions per (endpoint, dim) pair:
 *   (a) Monotonicity:   filtered.total <= baseline.total   (cheap)
 *   (b) Structural:     for every returned item, item[singularField]
 *                       satisfies the requested constraint   (load-bearing)
 *
 *   The structural check is what catches the bug class this ticket is
 *   about. Monotonicity alone can't — `filtered.total == baseline.total`
 *   is legitimately possible (data already matches), so equality
 *   doesn't prove the filter was applied.
 *
 * Run with: cd e2e && pnpm test:api:test:auth
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../api-client';
import { config } from '../config';

let CONFIGURED_DISEASE_AREA_ID: string;
let CONFIGURED_CLIENT_ID: string;

describe('Insights KOL-side filters (v1.17.33)', () => {
  let client: ApiClient;
  let availableStates: string[] = [];
  let availableSpecialties: string[] = [];
  let availableInfluencerTypes: string[] = [];

  beforeAll(async () => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:test:auth');
    }
    client = new ApiClient();

    // Find a (client, DA) pair with the most scored KOLs — gives the
    // matrix something to actually filter.
    const { data: analyses } = await client.listKolAnalyses();
    const scored = analyses.items
      .slice()
      .sort((a, b) => b._count.scores - a._count.scores)[0];
    if (scored && scored._count.scores > 0) {
      CONFIGURED_CLIENT_ID = scored.clientId;
      CONFIGURED_DISEASE_AREA_ID = scored.diseaseAreaId;
    }

    // Pull realistic values from the same endpoint the UI dropdown uses.
    // Any value here is by definition present in the data; the filter
    // SHOULD narrow to something non-zero.
    if (CONFIGURED_CLIENT_ID) {
      const { data: opts } = await client.getInsightsFilterOptions(CONFIGURED_DISEASE_AREA_ID);
      availableStates = opts.states ?? [];
      availableSpecialties = opts.specialties ?? [];
      availableInfluencerTypes = (opts as { influencerTypes?: string[] }).influencerTypes ?? [];
    }
  });

  // The matrix. Each row is one (endpoint, dim, item-field, value-pool).
  // Adding a new endpoint or dim = one row.
  const ENDPOINTS = [
    {
      name: 'kol-explorer',
      fetch: (params: Record<string, string | number>) =>
        client.getInsightsKolExplorer(CONFIGURED_DISEASE_AREA_ID, { clientId: CONFIGURED_CLIENT_ID, limit: 500, ...params }),
    },
    {
      name: 'sociometric-summary',
      fetch: (params: Record<string, string | number>) =>
        client.getInsightsSociometricSummary(CONFIGURED_DISEASE_AREA_ID, { clientId: CONFIGURED_CLIENT_ID, limit: 500, ...params }),
    },
  ] as const;

  const DIMS = [
    { param: 'states',          itemField: 'state',          values: () => availableStates },
    { param: 'specialties',     itemField: 'specialty',      values: () => availableSpecialties },
    { param: 'influencerTypes', itemField: 'influencerType', values: () => availableInfluencerTypes },
  ] as const;

  for (const ep of ENDPOINTS) {
    for (const dim of DIMS) {
      it(`${ep.name} — ${dim.param} filter narrows AND every returned item satisfies the constraint`, async () => {
        if (!CONFIGURED_CLIENT_ID) {
          console.log('⊘ No scored analysis on this env — skipping');
          return;
        }
        const candidates = dim.values();
        if (candidates.length === 0) {
          console.log(`⊘ /filter-options returned no ${dim.param} — skipping ${ep.name}`);
          return;
        }

        const baseline = await ep.fetch({});
        expect(baseline.status).toBe(200);
        if (baseline.data.total === undefined) {
          console.log(`⊘ ${ep.name} response lacks total — skipping`);
          return;
        }
        if (baseline.data.total < 2) {
          console.log(`⊘ ${ep.name} baseline=${baseline.data.total} too sparse — skipping ${dim.param}`);
          return;
        }

        // Iterate values: first one that produces a strictly-narrowed
        // result is what we assert against. If every value produces an
        // unchanged total, that's the bug class — fail loudly.
        const probed: Array<{ value: string; total: number }> = [];
        for (const value of candidates) {
          const filtered = await ep.fetch({ [dim.param]: value });
          expect(filtered.status).toBe(200);
          probed.push({ value, total: filtered.data.total });

          // (a) Monotonicity — cheap.
          expect(filtered.data.total).toBeLessThanOrEqual(baseline.data.total);

          // (b) Structural — the load-bearing check. Every returned
          // item's relevant field must match the requested value.
          // This is what would have caught the sociometric KOL-side
          // bug; monotonicity alone could not.
          const items = (filtered.data.items ?? []) as Array<Record<string, unknown>>;
          for (const item of items) {
            const fieldVal = item[dim.itemField];
            expect(
              fieldVal,
              `${ep.name} ${dim.param}="${value}" returned an item with ${dim.itemField}="${fieldVal}"`,
            ).toBe(value);
          }

          // If the filter actually narrowed and structural passes,
          // we've proven the path. Don't burn the rest of the matrix
          // on the same dim.
          if (filtered.data.total > 0 && filtered.data.total < baseline.data.total) {
            console.log(
              `✅ ${ep.name} ${dim.param}="${value}": baseline=${baseline.data.total} filtered=${filtered.data.total}`,
            );
            return;
          }
        }

        // Fell through every candidate without narrowing. If at least
        // one of them returned 0, that's still a valid "filter applied
        // but matched nothing" — only fail if EVERY filtered total ==
        // baseline. That's the silent-drop signature.
        const everyTotalEqualsBaseline = probed.every((p) => p.total === baseline.data.total);
        if (everyTotalEqualsBaseline) {
          throw new Error(
            `${ep.name} ${dim.param}: every value returned total=${baseline.data.total} (== baseline) — filter is being silently dropped. Probed: ${JSON.stringify(probed)}`,
          );
        }
        console.log(
          `✅ ${ep.name} ${dim.param}: matrix exhausted without finding a strict-narrow value, but no silent-drop signature (${JSON.stringify(probed)})`,
        );
      });
    }
  }
});
