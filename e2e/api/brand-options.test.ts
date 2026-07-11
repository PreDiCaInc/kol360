/**
 * Brand-Affinity Grid — CampaignBrandOption CRUD (Phase 1 backend).
 *
 * Covers:
 *   - GET /api/v1/campaigns/:id/brand-options on a fresh campaign → []
 *   - PUT /api/v1/campaigns/:id/brand-options happy path (order normalized)
 *   - Zod-side validation (dup names, empty name, >40 chars, dup order,
 *     too many brands)
 *   - Freeze enforcement (409 once `brandsFrozenAt` is set)
 *
 * Ticket: docs/findings/brand-affinity-grid-nomination-plan-2026-07-08.md
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { ApiClient } from '../api-client';
import { TEST_IDS, generateTestCampaignName } from '../fixtures';

const skipIfNoAuth = !config.authToken;
const prisma = new PrismaClient();

describe.skipIf(skipIfNoAuth)('Brand-Affinity Grid — brand-options CRUD', () => {
  const api = new ApiClient();
  let campaignId: string | null = null;

  beforeAll(async () => {
    console.log(`Testing against: ${config.apiUrl}`);
    const { status, data } = await api.createCampaign({
      name: generateTestCampaignName(),
      clientId: TEST_IDS.CLIENT_ID,
      diseaseAreaId: TEST_IDS.DISEASE_AREA_ID,
      description: 'Brand-affinity grid backend test',
    });
    expect(status).toBe(201);
    campaignId = data.id;
    console.log(`Created campaign ${campaignId}`);
  });

  afterAll(async () => {
    if (campaignId) {
      try {
        // Reset the freeze so cleanup doesn't fight the guard on any
        // subsequent PUT the delete cascade may trigger. Best-effort.
        await prisma.campaign.updateMany({
          where: { id: campaignId },
          data: { brandsFrozenAt: null },
        });
        await api.cleanupTestCampaign(campaignId);
      } catch (err) {
        console.warn(`Cleanup failed for campaign ${campaignId}:`, err);
      }
    }
    await prisma.$disconnect();
  });

  describe('GET /brand-options', () => {
    it('returns { brandOptions: [], brandsFrozenAt: null } on a fresh campaign', async () => {
      const { status, data } = await api.getBrandOptions(campaignId!);
      expect(status).toBe(200);
      expect(data.brandOptions).toEqual([]);
      expect(data.brandsFrozenAt).toBeNull();
    });

    it('returns 404 for a nonexistent campaign id', async () => {
      const { status } = await api.getBrandOptions('cme2e0nonexistent001x');
      expect(status).toBe(404);
    });
  });

  describe('PUT /brand-options — happy path', () => {
    it('creates the brand list and normalizes displayOrder to 0..N-1', async () => {
      const { status, data } = await api.upsertBrandOptions(campaignId!, [
        { brandName: 'Xiidra', displayOrder: 5 },
        { brandName: 'Restasis', displayOrder: 7 },
        { brandName: 'Cequa', displayOrder: 9 },
      ]);
      expect(status).toBe(200);
      expect(data.brandOptions).toBeDefined();
      expect(data.brandOptions!.length).toBe(3);
      // Displayed in payload order, normalized to 0..N-1
      expect(data.brandOptions!.map((b) => b.brandName)).toEqual([
        'Xiidra',
        'Restasis',
        'Cequa',
      ]);
      expect(data.brandOptions!.map((b) => b.displayOrder)).toEqual([0, 1, 2]);
      // Each has a real id + campaign scope
      for (const b of data.brandOptions!) {
        expect(b.id).toMatch(/^c/); // cuid prefix
        expect(b.campaignId).toBe(campaignId);
      }
    });

    it('a subsequent GET returns the same list ordered by displayOrder', async () => {
      const { status, data } = await api.getBrandOptions(campaignId!);
      expect(status).toBe(200);
      expect(data.brandOptions.map((b) => b.brandName)).toEqual([
        'Xiidra',
        'Restasis',
        'Cequa',
      ]);
      expect(data.brandsFrozenAt).toBeNull();
    });

    it('full-replacement upsert: sending a shorter list drops the removed brand', async () => {
      const { status, data } = await api.upsertBrandOptions(campaignId!, [
        { brandName: 'Xiidra', displayOrder: 0 },
        { brandName: 'Restasis', displayOrder: 1 },
      ]);
      expect(status).toBe(200);
      expect(data.brandOptions!.map((b) => b.brandName)).toEqual([
        'Xiidra',
        'Restasis',
      ]);

      // Verify persisted state — no orphaned "Cequa" row.
      const { data: after } = await api.getBrandOptions(campaignId!);
      expect(after.brandOptions.map((b) => b.brandName)).toEqual([
        'Xiidra',
        'Restasis',
      ]);
    });
  });

  describe('PUT /brand-options — Zod validation', () => {
    it('rejects an empty brand name with 400', async () => {
      const { status } = await api.upsertBrandOptions(campaignId!, [
        { brandName: '', displayOrder: 0 },
      ]);
      expect(status).toBe(400);
    });

    it('rejects a brand name over 40 chars with 400', async () => {
      const { status } = await api.upsertBrandOptions(campaignId!, [
        { brandName: 'X'.repeat(41), displayOrder: 0 },
      ]);
      expect(status).toBe(400);
    });

    it('rejects duplicate brand names (case-insensitive) with 400', async () => {
      const { status } = await api.upsertBrandOptions(campaignId!, [
        { brandName: 'Xiidra', displayOrder: 0 },
        { brandName: 'XIIDRA', displayOrder: 1 },
      ]);
      expect(status).toBe(400);
    });

    it('rejects duplicate displayOrder values with 400', async () => {
      const { status } = await api.upsertBrandOptions(campaignId!, [
        { brandName: 'Xiidra', displayOrder: 0 },
        { brandName: 'Restasis', displayOrder: 0 },
      ]);
      expect(status).toBe(400);
    });

    it('rejects an empty brands array with 400', async () => {
      const { status } = await api.upsertBrandOptions(campaignId!, []);
      expect(status).toBe(400);
    });

    it('rejects payloads with more than 20 brands with 400', async () => {
      const too_many = Array.from({ length: 21 }, (_, i) => ({
        brandName: `Brand${i}`,
        displayOrder: i,
      }));
      const { status } = await api.upsertBrandOptions(campaignId!, too_many);
      expect(status).toBe(400);
    });

    it('happy path still works after the validation failures', async () => {
      // The DB row set should still be [Xiidra, Restasis] from earlier tests.
      const { data } = await api.getBrandOptions(campaignId!);
      expect(data.brandOptions.map((b) => b.brandName)).toEqual([
        'Xiidra',
        'Restasis',
      ]);
    });
  });

  describe('PUT /brand-options — freeze enforcement (item O)', () => {
    it('returns 409 with brandsFrozenAt when the freeze is set', async () => {
      // Simulate what survey-taking's completion path does: fake a
      // brandsFrozenAt timestamp on the campaign. Real freeze is
      // exercised end-to-end in full-workflow.test.ts (Phase 4+).
      const frozenAt = new Date('2026-07-10T12:00:00Z');
      await prisma.campaign.update({
        where: { id: campaignId! },
        data: { brandsFrozenAt: frozenAt },
      });

      const { status, data } = await api.upsertBrandOptions(campaignId!, [
        { brandName: 'ShouldNotSave', displayOrder: 0 },
      ]);
      expect(status).toBe(409);
      expect(data.brandsFrozenAt).toBe(frozenAt.toISOString());
      // Persisted list is unchanged.
      const { data: after } = await api.getBrandOptions(campaignId!);
      expect(after.brandOptions.map((b) => b.brandName)).toEqual([
        'Xiidra',
        'Restasis',
      ]);
      expect(after.brandsFrozenAt).toBe(frozenAt.toISOString());
    });

    it('unfreezing (dev-only escape hatch) restores mutability', async () => {
      // Real product does NOT expose an unfreeze API; this is a DB-
      // level reset so the test's afterAll cleanup can drop the row.
      // Included in the same test file to prove the freeze is the ONLY
      // thing keeping the write path closed.
      await prisma.campaign.update({
        where: { id: campaignId! },
        data: { brandsFrozenAt: null },
      });
      const { status } = await api.upsertBrandOptions(campaignId!, [
        { brandName: 'Xiidra', displayOrder: 0 },
        { brandName: 'Restasis', displayOrder: 1 },
      ]);
      expect(status).toBe(200);
    });
  });
});
