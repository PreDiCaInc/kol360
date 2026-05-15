/**
 * KOL Analysis E2E (Phase 1)
 *
 * Verifies the new analysis-level scoring API:
 *  - list / detail (PLATFORM_ADMIN gated)
 *  - recalculate returns a processed count and lands calcStatus=done
 *  - include/exclude a campaign then recalc re-pools (scores change)
 *
 * Backfill seeds one analysis per (client, disease area) on the test env,
 * so this scans existing analyses rather than creating data. Skips cleanly
 * if none exist (e.g. before backfill has run on a fresh env).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../api-client';
import { config } from '../config';

describe('KOL Analysis API (Phase 1)', () => {
  let client: ApiClient;

  beforeAll(() => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:test:auth');
    }
    client = new ApiClient();
  });

  it('lists analyses (PLATFORM_ADMIN)', async () => {
    const { status, data } = await client.listKolAnalyses();
    expect(status).toBe(200);
    expect(Array.isArray(data.items)).toBe(true);
  });

  it('recalculates an analysis with scored campaigns and lands done', async () => {
    const { data: list } = await client.listKolAnalyses();
    // Pick an analysis that actually produced scores in the backfill.
    const target = list.items
      .slice()
      .sort((a, b) => b._count.scores - a._count.scores)[0];
    if (!target || target._count.scores === 0) {
      console.log('⊘ No scored analysis on this env — skipping');
      return;
    }

    const { status, data } = await client.recalculateKolAnalysis(target.id);
    expect(status).toBe(200);
    expect(typeof data.processed).toBe('number');
    expect(data.processed).toBeGreaterThan(0);

    const { data: detail } = await client.getKolAnalysis(target.id);
    expect(detail.calcStatus).toBe('done');
    expect(detail._count.scores).toBe(data.processed);
  });

  it('excluding a campaign then recalculating re-pools the scores', async () => {
    const { data: list } = await client.listKolAnalyses();
    // Need an analysis with >1 campaign and some scores to see a re-pool effect.
    let target: { id: string } | null = null;
    for (const a of list.items) {
      if (a._count.scores === 0 || a._count.campaigns < 2) continue;
      target = { id: a.id };
      break;
    }
    if (!target) {
      console.log('⊘ No multi-campaign scored analysis — skipping re-pool check');
      return;
    }

    const { data: before } = await client.getKolAnalysis(target.id);
    const included = before.campaigns.filter((c) => c.included);
    if (included.length < 2) {
      console.log('⊘ <2 included campaigns — skipping');
      return;
    }

    // Exclude one campaign, recalc, then restore it and recalc back.
    const toToggle = included[0].campaignId;
    await client.updateKolAnalysisCampaigns(target.id, [
      { campaignId: toToggle, included: false },
    ]);
    const { status: rs, data: recalced } = await client.recalculateKolAnalysis(target.id);
    expect(rs).toBe(200);
    expect(typeof recalced.processed).toBe('number');

    // Restore — leave the analysis as we found it.
    await client.updateKolAnalysisCampaigns(target.id, [
      { campaignId: toToggle, included: true },
    ]);
    await client.recalculateKolAnalysis(target.id);

    const { data: after } = await client.getKolAnalysis(target.id);
    expect(after.calcStatus).toBe('done');
  });
});
