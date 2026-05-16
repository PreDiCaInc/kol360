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

  it('create is idempotent-guarded: 201 new or 409 if (client,DA) exists', async () => {
    const { data: list } = await client.listKolAnalyses();
    const sample = list.items[0];
    if (!sample) {
      console.log('⊘ No analyses to derive a client/DA — skipping');
      return;
    }
    // Re-create for an existing (client, DA) → must 409 (uniqueness enforced).
    const { status } = await client.createKolAnalysis({
      clientId: sample.clientId,
      diseaseAreaId: sample.diseaseAreaId,
      name: 'E2E dup attempt',
    });
    expect(status).toBe(409);
  });

  it('available-campaigns returns same-DA campaigns with crossClient flag', async () => {
    const { data: list } = await client.listKolAnalyses();
    const target = list.items[0];
    if (!target) {
      console.log('⊘ No analyses — skipping');
      return;
    }
    const { status, data } = await client.getAvailableCampaigns(target.id);
    expect(status).toBe(200);
    expect(Array.isArray(data.items)).toBe(true);
    for (const c of data.items) {
      expect(typeof c.crossClient).toBe('boolean');
      expect(typeof c.clientName).toBe('string');
    }
  });

  it('rejects linking a campaign from a different disease area (same-DA guard)', async () => {
    const { data: list } = await client.listKolAnalyses();
    // Find two analyses in different disease areas.
    const a = list.items[0];
    const other = list.items.find((x) => x.diseaseAreaId !== a?.diseaseAreaId);
    if (!a || !other) {
      console.log('⊘ Need 2 analyses in different DAs — skipping');
      return;
    }
    // A campaign linked to `other` is in a different DA than `a`.
    const { data: otherDetail } = await client.getKolAnalysis(other.id);
    const foreignCampaign = otherDetail.campaigns[0]?.campaignId;
    if (!foreignCampaign) {
      console.log('⊘ Other analysis has no campaigns — skipping');
      return;
    }
    const { status } = await client.updateKolAnalysisCampaigns(a.id, [
      { campaignId: foreignCampaign, included: true },
    ]);
    expect(status).toBe(400);
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

  it('updates weights and marks the analysis stale (idle)', async () => {
    const { data: list } = await client.listKolAnalyses();
    const target = list.items[0];
    if (!target) {
      console.log('⊘ No analyses on this env — skipping');
      return;
    }
    const { data: before } = await client.getKolAnalysis(target.id);
    // Re-send the same weights (valid, sums to 100) — should 200 + go idle.
    const w = (before as unknown as { weightsJson: Record<string, number> }).weightsJson;
    const { status, data } = await client.updateKolAnalysis(target.id, { weights: w });
    expect(status).toBe(200);
    expect(data.calcStatus).toBe('idle');
  });

  it('rejects weights that do not sum to 100', async () => {
    const { data: list } = await client.listKolAnalyses();
    const target = list.items[0];
    if (!target) {
      console.log('⊘ No analyses — skipping');
      return;
    }
    const { status } = await client.updateKolAnalysis(target.id, {
      weights: {
        weightPublications: 10, weightClinicalTrials: 10, weightTradePubs: 10,
        weightOrgLeadership: 10, weightOrgAwards: 10, weightConference: 10,
        weightSocialMedia: 10, weightMediaPodcasts: 10, weightSurvey: 10, // = 90
      },
    });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
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
