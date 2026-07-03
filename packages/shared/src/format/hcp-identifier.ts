/**
 * v1.17.68 — Display helpers for the multi-country HCP identifier.
 *
 * The `Hcp.npi` column now holds either an NPI (10-digit US) or a
 * MINC (12-char CAMD######## CA). The `Hcp.nationalIdType` field
 * says which — this module renders a human-readable label + value
 * pair based on the type.
 *
 * Two output flavors:
 *   - `formatHcpId(hcp)` → labeled "NPI: 1234567890" / "MINC: CA-MD-123-4567"
 *     for on-screen UI cells that used to render `hcp.npi || '--'`.
 *   - `getHcpIdValue(hcp)` → just the value, used by CSV exports
 *     where the column header carries the label separately.
 *
 * MINC values are stored in normalized 12-char form (CAMD########);
 * this module formats them for display with hyphens (CA-MD-###-####-#)
 * for readability. Reverse of the `normalizeMinc()` helper on the
 * validation side.
 *
 * Ticket: docs/findings/canada-hcp-support-lite-plan-2026-06-25.md
 */

export interface HcpIdRef {
  npi: string | null;
  nationalIdType?: string | null;
}

/**
 * Format a MINC's normalized 12-char storage form into its
 * hyphenated display form: `CAMD12345678` → `CA-MD-1234-567-8`.
 * Returns the input unchanged if it doesn't match the expected
 * 12-char CAMD######## layout (defensive — corrupted rows still
 * render, just without the pretty split).
 */
export function formatMincForDisplay(normalized: string): string {
  const match = /^([A-Z]{2})([A-Z]{2})(\d{4})(\d{3})(\d{1})$/.exec(normalized);
  if (!match) return normalized;
  return `${match[1]}-${match[2]}-${match[3]}-${match[4]}-${match[5]}`;
}

/**
 * Labeled identifier for on-screen display. Returns `—` when the row
 * has no identifier set (rare — mostly nomination-only HCPs that
 * haven't been matched to a real record).
 *
 * Examples:
 *   { npi: '1234567890', nationalIdType: 'NPI' }  → 'NPI: 1234567890'
 *   { npi: 'CAMD12345678', nationalIdType: 'MINC' } → 'MINC: CA-MD-1234-567-8'
 *   { npi: null }                                  → '—'
 */
export function formatHcpId(hcp: HcpIdRef): string {
  if (!hcp.npi) return '—';
  const type = hcp.nationalIdType ?? 'NPI';
  const value = type === 'MINC' ? formatMincForDisplay(hcp.npi) : hcp.npi;
  return `${type}: ${value}`;
}

/**
 * Just the value, without a label. For CSV / Excel exports where
 * the column header already carries the label. Returns empty string
 * when unset (CSV-friendly).
 */
export function getHcpIdValue(hcp: HcpIdRef): string {
  if (!hcp.npi) return '';
  const type = hcp.nationalIdType ?? 'NPI';
  return type === 'MINC' ? formatMincForDisplay(hcp.npi) : hcp.npi;
}

/**
 * Column header text for CSV exports. Different across US vs CA
 * exports so the file consumer sees the right vocabulary. Callers
 * scope by country typically via `client.defaultCountry`.
 */
export function hcpIdColumnHeader(type: 'NPI' | 'MINC'): string {
  return type;
}
