import { prisma } from '../lib/prisma';
import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { INFLUENCER_TYPES, type InfluencerType, normalizeOneKeyId } from '@kol360/shared';
import { resolveUserIdForAudit } from '../lib/audit';

// v1.17.44 — canonical influencer-type list is INFLUENCER_TYPES in
// @kol360/shared (single source of truth — same pattern as
// score-methodology.ts). The frontend dialog renders the same list
// as "Allowed types" badges, the backend uses it to validate CSV
// uploads. Adding a type only requires editing INFLUENCER_TYPES.
//
// Re-exported under the old name CANONICAL_INFLUENCER_TYPES for any
// pre-v1.17.44 callers; new code should import INFLUENCER_TYPES.
export const CANONICAL_INFLUENCER_TYPES = INFLUENCER_TYPES;
export type { InfluencerType };

// v1.17.42 — data-team-managed classification import for
// HcpDiseaseArea.influencerType. CSV format: NPI,InfluencerType.
//
// The CSV-side label is mapped to one of the canonical values:
//   - National Leaders
//   - Rising Stars
//   - Regional Influencers
//
// Both raw uppercase ("NATIONAL LEADERS") and the canonical strings
// are accepted to give the data team latitude. Unknown values become
// per-row errors (caller decides what to do; the preview endpoint
// surfaces the per-row error counts, the import endpoint skips
// invalid rows but completes the batch).

const CANONICAL_BY_LOWER: Record<string, InfluencerType> = (() => {
  const out: Record<string, InfluencerType> = {};
  for (const t of CANONICAL_INFLUENCER_TYPES) out[t.toLowerCase()] = t;
  // Common alternates the data team might emit (singular forms,
  // hyphen / space / case variants).
  out['national leader'] = 'National Leaders';
  out['rising star'] = 'Rising Stars';
  out['regional influencer'] = 'Regional Influencers';
  out['regional'] = 'Regional Influencers';
  // v1.17.44 — accept "Regional Leader" (singular). NOTE: this is
  // DISTINCT from the NominationType.REGIONAL_LEADER enum value used
  // for survey nominations — different concept, same name.
  out['regional leader'] = 'Regional Leaders';
  // v1.17.44 — accept "Pre Emergent" (space), "Preemergent" (no
  // separator), "Pre-emergent" (lowercase 'e').
  out['pre emergent'] = 'Pre-Emergent';
  out['preemergent'] = 'Pre-Emergent';
  out['pre-emergent'] = 'Pre-Emergent';
  return out;
})();

function normalizeType(raw: string): InfluencerType | null {
  const key = raw.trim().toLowerCase();
  return CANONICAL_BY_LOWER[key] ?? null;
}

export interface InfluencerTypeImportRow {
  rowNumber: number;
  npi: string;
  rawType: string;
  resolvedType: InfluencerType | null;
  // Set during preview/import: which HCP this NPI maps to (or null).
  matchedHcpId: string | null;
  // Set during preview/import: whether the HCP has an HcpDiseaseArea
  // link for the disease area we're targeting (or null if no HCP).
  hasDiseaseAreaLink: boolean | null;
}

export interface InfluencerTypeImportResult {
  totalRows: number;
  matched: number; // HCP found AND type valid AND HcpDiseaseArea link exists
  unmatchedNpi: number; // NPI doesn't resolve to an HCP
  unmatchedDiseaseArea: number; // HCP exists but isn't in this disease area
  invalidType: number; // type wasn't recognized
  countsByType: Record<InfluencerType, number>;
  errorRows: Array<{ row: number; npi: string; rawType: string; reason: string }>;
  rows: InfluencerTypeImportRow[]; // returned by preview; trimmed in import
}

interface PreviewOrImportArgs {
  buffer: Buffer;
  filename: string;
  diseaseAreaId: string;
  apply: boolean; // false = preview, true = write
  actorCognitoSub: string;
}

interface RawCsvRow {
  NPI?: string;
  npi?: string;
  // v1.19.0 — 'OneKey ID' + variants (backward-compat with legacy 'MINC').
  'OneKey ID'?: string;
  OneKey?: string;
  OneKeyID?: string;
  onekey?: string;
  onekey_id?: string;
  MINC?: string;
  minc?: string;
  InfluencerType?: string;
  influencerType?: string;
  Influencer?: string;
  Type?: string;
}

// v1.17.43 — accept .csv + .xlsx + .xls to match the existing
// HCP / segment-score import dialogs (consistent admin UX).
async function parseRows(buffer: Buffer, filename: string): Promise<RawCsvRow[]> {
  const filenameLower = filename.toLowerCase();
  const isCsv = filenameLower.endsWith('.csv');
  const isExcel = filenameLower.endsWith('.xlsx') || filenameLower.endsWith('.xls');
  if (!isCsv && !isExcel) {
    throw new Error('Unsupported file format. Use a .csv, .xlsx, or .xls file.');
  }
  if (isCsv) {
    const records = parseCsv(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
    return records as RawCsvRow[];
  }
  // Excel — mirror apps/api/src/services/hcp.service.ts:parseExcelToRows.
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
  await workbook.xlsx.load(arrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: RawCsvRow[] = [];
  const headers: string[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell((cell) => headers.push(String(cell.value ?? '').trim()));
      return;
    }
    const rowData: Record<string, string> = {};
    row.eachCell((cell, colNumber) => {
      const header = headers[colNumber - 1];
      if (header) rowData[header] = String(cell.value ?? '').trim();
    });
    rows.push(rowData as RawCsvRow);
  });
  return rows;
}

function extractNpi(row: RawCsvRow): string {
  const raw = (
    row.NPI ?? row.npi ??
    row['OneKey ID'] ?? row.OneKey ?? row.OneKeyID ?? row.onekey ?? row.onekey_id ??
    row.MINC ?? row.minc ??
    ''
  ).trim();
  // v1.17.69 — normalize OneKey ID to canonical uppercase / no-separator
  // form so DB lookup matches. NPI values pass through unchanged.
  const upper = raw.toUpperCase();
  if (/[A-Z]/.test(upper)) {
    const normalized = normalizeOneKeyId(upper);
    if (normalized) return normalized;
  }
  return raw;
}

function extractType(row: RawCsvRow): string {
  return (row.InfluencerType ?? row.influencerType ?? row.Type ?? '').trim();
}

export class InfluencerTypeImportService {
  /**
   * Preview a classification import without writing. Returns counts +
   * per-row resolution so the UI can render the confirmation dialog
   * ("Based on this file, 500 HCPs will be classified for Dry Eye").
   */
  async preview(args: Omit<PreviewOrImportArgs, 'apply'>): Promise<InfluencerTypeImportResult> {
    return this.run({ ...args, apply: false });
  }

  /**
   * Apply the classification import. Updates HcpDiseaseArea.influencerType
   * for every (HCP, disease-area) pair where the NPI resolves, the type
   * is recognized, and the disease-area link exists. Rows that fail any
   * of those go to errorRows + are skipped (batch completes).
   */
  async import(args: Omit<PreviewOrImportArgs, 'apply'>): Promise<InfluencerTypeImportResult> {
    return this.run({ ...args, apply: true });
  }

  private async run(args: PreviewOrImportArgs): Promise<InfluencerTypeImportResult> {
    const { buffer, filename, diseaseAreaId, apply, actorCognitoSub } = args;

    const raw = await parseRows(buffer, filename);
    const rows: InfluencerTypeImportRow[] = raw.map((r, i) => ({
      rowNumber: i + 2, // header is row 1
      npi: extractNpi(r),
      rawType: extractType(r),
      resolvedType: normalizeType(extractType(r)),
      matchedHcpId: null,
      hasDiseaseAreaLink: null,
    }));

    // v1.17.69 — pre-validate identifier shape so malformed IDs surface
    // as a clear per-row error rather than silently landing in the
    // "NPI not found" bucket. Mirrors the value-shape check in the
    // segment-score + campaign-hcp parsers.
    const invalidIdentifierRows = new Set<number>();
    for (const row of rows) {
      if (!row.npi) continue; // missing → handled below
      if (!/^\d{10}$/.test(row.npi) && !/^CAMD\d{8}$/.test(row.npi)) {
        invalidIdentifierRows.add(row.rowNumber);
      }
    }

    const npis = Array.from(new Set(rows.map((r) => r.npi).filter(Boolean)));
    const hcps = await prisma.hcp.findMany({
      where: { npi: { in: npis } },
      select: { id: true, npi: true },
    });
    const hcpByNpi = new Map(hcps.map((h) => [h.npi, h.id]));

    const hcpIds = hcps.map((h) => h.id);
    const linkRows = await prisma.hcpDiseaseArea.findMany({
      where: { diseaseAreaId, hcpId: { in: hcpIds } },
      select: { hcpId: true },
    });
    const linkedHcpIds = new Set(linkRows.map((l) => l.hcpId));

    const result: InfluencerTypeImportResult = {
      totalRows: rows.length,
      matched: 0,
      unmatchedNpi: 0,
      unmatchedDiseaseArea: 0,
      invalidType: 0,
      // v1.17.44 — initialize every canonical type to 0 from the
      // single source of truth, so adding a type only needs the const
      // update above (no second site to edit).
      countsByType: CANONICAL_INFLUENCER_TYPES.reduce(
        (acc, t) => ((acc[t] = 0), acc),
        {} as Record<InfluencerType, number>,
      ),
      errorRows: [],
      rows: [],
    };

    const updates: Array<{ hcpId: string; type: InfluencerType }> = [];
    for (const row of rows) {
      const hcpId = row.npi ? hcpByNpi.get(row.npi) : undefined;
      row.matchedHcpId = hcpId ?? null;
      row.hasDiseaseAreaLink = hcpId ? linkedHcpIds.has(hcpId) : null;

      if (!row.npi) {
        result.errorRows.push({ row: row.rowNumber, npi: '', rawType: row.rawType, reason: 'Missing identifier' });
        continue;
      }
      if (invalidIdentifierRows.has(row.rowNumber)) {
        result.errorRows.push({
          row: row.rowNumber,
          npi: row.npi,
          rawType: row.rawType,
          reason: 'Invalid identifier format (expected 10-digit NPI or 10/12-char OneKey ID)',
        });
        continue;
      }
      if (!hcpId) {
        result.unmatchedNpi += 1;
        result.errorRows.push({ row: row.rowNumber, npi: row.npi, rawType: row.rawType, reason: 'Identifier not found' });
        continue;
      }
      if (!row.resolvedType) {
        result.invalidType += 1;
        result.errorRows.push({
          row: row.rowNumber,
          npi: row.npi,
          rawType: row.rawType,
          reason: `Unknown influencer type: "${row.rawType}". Allowed: ${CANONICAL_INFLUENCER_TYPES.join(', ')}.`,
        });
        continue;
      }
      if (!row.hasDiseaseAreaLink) {
        result.unmatchedDiseaseArea += 1;
        result.errorRows.push({
          row: row.rowNumber,
          npi: row.npi,
          rawType: row.rawType,
          reason: 'HCP is not linked to this disease area',
        });
        continue;
      }

      result.matched += 1;
      result.countsByType[row.resolvedType] += 1;
      updates.push({ hcpId, type: row.resolvedType });
    }

    if (apply && updates.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const u of updates) {
          await tx.hcpDiseaseArea.update({
            where: {
              hcpId_diseaseAreaId: { hcpId: u.hcpId, diseaseAreaId },
            },
            data: { influencerType: u.type },
          });
        }
      });

      // Best-effort audit row. The actor's cognitoSub is resolved to
      // User.id via the v1.17.39 helper. If resolution fails we log a
      // warn and skip the audit insert rather than failing the import.
      try {
        const userId = await resolveUserIdForAudit(actorCognitoSub);
        if (userId) {
          await prisma.auditLog.create({
            data: {
              userId,
              action: 'hcp.influencer_types_imported',
              entityType: 'DiseaseArea',
              entityId: diseaseAreaId,
              newValues: {
                fileName: filename,
                totalRows: result.totalRows,
                matched: result.matched,
                countsByType: result.countsByType,
                errors: result.errorRows.length,
              },
            },
          });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          '[influencer-type-import] audit insert failed:',
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Preview returns the rows (capped) for UI rendering; import keeps
    // just the summary to keep response payloads small.
    if (!apply) {
      result.rows = rows;
    } else {
      result.rows = [];
    }
    return result;
  }
}

export const influencerTypeImportService = new InfluencerTypeImportService();
