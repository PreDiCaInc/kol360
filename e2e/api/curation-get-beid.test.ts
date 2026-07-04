/**
 * POST /api/v1/hcps/get-beid — curation M2M integration E2E
 *
 * Mirrors the 2a/2b/2c curl checklist from
 *   kolcuration/spec/dba-ticket-kol360-deploy-sync-endpoints-koltest.md
 *
 * Auth: Cognito client_credentials grant against the
 *   `curation-svc-to-kol360` confidential client (id 5ml2abmii9ot8eesu6birg5dmq).
 * Required env (test runner sets these; locally fetch via
 *   `aws secretsmanager get-secret-value` per
 *   kolcuration/spec/dba-reply-cognito-service-accounts-done.md §Q3):
 *
 *   E2E_CURATION_M2M_CLIENT_ID
 *   E2E_CURATION_M2M_CLIENT_SECRET
 *   E2E_COGNITO_DOMAIN          (e.g. us-east-263cjvtav9.auth.us-east-2.amazoncognito.com)
 *
 * When any of those are absent the whole suite skips with a console
 * note — same pattern other auth-gated suites use. Doesn't fail CI for
 * envs that aren't M2M-provisioned (e.g. legacy local dev).
 *
 * Run: cd e2e && pnpm test:api:test  (M2M token minted at beforeAll)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { config, getApiUrl } from '../config';

const M2M_CLIENT_ID = process.env.E2E_CURATION_M2M_CLIENT_ID;
const M2M_CLIENT_SECRET = process.env.E2E_CURATION_M2M_CLIENT_SECRET;
const COGNITO_DOMAIN = process.env.E2E_COGNITO_DOMAIN;
const REQUESTED_SCOPE = 'kol360-api/hcps:write-stub';

// Stable across the suite — minted once in beforeAll, reused across tests.
let m2mToken: string | null = null;
// Cleanup list — any Hcp we mint via the route, we delete after.
const mintedHcpIds: string[] = [];
let prisma: PrismaClient | null = null;

// 10-digit NPI generated per-suite-run so re-runs don't collide on the
// `Hcp.npi @unique` constraint. Format: 9 + (epoch milliseconds mod 999999999).
function freshNpi(): string {
  const suffix = String(Date.now() % 1_000_000_000).padStart(9, '0');
  return `9${suffix}`;
}

// v1.17.71 — 12-char CAMD######## MINC. Serial derived from epoch so
// re-runs land on unique values.
function freshMinc(): string {
  const suffix = String(Date.now() % 100_000_000).padStart(8, '0');
  return `CAMD${suffix}`;
}

async function mintM2MToken(): Promise<string | null> {
  if (!M2M_CLIENT_ID || !M2M_CLIENT_SECRET || !COGNITO_DOMAIN) return null;
  const creds = Buffer.from(`${M2M_CLIENT_ID}:${M2M_CLIENT_SECRET}`).toString('base64');
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: REQUESTED_SCOPE,
  });
  const res = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    console.warn(`Failed to mint M2M token: ${res.status} ${body.slice(0, 200)}`);
    return null;
  }
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

async function postGetBeId(token: string, body: Record<string, unknown>) {
  const res = await fetch(getApiUrl('/api/v1/hcps/get-beid'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = (await res.json()) as Record<string, unknown>;
  } catch {
    /* non-JSON body — leave parsed undefined */
  }
  return { status: res.status, data: parsed };
}

describe('POST /api/v1/hcps/get-beid — curation M2M integration', () => {
  beforeAll(async () => {
    m2mToken = await mintM2MToken();
    if (!m2mToken) {
      console.log('⊘ M2M env vars missing — skipping curation get-beid suite');
      return;
    }
    // Prisma is used post-call to verify schema-side state (curationManagedAt,
    // discoveredFrom). Connect lazily so legacy envs that don't have the
    // DATABASE_URL exposed don't break the whole suite.
    try {
      prisma = new PrismaClient();
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      console.log('⊘ DB connection failed — DB-side assertions will skip');
      prisma = null;
    }
  }, 15_000);

  afterAll(async () => {
    if (prisma && mintedHcpIds.length > 0) {
      await prisma.hcp.deleteMany({ where: { id: { in: mintedHcpIds } } }).catch(() => undefined);
    }
    if (prisma) await prisma.$disconnect();
  });

  it.skipIf(!m2mToken)('rejects unauthenticated request with 401', async () => {
    const res = await fetch(getApiUrl('/api/v1/hcps/get-beid'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it.skipIf(!m2mToken)(
    '2a — POST with new NPI mints a fresh beId (wasExisting=false, npi populated)',
    async () => {
      if (!m2mToken) return; // satisfy TS: skipIf already short-circuited
      const npi = freshNpi();
      const { status, data } = await postGetBeId(m2mToken, {
        firstName: 'Smoke',
        lastName: 'Test',
        specialty: 'Ophthalmology',
        npi,
        discoveredFrom: {
          source_url: 'https://example.com/x',
          scraper_run_id: `smoke-${Date.now()}`,
          ai_verification_snapshot_url: 's3://x/x.html',
          captured_at: new Date().toISOString(),
        },
      });
      expect(status).toBe(201);
      expect(data).toMatchObject({
        beId: expect.stringMatching(/^BE-\d{6}$/),
        id: expect.any(String),
        createdAt: expect.any(String),
        wasExisting: false,
      });

      const hcpId = data?.id as string;
      mintedHcpIds.push(hcpId);

      // DB-side: npi populated up front (no patch dance), curationManagedAt
      // set, discoveredFrom stored verbatim.
      if (prisma) {
        const row = await prisma.hcp.findUnique({ where: { id: hcpId } });
        expect(row?.npi).toBe(npi);
        expect(row?.curationManagedAt).toBeTruthy();
        expect(row?.discoveredFrom).toMatchObject({ source_url: 'https://example.com/x' });
      }
    },
    20_000
  );

  it.skipIf(!m2mToken)(
    '2b — re-posting same NPI returns the same beId (wasExisting=true, no new row)',
    async () => {
      if (!m2mToken) return;
      const npi = freshNpi();
      const payload = {
        firstName: 'Dedup',
        lastName: 'Test',
        specialty: 'Optometry',
        npi,
        discoveredFrom: {
          source_url: 'https://example.com/x',
          scraper_run_id: `dedup-${Date.now()}`,
          ai_verification_snapshot_url: 's3://x/x.html',
          captured_at: new Date().toISOString(),
        },
      };
      const first = await postGetBeId(m2mToken, payload);
      expect(first.status).toBe(201);
      expect(first.data?.wasExisting).toBe(false);
      mintedHcpIds.push(first.data?.id as string);

      const second = await postGetBeId(m2mToken, {
        ...payload,
        discoveredFrom: { ...payload.discoveredFrom, scraper_run_id: `dedup-${Date.now()}-2` },
      });
      expect(second.status).toBe(201);
      expect(second.data?.wasExisting).toBe(true);
      expect(second.data?.beId).toBe(first.data?.beId);
      expect(second.data?.id).toBe(first.data?.id);

      // No second row materialized for this NPI.
      if (prisma) {
        const matches = await prisma.hcp.count({ where: { npi } });
        expect(matches).toBe(1);
      }
    },
    20_000
  );

  it.skipIf(!m2mToken)(
    '2c — POST without NPI mints a beId with npi=NULL and propagates discoveredFrom.notes',
    async () => {
      if (!m2mToken) return;
      const { status, data } = await postGetBeId(m2mToken, {
        firstName: 'Article',
        lastName: 'Author',
        specialty: 'Ophthalmology',
        discoveredFrom: {
          source_url: 'https://example.com/article',
          scraper_run_id: `no-npi-${Date.now()}`,
          ai_verification_snapshot_url: 's3://x/article.html',
          captured_at: new Date().toISOString(),
          notes: 'Reviewer-confirmed no NPI: article mention only',
        },
      });
      expect(status).toBe(201);
      expect(data?.wasExisting).toBe(false);
      const hcpId = data?.id as string;
      mintedHcpIds.push(hcpId);

      if (prisma) {
        const row = await prisma.hcp.findUnique({ where: { id: hcpId } });
        expect(row?.npi).toBeNull();
        expect(row?.curationManagedAt).toBeTruthy();
        const df = row?.discoveredFrom as { notes?: string } | null;
        expect(df?.notes).toBe('Reviewer-confirmed no NPI: article mention only');
      }
    },
    20_000
  );

  it.skipIf(!m2mToken)('rejects malformed body with 400 (Zod validation)', async () => {
    if (!m2mToken) return;
    const { status } = await postGetBeId(m2mToken, {
      firstName: 'NoLast',
      // lastName missing
      discoveredFrom: { source_url: 'not-a-url', scraper_run_id: '', ai_verification_snapshot_url: 's3://x', captured_at: 'not-a-date' },
    });
    expect(status).toBe(400);
  });

  // v1.17.71 — curation-svc team review sign-off #1: pairing enforcement.
  it.skipIf(!m2mToken)(
    'CA path — POST with country=CA + nationalIdType=MINC + valid MINC mints correctly',
    async () => {
      if (!m2mToken) return;
      const minc = freshMinc();
      const { status, data } = await postGetBeId(m2mToken, {
        firstName: 'François',
        lastName: 'Tremblay',
        specialty: 'Ophthalmology',
        state: 'QC',
        npi: minc,
        country: 'CA',
        nationalIdType: 'MINC',
        discoveredFrom: {
          source_url: 'https://example.ca/f',
          scraper_run_id: `ca-happy-${Date.now()}`,
          ai_verification_snapshot_url: 's3://x/f.html',
          captured_at: new Date().toISOString(),
        },
      });
      expect(status).toBe(201);
      // Response echo (added v1.17.71 per review §3.2)
      expect(data).toMatchObject({ country: 'CA', nationalIdType: 'MINC', wasExisting: false });
      mintedHcpIds.push(data?.id as string);

      if (prisma) {
        const row = await prisma.hcp.findUnique({ where: { id: data?.id as string } });
        expect(row?.npi).toBe(minc);
        expect(row?.country).toBe('CA');
        expect(row?.nationalIdType).toBe('MINC');
      }
    },
    20_000,
  );

  it.skipIf(!m2mToken)(
    'pairing enforced — POST with country=US + nationalIdType=MINC is rejected 400',
    async () => {
      if (!m2mToken) return;
      const { status } = await postGetBeId(m2mToken, {
        firstName: 'Wrong',
        lastName: 'Pairing',
        specialty: 'Ophthalmology',
        npi: freshMinc(),
        country: 'US',
        nationalIdType: 'MINC',
        discoveredFrom: {
          source_url: 'https://example.com/w',
          scraper_run_id: `pair-us-minc-${Date.now()}`,
          ai_verification_snapshot_url: 's3://x/w.html',
          captured_at: new Date().toISOString(),
        },
      });
      expect(status).toBe(400);
    },
  );

  it.skipIf(!m2mToken)(
    'pairing enforced — POST with country=CA + nationalIdType=NPI is rejected 400',
    async () => {
      if (!m2mToken) return;
      const { status } = await postGetBeId(m2mToken, {
        firstName: 'Wrong',
        lastName: 'Pairing2',
        specialty: 'Ophthalmology',
        npi: freshNpi(),
        country: 'CA',
        nationalIdType: 'NPI',
        discoveredFrom: {
          source_url: 'https://example.com/w2',
          scraper_run_id: `pair-ca-npi-${Date.now()}`,
          ai_verification_snapshot_url: 's3://x/w2.html',
          captured_at: new Date().toISOString(),
        },
      });
      expect(status).toBe(400);
    },
  );
});

// Suppress unused-import warning when the suite skips end-to-end.
void config;
