/**
 * Canonical field list for `AuditLog.oldValues` / `newValues` snapshots
 * on `hcp.updated` audit rows.
 *
 * v2.1.2 — extracted from the two bulk-import parse sites
 * (`hcp.service.ts:importFromFile` + `distribution.service.ts:importHcpsFromFile`)
 * and the admin-edit path (`routes/hcps.ts:PUT /:id`) so a future Hcp column
 * addition can't silently drop from audit by touching only one of the three
 * sites.
 *
 * Backstory: on 2026-08-04 a sort-mangled CSV corrupted 416 HCPs (Jen Pikor
 * incident). Surgical revert from AuditLog was OFF THE TABLE because the
 * bulk-import path had never written `oldValues` — every corrupted row's
 * pre-image was NULL. See
 * `docs/findings/bulk-import-no-oldvalues-blocks-surgical-revert-2026-08-05.md`.
 *
 * The guardrail test at `__tests__/hcp-fields.test.ts` fails if a new
 * scalar column is added to the `Hcp` Prisma model and the author neither
 * (a) adds it here nor (b) explicitly declares it as meta-excluded. Keep
 * both lists in sync with `apps/api/prisma/schema.prisma`'s `Hcp` model.
 */
import { Prisma } from '@prisma/client';

/**
 * User-editable / audit-worthy Hcp fields. Included in the `oldValues`
 * pre-image snapshot for every `hcp.updated` audit row.
 */
export const UPDATABLE_HCP_AUDIT_FIELDS = [
  'npi',
  'nationalIdType',
  'country',
  'firstName',
  'lastName',
  'email',
  'specialty',
  'subSpecialty',
  'city',
  'state',
  'yearsInPractice',
  'isSurveyTaker',
  'isNominated',
] as const;

export type UpdatableHcpAuditField = (typeof UPDATABLE_HCP_AUDIT_FIELDS)[number];

/**
 * Hcp scalar fields intentionally excluded from audit snapshots.
 *
 * These are meta / system-managed columns whose values are either
 * immutable (`beId`), set by the system on write (`id`, `createdAt`,
 * `updatedAt`, `createdBy`, `importBatchId`), or opaque curation
 * metadata (`curationManagedAt`, `discoveredFrom`, `alternateIds`).
 *
 * Anything on the `Hcp` model must appear in either
 * `UPDATABLE_HCP_AUDIT_FIELDS` OR this list — the guardrail test enforces
 * that partition against `Prisma.HcpScalarFieldEnum`.
 */
export const HCP_META_EXCLUDED_FROM_AUDIT = [
  'id',
  'beId',
  'alternateIds',
  'createdAt',
  'updatedAt',
  'createdBy',
  'curationManagedAt',
  'discoveredFrom',
  'importBatchId',
] as const;

/**
 * Type-safe subset of an Hcp row (or any object carrying these fields)
 * shaped for the `oldValues` audit column. Preserves nullability so the
 * pre-image faithfully reflects DB state.
 *
 * Values are typed as `Prisma.InputJsonValue | null` so a snapshot is
 * directly assignable to `AuditLog.oldValues` / `AuditLog.newValues`
 * without needing casts at every call site.
 */
export type HcpAuditSnapshot = {
  [K in UpdatableHcpAuditField]?: Prisma.InputJsonValue | null;
};

/**
 * Pick the audit-worthy fields off an Hcp-shaped object. Undefined
 * fields are stripped (so a partially-selected read doesn't emit
 * `"specialty": undefined` on the audit row).
 *
 * Callers should pass the pre-update row from the SAME transaction /
 * upstream read as the write. This is the fix at the heart of v2.1.2 —
 * both bulk-import parse sites were writing `oldValues: NULL`.
 */
export function pickHcpAuditSnapshot(row: Record<string, unknown>): HcpAuditSnapshot {
  const out: HcpAuditSnapshot = {};
  for (const key of UPDATABLE_HCP_AUDIT_FIELDS) {
    const v = row[key];
    if (v === undefined) continue;
    // Narrow to Prisma.InputJsonValue-compatible primitives + null. All
    // fields in UPDATABLE_HCP_AUDIT_FIELDS are scalar Hcp columns
    // (string | number | boolean | null); the cast documents the
    // Prisma-side contract without adding a runtime check.
    out[key] = v as Prisma.InputJsonValue | null;
  }
  return out;
}

/**
 * The Prisma `select` shape guaranteed to include every field
 * `pickHcpAuditSnapshot` reads. Use this on the pre-update read (bulk
 * `findMany` in `importFromFile`, per-row `findUnique` in
 * `importHcpsFromFile`) so `oldValues` is complete.
 */
export const HCP_AUDIT_SELECT: Record<UpdatableHcpAuditField, true> = Object.fromEntries(
  UPDATABLE_HCP_AUDIT_FIELDS.map((f) => [f, true])
) as Record<UpdatableHcpAuditField, true>;

// Re-export the Prisma scalar enum so the guardrail test can reflect the
// current schema without importing @prisma/client itself (keeps the
// public API surface stable across Prisma client upgrades).
export const HcpScalarFieldEnum = Prisma.HcpScalarFieldEnum;
