// v1.17.35 — audit helpers for scripts that touch Hcp rows outside the
// normal API write paths. Scripts and migrations that mutate Hcp
// without going through the route layer should call these helpers
// before/after the change so the audit table has the same row-level
// detail as the API paths.
//
// Background: docs/findings/hcp-row-level-audit-gap-2026-06-13.md.
//
// Usage:
//
//   import { auditHcpBulkBackfill } from '../apps/api/src/lib/hcp-audit';
//
//   const affected = await prisma.hcp.findMany({
//     where: { email: { startsWith: 'nomail@bio-exec' } },
//     select: { id: true, email: true },
//   });
//   await prisma.$executeRaw`UPDATE "Hcp" SET email = 'nomail@kol360research.com' WHERE ...`;
//   await auditHcpBulkBackfill('system:backfill-hcp-nomail-domain', {
//     scriptName: 'backfill-hcp-nomail-domain.sql',
//     fieldChanged: 'email',
//     pattern: 'nomail@bio-exec.com → nomail@kol360research.com',
//     affectedHcpIds: affected.map(h => h.id),
//   });
//
// Scripts that the route layer doesn't reach (raw psql, prod-side
// hotfixes) won't get audit unless someone runs this helper from a
// node script after the SQL. That's fine — the helper is opt-in;
// the bigger gap was that NO code path even tried.

import { prisma } from './prisma';
import { Prisma } from '@prisma/client';
import { createAuditLog } from './audit';

export interface HcpBulkBackfillContext {
  /** Filename or short id of the script that did the work. */
  scriptName: string;
  /** Which Hcp column the script mutated (e.g. 'email', 'specialty'). */
  fieldChanged: string;
  /** Brief human-readable description of the transformation. */
  pattern: string;
  /** IDs of the rows that were touched. */
  affectedHcpIds: string[];
  /** Optional ticket / runbook reference for trace-back. */
  ticket?: string;
}

/**
 * Emits a single 'hcp.bulk_backfill' audit row capturing the script
 * identity, fieldChanged, pattern, and affected IDs. Use this for
 * raw-SQL backfills + migrations that touch Hcp data.
 */
export async function auditHcpBulkBackfill(
  actor: string,
  ctx: HcpBulkBackfillContext
): Promise<void> {
  await createAuditLog(actor, {
    action: 'hcp.bulk_backfill',
    entityType: 'Hcp',
    entityId: 'bulk',
    newValues: {
      scriptName: ctx.scriptName,
      fieldChanged: ctx.fieldChanged,
      pattern: ctx.pattern,
      affectedCount: ctx.affectedHcpIds.length,
      affectedHcpIds: ctx.affectedHcpIds,
      ticket: ctx.ticket ?? null,
    },
  });
}

/**
 * Emits a per-row audit for a single field-change applied by a script.
 * Use when the script can identify the specific old/new value per row
 * (e.g. a Node script that loads the rows, computes new values, and
 * writes them back).
 *
 * Prefer this over auditHcpBulkBackfill when row-level diffs are
 * known — gives the same single-SELECT debug surface that the API
 * paths offer.
 */
export async function auditHcpRowChangesFromScript(
  actor: string,
  changes: Array<{
    hcpId: string;
    field: 'email' | 'specialty' | 'npi';
    oldValue: string | null;
    newValue: string | null;
  }>,
  scriptName: string
): Promise<void> {
  if (changes.length === 0) return;
  // Action name per field — mirrors the dedicated actions emitted by
  // the route layer (hcp.email_changed, hcp.specialty_changed,
  // hcp.npi_changed). Same action name from script vs route lets a
  // single audit query surface every change of that field type.
  const actionByField = {
    email: 'hcp.email_changed',
    specialty: 'hcp.specialty_changed',
    npi: 'hcp.npi_changed',
  } as const;
  await prisma.auditLog.createMany({
    data: changes.map((c) => ({
      userId: actor,
      action: actionByField[c.field],
      entityType: 'Hcp',
      entityId: c.hcpId,
      oldValues: { [c.field]: c.oldValue } as Prisma.InputJsonValue,
      newValues: {
        [c.field]: c.newValue,
        _source: 'script',
        _scriptName: scriptName,
      } as Prisma.InputJsonValue,
    })),
  });
}
