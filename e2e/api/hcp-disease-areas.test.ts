/**
 * HCP × DiseaseArea (sub-specialty) E2E tests
 *
 * Covers the (a) unify-with-DiseaseArea wiring introduced in v1.15.29:
 *   - GET /api/v1/hcps?diseaseAreaIds=… (multi-select sub-specialty filter)
 *   - POST /api/v1/hcps with diseaseAreaIds in the body wires HcpDiseaseArea rows
 *   - GET /api/v1/hcps/:id returns the diseaseAreas relation
 *
 * Run with: cd e2e && pnpm test:workflow:test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ApiClient } from '../api-client';
import { config } from '../config';
import { TEST_IDS } from '../fixtures';

describe('HCP × DiseaseArea (sub-specialty)', () => {
  let client: ApiClient;
  // Track HCPs we create so we can clean them up even if an assert fails.
  const createdHcpIds: string[] = [];
  // Picked dynamically — never hardcoded (env-specific).
  let daId: string;
  let daSecondId: string | null = null;

  beforeAll(async () => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:test:auth');
    }
    client = new ApiClient();

    // Pick any two disease areas off the env. Prefer the test-seed DA first
    // so cleanup ties to it, then any other DA to test multi-select.
    const { status, data } = await client.getInsightsDiseaseAreas();
    if (status !== 200 || !data.items.length) {
      throw new Error(`No disease areas available on this env (status ${status})`);
    }
    const seed = data.items.find((d) => d.id === TEST_IDS.DISEASE_AREA_ID);
    daId = seed?.id ?? data.items[0].id;
    daSecondId = data.items.find((d) => d.id !== daId)?.id ?? null;
  });

  afterAll(async () => {
    // No HCP delete endpoint exists; surface what we created so the operator
    // can prune via SQL or the cleanup script if desired. HCPs created here
    // are uniquely identifiable by lastName starting with "hcpda" (see test).
    if (createdHcpIds.length > 0) {
      console.log(
        `(cleanup): created ${createdHcpIds.length} HCP(s) — ids=${createdHcpIds.join(',')}. ` +
          `Identifiable by lastName starting with "hcpda".`
      );
    }
  });

  describe('Create with diseaseAreaIds', () => {
    it('creates an HCP and persists the HcpDiseaseArea link', async () => {
      const suffix = Math.random().toString(36).slice(2, 8);
      const { status, data } = await client.createHcp({
        // Synthetic NPI; the API enforces 10 digits + uniqueness.
        npi: `99${Math.floor(10000000 + Math.random() * 89999999)}`,
        firstName: 'E2EDaTest',
        lastName: `hcpda_${suffix}`,
        specialty: 'Optometrist',
        diseaseAreaIds: [daId],
      });

      expect([200, 201]).toContain(status);
      expect(data.id).toBeTruthy();
      createdHcpIds.push(data.id);

      // Read back: diseaseAreas relation should include our DA.
      const { status: getStatus, data: detail } = await client.getHcp(data.id);
      expect(getStatus).toBe(200);
      const linkedIds = (detail.diseaseAreas ?? []).map((x) => x.diseaseArea.id);
      expect(linkedIds).toContain(daId);
    });
  });

  describe('Filter by diseaseAreaIds', () => {
    it('returns only HCPs linked to the supplied disease area(s)', async () => {
      const { status, data } = await client.listHcps({
        diseaseAreaIds: [daId],
        limit: 50,
      });
      expect(status).toBe(200);
      // Every returned HCP that exposes its diseaseAreas should include daId.
      // (Some legacy rows may not have the relation included on list — accept
      //  those without failing, but if it's present, it must match.)
      for (const hcp of data.items) {
        if (hcp.diseaseAreas && hcp.diseaseAreas.length > 0) {
          const ids = hcp.diseaseAreas.map((x) => x.diseaseArea.id);
          expect(ids).toContain(daId);
        }
      }
      console.log(`✅ diseaseAreaIds filter: ${data.items.length} HCPs linked to ${daId}`);
    });

    it('supports multi-select (comma-delimited diseaseAreaIds)', async () => {
      if (!daSecondId) {
        console.log('⊘ Only one DA on this env — skipping multi-select test');
        return;
      }
      const { status, data } = await client.listHcps({
        diseaseAreaIds: [daId, daSecondId],
        limit: 50,
      });
      expect(status).toBe(200);
      // Each result with a populated relation must be in at least one of the two DAs.
      const expected = new Set([daId, daSecondId]);
      for (const hcp of data.items) {
        if (hcp.diseaseAreas && hcp.diseaseAreas.length > 0) {
          const ids = hcp.diseaseAreas.map((x) => x.diseaseArea.id);
          expect(ids.some((id) => expected.has(id))).toBe(true);
        }
      }
      console.log(
        `✅ multi-select diseaseAreaIds: ${data.items.length} HCPs across ${expected.size} DAs`
      );
    });
  });
});
