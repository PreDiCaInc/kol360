/**
 * XLSX HCP import — hyperlink email cells no longer silently drop rows (v2.0.5)
 *
 * Pteam finding:
 *   docs/findings/xlsx-import-hyperlink-cells-silently-drop-rows-2026-07-31.md
 *
 * Symptom on 2026-07-31: biz user uploaded a 417-row .xlsx HCP list
 * (BC Canada). 403 rows created cleanly; 14 rows silently dropped
 * with `PrismaClientValidationError` per-row entries — the 14
 * whose Email cells were Excel-auto-hyperlinked (typed `x@y.com` →
 * auto-formatted mailto: link → ExcelJS returned
 * `{ text: 'x@y.com', hyperlink: 'mailto:x@y.com' }` instead of a
 * string). `rowData['Email'] = cell.value` bound the object; the
 * `(row['Email'] || null) as string | null` cast made it truthy;
 * the "Email is required" guard didn't fire; Prisma rejected the
 * object at write time.
 *
 * v2.0.5 fix: all xlsx parse sites route `cell.value` through
 * `cellText()` (`apps/api/src/utils/excel.ts`), which flattens every
 * ExcelJS cell shape (hyperlink, richText, formula, plain, Date) to
 * `string | null` at the parse boundary. Shape-matrix regression
 * coverage on the helper itself: `apps/api/src/utils/excel.test.ts`.
 *
 * This test proves the full end-to-end integration on `/hcps/import`
 * — the route the pteam-reported BC Canada file used — with a
 * pre-generated fixture xlsx (`e2e/fixtures/hyperlink-hcps.xlsx`,
 * committed) that carries one plain-string email row + one
 * ExcelJS-hyperlink email row. Pre-fix: the hyperlink row lands in
 * `errors[]` with a Prisma validation message. Post-fix: both rows
 * succeed.
 *
 * Run with: cd e2e && pnpm test:api:test:auth
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ApiClient } from '../api-client';
import { config } from '../config';

describe('XLSX HCP import — hyperlink email cells (v2.0.5)', () => {
  let client: ApiClient;
  let fixtureBuffer: Buffer;

  beforeAll(() => {
    if (!config.authToken) {
      throw new Error('E2E_AUTH_TOKEN is required. Run with auth: pnpm test:api:test:auth');
    }
    client = new ApiClient();
    // Fixture generated once via ExcelJS at commit time; committed as
    // a binary so this test doesn't need exceljs as an e2e dep (see
    // handoff prereq call-out — no reinstall required for v2.0.5).
    fixtureBuffer = readFileSync(
      resolve(__dirname, '..', 'fixtures', 'hyperlink-hcps.xlsx')
    );
  });

  it('accepts both plain-string and ExcelJS-hyperlink email cells without silent drops', async () => {
    const { status, data } = await client.importHcpsFromBuffer(
      fixtureBuffer,
      'hyperlink-hcps.xlsx'
    );

    expect(status).toBe(200);

    // Pre-fix (v2.0.4 and earlier): row 3 (the hyperlink email cell)
    // would land in errors[] as
    //   "Invalid value provided. Expected String or Null, provided (Object)"
    // — an unhandled Prisma exception surfaced per-row. Post-fix both
    // rows import cleanly with zero errors.
    expect(data.errors).toEqual([]);

    // Both fixture rows must count toward created + updated. On a
    // fresh test DB both are created; on repeat runs the NPIs may
    // already exist and both are updated. Either way the SUM = 2 is
    // the load-bearing assertion (no silent drop = no vanished row).
    const landed = (data.created ?? 0) + (data.updated ?? 0);
    expect(landed).toBeGreaterThanOrEqual(2);

    // Confirm the hyperlink-email row actually persisted with a
    // clean string email (not the ExcelJS object shape) — the exact
    // downstream state that PrismaClientValidationError blocked
    // pre-fix.
    const listed = await client.listHcps({ search: 'hyper.link@e2etest.example.com' });
    expect(listed.status).toBe(200);
    const hyper = listed.data.items.find(
      (h) => h.npi === '9998880012'
    );
    expect(hyper).toBeDefined();
    expect(hyper?.email).toBe('hyper.link@e2etest.example.com');
    expect(typeof hyper?.email).toBe('string');
  });
});
