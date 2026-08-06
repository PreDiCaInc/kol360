/**
 * Guardrail — every Hcp scalar field must be classified as either
 * audit-worthy (UPDATABLE_HCP_AUDIT_FIELDS) or intentionally excluded
 * (HCP_META_EXCLUDED_FROM_AUDIT).
 *
 * v2.1.2 — introduced with the bulk-import `oldValues` fix
 * (docs/findings/bulk-import-no-oldvalues-blocks-surgical-revert-2026-08-05.md).
 *
 * Why this exists: the pteam-filed incident happened because the
 * bulk-import path wrote `AuditLog.oldValues = NULL` for two months
 * before it bit us. The class of bug the codebase is now most exposed
 * to is "someone adds a new column to Hcp and quietly drops it from
 * audit." This test fails on that class at PR time by comparing
 * Prisma's generated `HcpScalarFieldEnum` (source of truth for what's
 * on the model) against the union of the two lists — a new column
 * that lands in the schema without being classified will fail the
 * test with a message naming the offending field.
 *
 * If you add a new column to the `Hcp` Prisma model:
 *   - It's a user-editable field → add it to `UPDATABLE_HCP_AUDIT_FIELDS`
 *     in `hcp-fields.ts`. The bulk-import + admin-edit paths will pick
 *     it up automatically (both use `pickHcpAuditSnapshot`).
 *   - It's system-managed / meta / opaque → add it to
 *     `HCP_META_EXCLUDED_FROM_AUDIT`, with a comment on why.
 */

import { describe, it, expect } from 'vitest';
import {
  UPDATABLE_HCP_AUDIT_FIELDS,
  HCP_META_EXCLUDED_FROM_AUDIT,
  HcpScalarFieldEnum,
  pickHcpAuditSnapshot,
} from '../hcp-fields';

describe('hcp-fields guardrail', () => {
  it('every Hcp scalar field is classified (audit-worthy OR meta-excluded)', () => {
    const allScalars = new Set(Object.values(HcpScalarFieldEnum));
    const audited = new Set<string>(UPDATABLE_HCP_AUDIT_FIELDS);
    const excluded = new Set<string>(HCP_META_EXCLUDED_FROM_AUDIT);

    const unclassified: string[] = [];
    for (const field of allScalars) {
      if (!audited.has(field) && !excluded.has(field)) {
        unclassified.push(field);
      }
    }

    // Prints the actionable message on failure: which fields need a
    // decision, and where to make it.
    expect(
      unclassified,
      `New Hcp scalar field(s) not classified in apps/api/src/services/hcp-fields.ts:\n` +
        unclassified.map((f) => `  - ${f}`).join('\n') +
        `\n\nAdd each to UPDATABLE_HCP_AUDIT_FIELDS (audit-worthy) or ` +
        `HCP_META_EXCLUDED_FROM_AUDIT (system-managed / opaque).`
    ).toEqual([]);
  });

  it('audit-worthy and meta-excluded lists do not overlap', () => {
    const audited = new Set<string>(UPDATABLE_HCP_AUDIT_FIELDS);
    const overlap = HCP_META_EXCLUDED_FROM_AUDIT.filter((f) => audited.has(f));
    expect(overlap, `Fields declared in both lists: ${overlap.join(', ')}`).toEqual([]);
  });

  it('every field in the classification lists exists on the Hcp model', () => {
    const allScalars = new Set<string>(Object.values(HcpScalarFieldEnum));
    const declared = [...UPDATABLE_HCP_AUDIT_FIELDS, ...HCP_META_EXCLUDED_FROM_AUDIT];
    const stale = declared.filter((f) => !allScalars.has(f));
    expect(
      stale,
      `Fields declared in hcp-fields.ts but not on the Hcp Prisma model ` +
        `(schema drift / typo): ${stale.join(', ')}`
    ).toEqual([]);
  });

  describe('pickHcpAuditSnapshot', () => {
    it('picks all audit-worthy fields present on the row', () => {
      const row = {
        id: 'cme2eXYZ',
        firstName: 'Alice',
        lastName: 'Anderson',
        email: 'alice@example.com',
        specialty: 'Optometry',
        city: 'Lexington',
        state: 'KY',
        yearsInPractice: 12,
        isSurveyTaker: true,
        isNominated: false,
        npi: '1234567890',
        nationalIdType: 'NPI',
        country: 'US',
        subSpecialty: null,
        // Not audit-worthy — should be stripped
        beId: 'BE-000001',
        importBatchId: 'cmbatch123',
        createdAt: new Date(),
      };
      const snap = pickHcpAuditSnapshot(row);
      expect(snap).toEqual({
        firstName: 'Alice',
        lastName: 'Anderson',
        email: 'alice@example.com',
        specialty: 'Optometry',
        city: 'Lexington',
        state: 'KY',
        yearsInPractice: 12,
        isSurveyTaker: true,
        isNominated: false,
        npi: '1234567890',
        nationalIdType: 'NPI',
        country: 'US',
        subSpecialty: null, // null preserved — meaningful pre-image
      });
      // Excluded fields absent
      expect(snap).not.toHaveProperty('beId');
      expect(snap).not.toHaveProperty('importBatchId');
      expect(snap).not.toHaveProperty('createdAt');
      expect(snap).not.toHaveProperty('id');
    });

    it('strips undefined fields (partially-selected reads do not leak "undefined")', () => {
      const partial = { firstName: 'Alice', email: undefined, city: 'Lexington' };
      const snap = pickHcpAuditSnapshot(partial);
      expect(snap).toEqual({ firstName: 'Alice', city: 'Lexington' });
      expect(snap).not.toHaveProperty('email');
    });

    it('empty input yields empty snapshot (no crash)', () => {
      expect(pickHcpAuditSnapshot({})).toEqual({});
    });
  });
});
