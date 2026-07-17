/**
 * v1.17.68 — Display helpers for the multi-country HCP identifier.
 * v1.19.0 — RENAMED: `MINC` → `ONEKEY_ID`, display label "OneKey ID".
 *
 * The `Hcp.npi` column holds either an NPI (10-digit US) or a
 * OneKey ID (10-or-12 alphanumeric, CA). The `Hcp.nationalIdType`
 * field says which — this module renders a human-readable label +
 * value pair based on the type.
 *
 * Two output flavors:
 *   - `formatHcpId(hcp)` → labeled "NPI: 1234567890" / "OneKey ID: CA-MD-123-4567"
 *   - `getHcpIdValue(hcp)` → just the value (for CSV exports where
 *     the column header carries the label).
 *
 * OneKey ID values are stored normalized (uppercase alphanumeric, no
 * separators). Legacy CAMD######## 12-char values render prettily
 * with the CA-MD-####-###-# hyphenation via `formatOneKeyIdForDisplay()`;
 * post-v1.18.4 non-CAMD values render raw. Reverse of the
 * `normalizeOneKeyId()` helper on the validation side.
 *
 * Ticket: docs/findings/canada-hcp-support-lite-plan-2026-06-25.md
 */

export interface HcpIdRef {
  npi: string | null;
  nationalIdType?: string | null;
}

/**
 * Format a legacy CAMD######## OneKey ID storage value into its
 * hyphenated display form: `CAMD12345678` → `CA-MD-1234-567-8`.
 * Returns the input unchanged if it doesn't match the 12-char CAMD
 * layout — post-v1.18.4 relax, most inputs don't match, and rendering
 * the value raw is the right behavior.
 *
 * v1.19.0 — renamed from `formatMincForDisplay`.
 */
export function formatOneKeyIdForDisplay(normalized: string): string {
  const match = /^([A-Z]{2})([A-Z]{2})(\d{4})(\d{3})(\d{1})$/.exec(normalized);
  if (!match) return normalized;
  return `${match[1]}-${match[2]}-${match[3]}-${match[4]}-${match[5]}`;
}

// Display label for the ONEKEY_ID nationalIdType value. Kept as a
// constant so callers don't have to spell it out (or forget the space).
export const ONEKEY_ID_LABEL = 'OneKey ID';

function labelFor(type: string): string {
  return type === 'ONEKEY_ID' ? ONEKEY_ID_LABEL : type;
}

/**
 * Labeled identifier for on-screen display. Returns `—` when the row
 * has no identifier set (rare — mostly nomination-only HCPs that
 * haven't been matched to a real record).
 *
 * Examples:
 *   { npi: '1234567890', nationalIdType: 'NPI' }       → 'NPI: 1234567890'
 *   { npi: 'CAMD12345678', nationalIdType: 'ONEKEY_ID' } → 'OneKey ID: CA-MD-1234-567-8'
 *   { npi: 'ABC123456789', nationalIdType: 'ONEKEY_ID' } → 'OneKey ID: ABC123456789'
 *   { npi: null }                                       → '—'
 */
export function formatHcpId(hcp: HcpIdRef): string {
  if (!hcp.npi) return '—';
  const type = hcp.nationalIdType ?? 'NPI';
  const value = type === 'ONEKEY_ID' ? formatOneKeyIdForDisplay(hcp.npi) : hcp.npi;
  return `${labelFor(type)}: ${value}`;
}

/**
 * Just the value, without a label. For CSV / Excel exports where
 * the column header already carries the label. Returns empty string
 * when unset (CSV-friendly).
 */
export function getHcpIdValue(hcp: HcpIdRef): string {
  if (!hcp.npi) return '';
  const type = hcp.nationalIdType ?? 'NPI';
  return type === 'ONEKEY_ID' ? formatOneKeyIdForDisplay(hcp.npi) : hcp.npi;
}

/**
 * Column header text for CSV exports. Different across US vs CA
 * exports so the file consumer sees the right vocabulary.
 * v1.19.0 — 'ONEKEY_ID' emits "OneKey ID" (two words) not the raw
 * enum value.
 */
export function hcpIdColumnHeader(type: 'NPI' | 'ONEKEY_ID'): string {
  return type === 'ONEKEY_ID' ? ONEKEY_ID_LABEL : 'NPI';
}

/**
 * v1.17.69 — infer the ID column label from a loaded list of HCP-like
 * records. Falls back to 'NPI' when the list is empty or every row is
 * missing `nationalIdType`.
 * v1.19.0 — returns 'ONEKEY_ID' (was 'MINC'). Use `hcpIdColumnHeader()`
 * to get the display string ("OneKey ID").
 */
export function inferHcpIdLabel<
  T extends { nationalIdType?: string | null },
>(items: readonly T[]): 'NPI' | 'ONEKEY_ID' {
  for (const item of items) {
    if (item.nationalIdType === 'ONEKEY_ID') return 'ONEKEY_ID';
    if (item.nationalIdType === 'NPI') return 'NPI';
  }
  return 'NPI';
}
