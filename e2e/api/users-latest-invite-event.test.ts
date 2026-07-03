/**
 * Users — latest-invite-event endpoint (v1.17.67)
 *
 * Structural coverage for the new
 * `GET /users/:id/latest-invite-event` endpoint. Full happy-path
 * coverage (invite → EmailDeliveryEvent row → endpoint returns it)
 * requires provisioning + tearing down a real Cognito user + waiting
 * for SES send-time DB write. That's the manual soak (Phase A2 of
 * the release checks).
 *
 * Here we cover the deterministic contract:
 *   - 404 for a non-existent user id
 *   - 200 { latestEvent: null } for a real user who's never been
 *     invited via the current send path (v1.17.67+). The seeded e2e
 *     test user was created pre-v1.17.67 so has no EDE rows.
 *
 * Ticket: docs/findings/email-delivery-event-scope-gap-2026-07-02.md
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../api-client';
import { config } from '../config';
import { TEST_IDS } from '../fixtures';

describe('Users — latest-invite-event endpoint (v1.17.67)', () => {
  let client: ApiClient;

  beforeAll(() => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:test:auth');
    }
    client = new ApiClient();
  });

  it('returns 404 for a non-existent user id', async () => {
    const { status } = await client.getLatestInviteEvent('cm0nonexistent00001');
    expect(status).toBe(404);
  });

  it('returns 200 { latestEvent: null } for the seeded e2e user (no invite EDE rows)', async () => {
    // TEST_IDS.USER_ID is the auth user; it was seeded via
    // e2e/seed-test-data.ts long before v1.17.67 shipped and has no
    // invite EmailDeliveryEvent rows. Endpoint contract: 200 with a
    // null latestEvent, not a 404 (the USER exists; the invite doesn't).
    const { status, data } = await client.getLatestInviteEvent(TEST_IDS.USER_ID);
    expect(status).toBe(200);
    expect(data).toEqual({ latestEvent: null });
  });
});
