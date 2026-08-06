/**
 * HCP bulk-import audit — `oldValues` populated on `hcp.updated` rows
 * (v2.1.2, prod-rel-5.1.2)
 *
 * Regression coverage for
 * docs/findings/bulk-import-no-oldvalues-blocks-surgical-revert-2026-08-05.md.
 *
 * On 2026-08-04 a sort-mangled CSV corrupted 416 HCPs (Jen Pikor
 * incident, 411 updated + 5 created). Recovery was possible because
 * a clean source file existed and upsert-on-OneKey-ID overwrote back to
 * correct values. But surgical revert via AuditLog was OFF THE TABLE —
 * every `hcp.updated` row written by the bulk-import path had
 * `oldValues = NULL`. On the next incident without a clean source file,
 * the only option would have been RDS point-in-time restore (nuclear).
 *
 * v2.1.2 closes the gap by populating `oldValues` inside the same
 * transaction, keyed off the pre-existing bulk-load of `existingHcps`
 * in `hcp.service.ts:importFromFile`. This test asserts the fix is live.
 *
 * DB PREREQUISITES:
 *   Needs `DATABASE_URL` pointed at the same DB the API is talking to
 *   (SSH tunnel port 5432 for test env; direct for local). Same
 *   contract as canada-hcp-isolation.test.ts.
 *
 * Run: cd e2e && pnpm test:api:test:auth
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ApiClient } from '../api-client';
import { config } from '../config';

const prisma = new PrismaClient();
const skipIfNoAuth = !config.authToken;
const TEST_PREFIX = 'E2E_AUDIT_OLDVALUES_';

/**
 * Generates a fresh 10-digit NPI in a range unused by prod / other
 * fixture files (`98…`), collision-safe across parallel test runs via
 * a timestamp fragment.
 */
function freshNpi(offset = 0): string {
  const base = (Date.now() + offset) % 100_000_000;
  return '98' + String(base).padStart(8, '0');
}

describe.skipIf(skipIfNoAuth)('HCP bulk-import audit — oldValues populated (v2.1.2)', () => {
  let api: ApiClient;
  let dbAvailable = false;

  beforeAll(async () => {
    api = new ApiClient();
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : String(e);
      console.log(`⚠️ Prisma probe failed (${msg}) — audit assertions will skip`);
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('populates oldValues on the hcp.updated audit rows from /hcps/import (was NULL pre-v2.1.2)', async () => {
    if (!dbAvailable) {
      console.log('Skipping: DB not reachable via Prisma');
      return;
    }

    // Phase 1 — seed two known HCPs via CSV import (CREATE branch).
    const npi1 = freshNpi(0);
    const npi2 = freshNpi(1);
    const originalEmail1 = `${TEST_PREFIX.toLowerCase()}${npi1}@e2e.example.com`;
    const originalEmail2 = `${TEST_PREFIX.toLowerCase()}${npi2}@e2e.example.com`;
    const createCsv = [
      'NPI,First Name,Last Name,Email,Specialty,City,State',
      `${npi1},${TEST_PREFIX}Alpha,Original1,${originalEmail1},Optometry,Lexington,KY`,
      `${npi2},${TEST_PREFIX}Beta,Original2,${originalEmail2},Ophthalmology,Denver,CO`,
    ].join('\n');
    const created = await api.importHcps(createCsv, `${TEST_PREFIX}create.csv`);
    expect(created.status).toBe(200);
    expect(created.data.created).toBeGreaterThanOrEqual(2);

    // Phase 2 — UPDATE the same two HCPs via a second CSV. This is the
    // codepath that pre-v2.1.2 wrote `oldValues = NULL`.
    const updatedEmail1 = `${TEST_PREFIX.toLowerCase()}${npi1}.updated@e2e.example.com`;
    const updatedEmail2 = `${TEST_PREFIX.toLowerCase()}${npi2}.updated@e2e.example.com`;
    const updateCsv = [
      'NPI,First Name,Last Name,Email,Specialty,City,State',
      `${npi1},${TEST_PREFIX}Alpha,Updated1,${updatedEmail1},Ophthalmology,Boston,MA`,
      `${npi2},${TEST_PREFIX}Beta,Updated2,${updatedEmail2},Optometry,Miami,FL`,
    ].join('\n');
    const updated = await api.importHcps(updateCsv, `${TEST_PREFIX}update.csv`);
    expect(updated.status).toBe(200);
    expect(updated.data.updated).toBeGreaterThanOrEqual(2);
    expect(updated.data.errors).toEqual([]);
    const batchId = updated.data.batchId;
    expect(batchId, 'update batch should carry a batchId in the response').toBeTruthy();

    // Phase 3 — read the AuditLog rows for the UPDATE batch. Filter to
    // action='hcp.updated' rows whose newValues.batchId matches the
    // batch we just wrote (the metadata shape the service emits).
    const hcps = await prisma.hcp.findMany({
      where: { npi: { in: [npi1, npi2] } },
      select: { id: true, npi: true },
    });
    expect(hcps.length).toBe(2);
    const hcpIdByNpi = new Map(hcps.map((h) => [h.npi, h.id]));

    const auditRows = await prisma.auditLog.findMany({
      where: {
        action: 'hcp.updated',
        entityId: { in: hcps.map((h) => h.id) },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Two rows (one per HCP), both from THIS batch.
    const batchRows = auditRows.filter((r) => {
      const nv = r.newValues as { batchId?: string } | null;
      return nv?.batchId === batchId;
    });
    expect(batchRows.length, `expected 2 hcp.updated rows for batch ${batchId}`).toBe(2);

    // Phase 4 — the assertion this test exists for. Every row's
    // `oldValues` must be non-null and must carry the pre-image fields
    // that were about to be overwritten (email, city, specialty).
    for (const row of batchRows) {
      expect(row.oldValues, `oldValues on ${row.id} must not be NULL`).not.toBeNull();
      const oldValues = row.oldValues as Record<string, unknown>;
      // Fields common to both HCPs — email is the highest-signal audit
      // field (customer support most often needs "what was the email
      // before this batch touched it?"). Also assert specialty + city
      // are captured since those were the pteam-called-out fields in
      // the finding doc.
      expect(oldValues).toHaveProperty('email');
      expect(oldValues).toHaveProperty('specialty');
      expect(oldValues).toHaveProperty('city');
      expect(oldValues).toHaveProperty('firstName');
      expect(oldValues).toHaveProperty('lastName');
      // And the pre-image must match what we seeded in Phase 1 for
      // whichever HCP this row corresponds to.
      const npi = row.entityId === hcpIdByNpi.get(npi1) ? npi1 : npi2;
      if (npi === npi1) {
        expect(oldValues.email).toBe(originalEmail1);
        expect(oldValues.specialty).toBe('Optometry');
        expect(oldValues.city).toBe('Lexington');
        expect(oldValues.state).toBe('KY');
        expect(oldValues.lastName).toBe('Original1');
      } else {
        expect(oldValues.email).toBe(originalEmail2);
        expect(oldValues.specialty).toBe('Ophthalmology');
        expect(oldValues.city).toBe('Denver');
        expect(oldValues.state).toBe('CO');
        expect(oldValues.lastName).toBe('Original2');
      }
      // newValues still carries the batch metadata (source/batchId/fileName).
      const newValues = row.newValues as Record<string, unknown>;
      expect(newValues.source).toBe('bulk_import');
      expect(newValues.batchId).toBe(batchId);
      expect(newValues.fileName).toBe(`${TEST_PREFIX}update.csv`);
    }
  });

  it('hcp.created audit rows from /hcps/import legitimately have oldValues = NULL', async () => {
    if (!dbAvailable) {
      console.log('Skipping: DB not reachable via Prisma');
      return;
    }

    // CREATE-branch rows never had a pre-image and MUST stay NULL —
    // the fix targets updates only. Sanity check that we haven't
    // accidentally broadened the fix.
    const npi = freshNpi(2);
    const email = `${TEST_PREFIX.toLowerCase()}${npi}@e2e.example.com`;
    const csv = [
      'NPI,First Name,Last Name,Email,Specialty,City,State',
      `${npi},${TEST_PREFIX}Gamma,CreatedOnly,${email},Optometry,Austin,TX`,
    ].join('\n');
    const res = await api.importHcps(csv, `${TEST_PREFIX}created-only.csv`);
    expect(res.status).toBe(200);
    expect(res.data.created).toBeGreaterThanOrEqual(1);
    const batchId = res.data.batchId;
    expect(batchId).toBeTruthy();

    const hcp = await prisma.hcp.findUnique({ where: { npi }, select: { id: true } });
    expect(hcp).not.toBeNull();

    const createdRows = await prisma.auditLog.findMany({
      where: {
        action: 'hcp.created',
        entityId: hcp!.id,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    const batchCreatedRows = createdRows.filter((r) => {
      const nv = r.newValues as { batchId?: string } | null;
      return nv?.batchId === batchId;
    });
    expect(batchCreatedRows.length).toBeGreaterThanOrEqual(1);
    for (const row of batchCreatedRows) {
      expect(row.oldValues, 'hcp.created rows must have oldValues = NULL (no pre-image)').toBeNull();
    }
  });

  it('campaign-scoped /campaigns/:id/import-hcps also populates oldValues on updates (distribution.service.ts path)', async () => {
    if (!dbAvailable) {
      console.log('Skipping: DB not reachable via Prisma');
      return;
    }

    // Seed an HCP via the primary path, then update it via the
    // campaign-scoped path (different service — distribution.service.ts).
    // Both paths must land oldValues consistently.
    const npi = freshNpi(3);
    const originalEmail = `${TEST_PREFIX.toLowerCase()}${npi}@e2e.example.com`;
    const seedRes = await api.importHcps(
      [
        'NPI,First Name,Last Name,Email,Specialty,City,State',
        `${npi},${TEST_PREFIX}Delta,SeedThenCampaign,${originalEmail},Optometry,Reno,NV`,
      ].join('\n'),
      `${TEST_PREFIX}seed-for-campaign.csv`
    );
    expect(seedRes.status).toBe(200);

    // Create a fresh test campaign to use as the scope.
    const campaign = await api.createTestCampaign({
      description: 'v2.1.2 audit oldValues coverage for campaign-scoped bulk import',
    });
    expect([200, 201]).toContain(campaign.status);
    const campaignId = campaign.data.id;

    // Import via campaign-scoped route (uses distribution.service.ts).
    const updateEmail = `${TEST_PREFIX.toLowerCase()}${npi}.viacampaign@e2e.example.com`;
    const updateCsv = [
      'NPI,First Name,Last Name,Email,Specialty,City,State',
      `${npi},${TEST_PREFIX}Delta,ViaCampaign,${updateEmail},Ophthalmology,Portland,OR`,
    ].join('\n');
    const upd = await api.importHcpsFromCsv(
      campaignId,
      updateCsv,
      `${TEST_PREFIX}campaign-update.csv`
    );
    expect(upd.status).toBe(200);

    const hcp = await prisma.hcp.findUnique({ where: { npi }, select: { id: true } });
    expect(hcp).not.toBeNull();

    // Look for the hcp.updated row emitted by distribution.service.ts.
    // Signature: newValues.{_source: 'campaign-import', _campaignId: <id>}.
    const auditRows = await prisma.auditLog.findMany({
      where: {
        action: 'hcp.updated',
        entityId: hcp!.id,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    const campaignRow = auditRows.find((r) => {
      const nv = r.newValues as { _source?: string; _campaignId?: string } | null;
      return nv?._source === 'campaign-import' && nv?._campaignId === campaignId;
    });
    expect(
      campaignRow,
      'expected a hcp.updated row from the campaign-scoped bulk-import path'
    ).toBeTruthy();
    expect(campaignRow!.oldValues, 'campaign-import oldValues must not be NULL').not.toBeNull();
    const oldValues = campaignRow!.oldValues as Record<string, unknown>;
    expect(oldValues.email).toBe(originalEmail);
    expect(oldValues.specialty).toBe('Optometry');
    expect(oldValues.city).toBe('Reno');
    expect(oldValues.state).toBe('NV');
  });
});

// Suppress unused-import warning when the suite skips.
void config;
