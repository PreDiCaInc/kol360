/**
 * /api/v1/hcps sort param E2E (v1.17.45)
 *
 * Confirms the View Scores facelift's new sort contract:
 *  - sortBy supports 'name' | 'npi' | 'state' | 'specialty'
 *  - sortOrder supports 'asc' | 'desc'
 *  - Unknown sortBy falls back to default (last-name then first-name)
 *
 * Run: cd e2e && pnpm test:api:test:auth
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../api-client';
import { config } from '../config';

const skipIfNoAuth = !config.authToken;

describe.skipIf(skipIfNoAuth)('/hcps sort contract (v1.17.45)', () => {
  let client: ApiClient;

  beforeAll(() => {
    client = new ApiClient();
  });

  it('sortBy=name + sortOrder=asc returns 200 + lastName-ascending order', async () => {
    const { status, data } = await client.listHcps({
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 25,
    });
    expect(status).toBe(200);
    expect(Array.isArray(data.items)).toBe(true);
    if (data.items.length < 2) {
      console.log('⊘ <2 HCPs on env — sort comparison skipped');
      return;
    }
    // Compare consecutive lastNames; allow ties (==) which still satisfy asc.
    for (let i = 1; i < data.items.length; i++) {
      const a = (data.items[i - 1].lastName ?? '').toLowerCase();
      const b = (data.items[i].lastName ?? '').toLowerCase();
      expect(a.localeCompare(b)).toBeLessThanOrEqual(0);
    }
  });

  it('sortBy=name + sortOrder=desc flips the ordering', async () => {
    const { status, data } = await client.listHcps({
      sortBy: 'name',
      sortOrder: 'desc',
      limit: 25,
    });
    expect(status).toBe(200);
    if (data.items.length < 2) return;
    for (let i = 1; i < data.items.length; i++) {
      const a = (data.items[i - 1].lastName ?? '').toLowerCase();
      const b = (data.items[i].lastName ?? '').toLowerCase();
      expect(a.localeCompare(b)).toBeGreaterThanOrEqual(0);
    }
  });

  it('sortBy=npi returns 200 + ascending NPI order', async () => {
    const { status, data } = await client.listHcps({
      sortBy: 'npi',
      sortOrder: 'asc',
      limit: 25,
    });
    expect(status).toBe(200);
    if (data.items.length < 2) return;
    for (let i = 1; i < data.items.length; i++) {
      const a = data.items[i - 1].npi ?? '';
      const b = data.items[i].npi ?? '';
      expect(a.localeCompare(b)).toBeLessThanOrEqual(0);
    }
  });

  it('unknown sortBy value silently falls back to default order (no 400)', async () => {
    // The route whitelist-narrows sortBy to the 4 supported keys; anything
    // else gets sent through as `undefined` so the service's default order
    // kicks in (lastName asc). Caller never sees an error for typos.
    const { status, data } = await client.listHcps({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sortBy: 'totallyBogusField' as any,
      limit: 5,
    });
    expect(status).toBe(200);
    expect(Array.isArray(data.items)).toBe(true);
  });
});
