/**
 * Per-client email-domain allowlist (Phase 1 — backend gate).
 *
 * The Client model has an `emailDomains: String[]` column. When non-empty,
 * userService.invite() and update() (on clientId reassignment) reject
 * emails whose domain isn't in the list. `bio-exec.com` is always
 * allowed (hardcoded in userService.ALWAYS_ALLOWED_DOMAINS) so Bio-Exec
 * platform staff can be assigned to any tenant.
 *
 * Tests below cover the four cases that matter for safe rollout:
 *
 *   1. Empty allowlist (existing default) → any email accepted.
 *      Regression check — this is the state every pre-existing client
 *      is in at deploy time. Anyone running the upgrade must not see
 *      invites suddenly start failing.
 *   2. Domains set, matching email → accepted.
 *   3. Domains set, bio-exec.com email → accepted (always-allowed wildcard).
 *   4. Domains set, non-matching email → rejected with 400 +
 *      EMAIL_DOMAIN_NOT_ALLOWED code (not 500, not Cognito-leak).
 *
 * REQUIRES DATABASE_URL (test uses Prisma to set up + tear down the
 * test client without touching the API client-management flows).
 * Skips gracefully if DB is unreachable. Cleanup deletes the test
 * client + any DB User rows we created. Cognito users from the
 * accept-path tests accumulate (best-effort cleanup is out of scope
 * for this PR); test emails are unique-per-run so no re-creation conflict.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ApiClient } from '../api-client';
import { config } from '../config';

const prisma = new PrismaClient();
let dbAvailable = false;

// Unique per-run suffix so accept-path tests don't collide with
// previous runs' leftover Cognito users (we can't easily clean those).
const RUN_TAG = randomUUID().slice(0, 8);

// The "client's own domain" used by the gate-on tests below. Made up
// so it can never accidentally be an internal-respondent email or a
// real customer domain.
const CLIENT_DOMAIN = `e2e-${RUN_TAG}-pharma.example`;

describe('Per-client email-domain allowlist', () => {
  let client: ApiClient;
  let gatedClientId: string | undefined;
  let openClientId: string | undefined;
  const createdUserDbIds: string[] = [];

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
      console.log(`⚠️ Prisma probe failed (${msg}) — all assertions will skip`);
      return;
    }

    // Two test clients: one with the allowlist set (gated), one without (open).
    // Created directly via Prisma rather than the API so the test doesn't
    // depend on platform-admin client-create permissions also working.
    const gated = await prisma.client.create({
      data: {
        name: `E2E EmailDomain Gated ${RUN_TAG}`,
        emailDomains: [CLIENT_DOMAIN],
      },
    });
    gatedClientId = gated.id;

    const open = await prisma.client.create({
      data: {
        name: `E2E EmailDomain Open ${RUN_TAG}`,
        emailDomains: [],
      },
    });
    openClientId = open.id;

    console.log(
      `✅ Set up gated=${gatedClientId} (domains=[${CLIENT_DOMAIN}]) ` +
        `+ open=${openClientId} (domains=[])`
    );
  }, 30_000);

  afterAll(async () => {
    if (!dbAvailable) return;

    // Hard-delete any DB User rows we created so re-runs don't trip the
    // unique-email constraint. Cognito users are intentionally left
    // behind — they're best-effort cleanup at the e2e layer.
    if (createdUserDbIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserDbIds } } });
    }
    if (gatedClientId) {
      await prisma.client.delete({ where: { id: gatedClientId } }).catch(() => undefined);
    }
    if (openClientId) {
      await prisma.client.delete({ where: { id: openClientId } }).catch(() => undefined);
    }

    await prisma.$disconnect();
  });

  // ----------------------------------------------------------------------
  // Case 1 (v1.17.19) — Empty allowlist now REJECTS everything except
  // ALWAYS_ALLOWED_DOMAINS (bio-exec.com). The legacy "empty = no
  // enforcement" escape hatch is gone; all prod + test clients were
  // backfilled with at least one domain alongside this change. An
  // empty allowlist now means someone bypassed Zod (Prisma direct,
  // raw SQL) and we want the strict check to fire, not silently let
  // any domain in.
  // ----------------------------------------------------------------------
  it('case 1 (v1.17.19): empty allowlist rejects non-allowed domain (escape hatch removed)', async () => {
    if (!dbAvailable || !openClientId) {
      console.log('⊘ setup did not complete — skipping');
      return;
    }
    const email = `e2e-${RUN_TAG}-anyone@random-domain-${RUN_TAG}.example`;
    const res = await client.inviteUser({
      email,
      firstName: 'Open',
      lastName: 'Tester',
      role: 'CLIENT_ADMIN',
      clientId: openClientId,
    });
    expect(res.status).toBe(400);
    expect((res.data as { code?: string }).code).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
    console.log(`✅ empty allowlist + non-allowed domain → 400 (escape hatch gone)`);
  });

  // ----------------------------------------------------------------------
  // Case 2 — Matching email accepted.
  // ----------------------------------------------------------------------
  it('case 2: matching domain on a gated client is accepted', async () => {
    if (!dbAvailable || !gatedClientId) {
      console.log('⊘ setup did not complete — skipping');
      return;
    }
    const email = `e2e-${RUN_TAG}-match@${CLIENT_DOMAIN}`;
    const res = await client.inviteUser({
      email,
      firstName: 'Match',
      lastName: 'Tester',
      role: 'CLIENT_ADMIN',
      clientId: gatedClientId,
    });
    expect(res.status).toBe(201);
    if (res.data?.id) createdUserDbIds.push(res.data.id);
    console.log(`✅ matching domain: invited ${email} → 201`);
  });

  // ----------------------------------------------------------------------
  // Case 3 — bio-exec.com is always allowed regardless of client allowlist.
  // ----------------------------------------------------------------------
  it('case 3: bio-exec.com is always allowed (Bio-Exec staff cross-tenant)', async () => {
    if (!dbAvailable || !gatedClientId) {
      console.log('⊘ setup did not complete — skipping');
      return;
    }
    const email = `e2e-${RUN_TAG}-bioexec@bio-exec.com`;
    const res = await client.inviteUser({
      email,
      firstName: 'BioExec',
      lastName: 'Tester',
      role: 'CLIENT_ADMIN',
      clientId: gatedClientId,
    });
    expect(res.status).toBe(201);
    if (res.data?.id) createdUserDbIds.push(res.data.id);
    console.log(`✅ bio-exec.com on gated client: invited ${email} → 201`);
  });

  // ----------------------------------------------------------------------
  // Case 4 — Non-matching domain rejected with 400 + clear error code.
  // The whole point of the feature — this is what catches admin typos.
  // ----------------------------------------------------------------------
  it('case 4: non-matching domain rejected with 400 + EMAIL_DOMAIN_NOT_ALLOWED', async () => {
    if (!dbAvailable || !gatedClientId) {
      console.log('⊘ setup did not complete — skipping');
      return;
    }
    const email = `e2e-${RUN_TAG}-typo@some-other-pharma-${RUN_TAG}.example`;
    const res = await client.inviteUser({
      email,
      firstName: 'Wrong',
      lastName: 'Tenant',
      role: 'CLIENT_ADMIN',
      clientId: gatedClientId,
    });

    expect(res.status).toBe(400);
    // The route exposes a stable machine-readable code for the frontend.
    expect((res.data as { code?: string }).code).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
    expect((res.data as { message?: string }).message).toMatch(/not allowed/i);

    // No DB User row created — the validation fires BEFORE Cognito.
    const orphan = await prisma.user.findUnique({ where: { email } });
    expect(orphan).toBeNull();

    console.log(`✅ non-matching domain: ${email} → 400 EMAIL_DOMAIN_NOT_ALLOWED, no DB orphan`);
  });

  // ----------------------------------------------------------------------
  // Case 5 — v1.17.17: POST /clients with empty emailDomains is rejected.
  // The field went from optional+default([]) to required min(1). Legacy
  // clients (case 1) still work at the runtime layer via the escape
  // hatch in userService, but the write path now refuses to create or
  // update a client without at least one domain.
  // ----------------------------------------------------------------------
  it('case 5 (v1.17.17): create with empty emailDomains rejected (Zod min(1))', async () => {
    const res = await client.createClient({
      name: `E2E EmptyDomains ${RUN_TAG}`,
      type: 'FULL',
      emailDomains: [],
    });
    // Should be a 400 from Zod — message references "At least one
    // email domain is required" (the .min(1) message we set in
    // packages/shared/src/schemas/client.ts).
    expect(res.status).toBe(400);
    const body = res.data as { message?: string };
    expect(body.message).toBeTruthy();
    console.log(`✅ empty emailDomains rejected: 400 ${body.message ?? ''}`);
  });
});
