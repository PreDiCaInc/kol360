/**
 * Users — resend-invite + delete endpoints (v1.17.60)
 *
 * Smoke coverage for the new endpoints. Hitting the happy path on
 * either would require provisioning + tearing down a real Cognito
 * user inside the test, which adds blast radius for limited
 * benefit. Instead, exercise the structural-rejection paths that
 * don't touch Cognito:
 *
 *   - Resend on a non-existent user → 404
 *   - Resend on a user not in PENDING_VERIFICATION → 400 INVALID_STATE
 *     (the seeded test user is ACTIVE)
 *   - Delete on a non-existent user → 404
 *   - Delete-self guard → 400 "Cannot delete your own account"
 *
 * The happy paths are exercised manually via the post-deploy soak
 * (create test user → resend → delete) per
 * prod-rel-4.1.40-soak-checks.md.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../api-client';
import { config } from '../config';
import { TEST_IDS } from '../fixtures';

describe('Users — resend-invite + delete endpoints (v1.17.60)', () => {
  let client: ApiClient;

  beforeAll(() => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:test:auth');
    }
    client = new ApiClient();
  });

  it('resend-invite on a non-existent user returns 404', async () => {
    const { status } = await client.resendInvite('cm0nonexistent00001');
    expect(status).toBe(404);
  });

  it('resend-invite on an ACTIVE user returns 400 INVALID_STATE', async () => {
    // The seeded TEST_IDS.USER_ID is ACTIVE — resend should reject.
    const { status, data } = await client.resendInvite(TEST_IDS.USER_ID);
    expect(status).toBe(400);
    expect((data as { code?: string }).code).toBe('INVALID_STATE');
  });

  it('delete on a non-existent user returns 404', async () => {
    const { status } = await client.deleteUser('cm0nonexistent00002');
    expect(status).toBe(404);
  });

  it('delete-self is blocked with 400', async () => {
    // TEST_IDS.USER_ID is the user the e2e auth token belongs to —
    // the BE compares user.id against the token's sub claim. The
    // safety guard should reject this before any Cognito call.
    const { status } = await client.deleteUser(TEST_IDS.USER_ID);
    expect(status).toBe(400);
  });
});
