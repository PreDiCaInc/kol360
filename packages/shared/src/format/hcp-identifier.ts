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
 * 12-char CAMD######## layout.
 *
 * v1.18.4 — MINC format was relaxed to just "10 or 12 alphanumeric
 * chars" (no CAMD prefix, no digit-tail requirement). Non-CAMD values
 * fall through the regex check and render raw — no pretty split, but
 * the value is still shown intact. The regex here stays scoped to the
 * classic CAMD shape so legacy rows keep their nicer display.
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

/**
 * v1.17.69 — infer the ID column label ("NPI" or "MINC") from a
 * loaded list of HCP-like records. Falls back to 'NPI' when the
 * list is empty or every row is missing `nationalIdType`. Useful
 * for CSV export headers + on-screen table column labels where
 * threading `client.defaultCountry` through every prop would be
 * noisy. All items in one client's dashboard share country, so a
 * single scan of the array is sufficient.
 */
export function inferHcpIdLabel<
  T extends { nationalIdType?: string | null },
>(items: readonly T[]): 'NPI' | 'MINC' {
  for (const item of items) {
    if (item.nationalIdType === 'MINC') return 'MINC';
    if (item.nationalIdType === 'NPI') return 'NPI';
  }
  return 'NPI';
}
