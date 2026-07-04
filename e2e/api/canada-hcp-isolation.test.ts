/**
 * Canada HCP isolation soak — automated version of soak Phase B
 * (releases/prod-rel-4.1.49-soak-checks.md).
 *
 * Previously B1–B5 required manual `psql INSERT` + eyeball checks
 * against the KOL Explorer UI. This test does it end-to-end: seed a
 * CA-country HCP + score row, run the client-scoped Insights queries,
 * verify structural isolation from US dashboards, cleanup.
 *
 * Country isolation contract (v1.17.69 / Phase 2):
 *   - GET /hcps?country=CA returns the CA HCP;
 *     GET /hcps?country=US does not.
 *   - Insights KOL Explorer for a US client omits the CA HCP even when
 *     the score row exists in the same DiseaseArea.
 *   - Leader Rankings for a US client omits the CA HCP.
 *   - Sociometric Summary for a US client omits the CA HCP.
 *   - KOL Profile drill-down for a US-scoped dashboard rejects the CA
 *     HCP's id (either 404 or a null profile).
 *
 * DB PREREQUISITES:
 *   Needs DATABASE_URL pointed at the same DB the API is talking to
 *   (SSH tunnel port 5432 for test env; direct for local).
 *   If the probe fails, the test skips gracefully.
 *
 * Ticket: docs/findings/canada-hcp-support-lite-plan-2026-06-25.md
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ApiClient } from '../api-client';
import { config } from '../config';
import { TEST_IDS } from '../fixtures';

const prisma = new PrismaClient();

// A stable, greppable id so a leftover from a killed run is easy to
// find + drop manually. Deterministic across runs so we can idempotent-
// upsert on it.
const CA_FIXTURE_ID = 'cme2e0ca0isolation001';
const CA_FIXTURE_NPI = 'CAMD90000001';
const CA_FIXTURE_BE_ID = 'BE-CA-ISO-001';
const CA_FIXTURE_EMAIL = 'ca.isolation@e2etest.example.com';

describe('Canada HCP isolation — automated soak (v1.17.69)', () => {
  let client: ApiClient;
  let dbAvailable = false;

  beforeAll(async () => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:test:auth');
    }
    client = new ApiClient();

    try {
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : String(e);
      console.log(`⚠️ Prisma probe failed (${msg}) — soak assertions will skip`);
      return;
    }

    // Idempotent seed — delete any prior fixture then create.
    await prisma.hcpDiseaseAreaScore.deleteMany({ where: { hcpId: CA_FIXTURE_ID } });
    await prisma.hcpDiseaseArea.deleteMany({ where: { hcpId: CA_FIXTURE_ID } });
    await prisma.hcp.deleteMany({ where: { id: CA_FIXTURE_ID } });

    await prisma.hcp.create({
      data: {
        id: CA_FIXTURE_ID,
        beId: CA_FIXTURE_BE_ID,
        npi: CA_FIXTURE_NPI,
        nationalIdType: 'MINC',
        country: 'CA',
        firstName: 'Soak',
        lastName: 'CAIsolation',
        email: CA_FIXTURE_EMAIL,
        specialty: 'Ophthalmology',
      },
    });

    // Link to the same DiseaseArea as US test HCPs so we test country
    // isolation in isolation from disease-area scoping.
    await prisma.hcpDiseaseArea.create({
      data: {
        hcpId: CA_FIXTURE_ID,
        diseaseAreaId: TEST_IDS.DISEASE_AREA_ID,
      },
    });

    // Objective score row so KOL Explorer / Leader Rankings have a
    // reason to consider this HCP. Without a score row the filter
    // isolation might succeed by accident (no score → no ranking).
    await prisma.hcpDiseaseAreaScore.create({
      data: {
        hcpId: CA_FIXTURE_ID,
        diseaseAreaId: TEST_IDS.DISEASE_AREA_ID,
        isCurrent: true,
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        scorePublications: 99,
        scoreClinicalTrials: 99,
        scoreTradePubs: 99,
        scoreOrgLeadership: 99,
        scoreOrgAwards: 99,
        scoreConference: 99,
        scoreSocialMedia: 99,
        scoreMediaPodcasts: 99,
      },
    });

    console.log(`✅ Seeded CA fixture ${CA_FIXTURE_ID} (${CA_FIXTURE_NPI})`);
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    try {
      await prisma.hcpDiseaseAreaScore.deleteMany({ where: { hcpId: CA_FIXTURE_ID } });
      await prisma.hcpDiseaseArea.deleteMany({ where: { hcpId: CA_FIXTURE_ID } });
      await prisma.hcp.deleteMany({ where: { id: CA_FIXTURE_ID } });
      console.log(`✅ Cleaned up CA fixture ${CA_FIXTURE_ID}`);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('GET /hcps?country=CA returns the CA fixture; ?country=US omits it', async () => {
    if (!dbAvailable) return;

    const caList = await client.listHcps({ country: 'CA', limit: 100 });
    expect(caList.status).toBe(200);
    const caIds = caList.data.items.map((h) => h.id);
    expect(caIds).toContain(CA_FIXTURE_ID);

    const usList = await client.listHcps({ country: 'US', limit: 100 });
    expect(usList.status).toBe(200);
    const usIds = usList.data.items.map((h) => h.id);
    expect(usIds).not.toContain(CA_FIXTURE_ID);
  });

  it('KOL Explorer for a US client omits the CA HCP even in the same DiseaseArea', async () => {
    if (!dbAvailable) return;

    // TEST_IDS.CLIENT_ID is 'E2E Test Pharma' with defaultCountry='US'
    // (seeded default). The Insights query is scoped to that client via
    // ?clientId, so the country filter should apply.
    const explorer = await client.getInsightsKolExplorer(TEST_IDS.DISEASE_AREA_ID, {
      clientId: TEST_IDS.CLIENT_ID,
      limit: 500,
    });
    expect(explorer.status).toBe(200);

    // KOL Explorer response items are HCP rows; assert none of them is
    // our CA fixture. Access `id` via a defensive cast — the test would
    // false-positive if the schema shape changes silently.
    const ids = ((explorer.data as { items?: Array<{ id?: string }> })?.items ?? [])
      .map((i) => i?.id)
      .filter((v): v is string => typeof v === 'string');
    expect(ids).not.toContain(CA_FIXTURE_ID);
  });

  it('Leader Rankings for a US client omits the CA HCP', async () => {
    if (!dbAvailable) return;

    const rankings = await client.getInsightsLeaderRankings(TEST_IDS.DISEASE_AREA_ID, {
      clientId: TEST_IDS.CLIENT_ID,
      limit: 500,
    });
    expect(rankings.status).toBe(200);

    // Collect every hcp id we can see across whichever list(s) the
    // rankings response contains (schema has drifted historically).
    const collectIds = (val: unknown, into: string[]): void => {
      if (Array.isArray(val)) {
        val.forEach((v) => collectIds(v, into));
        return;
      }
      if (val && typeof val === 'object') {
        const obj = val as Record<string, unknown>;
        if (typeof obj.id === 'string') into.push(obj.id);
        if (typeof obj.hcpId === 'string') into.push(obj.hcpId);
        for (const v of Object.values(obj)) collectIds(v, into);
      }
    };
    const seen: string[] = [];
    collectIds(rankings.data, seen);
    expect(seen).not.toContain(CA_FIXTURE_ID);
  });

  it('Sociometric Summary for a US client omits the CA HCP', async () => {
    if (!dbAvailable) return;

    const socio = await client.getInsightsSociometricSummary(TEST_IDS.DISEASE_AREA_ID, {
      clientId: TEST_IDS.CLIENT_ID,
      limit: 500,
    });
    expect(socio.status).toBe(200);
    const ids = ((socio.data as { items?: Array<{ id?: string; hcpId?: string }> })?.items ?? [])
      .flatMap((i) => [i?.id, i?.hcpId])
      .filter((v): v is string => typeof v === 'string');
    expect(ids).not.toContain(CA_FIXTURE_ID);
  });

  it('KOL Profile drill-down from a US client rejects the CA HCP as cross-country', async () => {
    if (!dbAvailable) return;

    const res = await client.getInsightsKolProfile(
      TEST_IDS.DISEASE_AREA_ID,
      CA_FIXTURE_ID,
      TEST_IDS.CLIENT_ID,
    );

    // The route may either 404 or return 200 with a null/absent profile
    // depending on how the "not found in this country" branch is
    // surfaced. Either is correct — what MUST be true is that no CA
    // HCP data leaks through into a US dashboard's drill-down.
    if (res.status === 404) return; // clean rejection
    expect(res.status).toBe(200);
    const body = res.data as { hcp?: { id?: string; firstName?: string } | null };
    if (body?.hcp) {
      // If a profile was returned at all, it must NOT be our CA fixture.
      expect(body.hcp.id).not.toBe(CA_FIXTURE_ID);
      expect(body.hcp.firstName).not.toBe('Soak');
    }
  });
});
