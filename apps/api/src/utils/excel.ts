/**
 * ExcelJS cell-value coercion helpers.
 *
 * Why this file exists
 * --------------------
 * ExcelJS returns `cell.value` as a shape-dependent value that depends on how
 * the cell was authored in the source file:
 *
 *   - Plain-text cells         → `string`
 *   - Numeric / boolean cells  → `number` / `boolean`
 *   - Date cells               → `Date`
 *   - **Hyperlink cells**      → `{ text: string, hyperlink: string }`
 *   - Rich-text cells          → `{ richText: [{ text, font? }, ...] }`
 *   - Formula cells            → `{ formula: string, result: unknown }`
 *
 * Excel auto-hyperlinks any cell whose value looks like an email address
 * (`typed a@b.com` → auto-formatted blue underlined `mailto:` link). The
 * per-row importers all bound `rowData[header] = cell.value` at their parse
 * boundary, so a hyperlinked email became an object downstream:
 *
 *   email: (row['Email'] || row['email'] || null) as string | null
 *
 * `{...}` is truthy so the "email required" guard didn't fire; the object
 * was passed into `prisma.hcp.update` / `create` which threw
 * `PrismaClientValidationError` — caught at row level and buried in the
 * per-row error panel. Real symptom on 2026-07-31: 14/417 rows silently
 * dropped from the BC Canada HCP file (see
 * `docs/findings/xlsx-import-hyperlink-cells-silently-drop-rows-2026-07-31.md`).
 *
 * Applying `cellText()` at every parse boundary keeps the CSV path
 * byte-for-byte identical (strings pass straight through) and normalises
 * every xlsx cell shape to a clean `string | null` for downstream row
 * consumers.
 */

/**
 * Coerce an ExcelJS cell value (of any supported shape) to a plain string,
 * or null when the cell is empty. Never returns an object.
 *
 * - `null` / `undefined` / empty string → null
 * - `string` → trimmed string (or null if trim results in empty)
 * - `number` / `boolean` → String(v)
 * - `Date` → ISO string
 * - Hyperlink cell `{text, hyperlink}` → trimmed `text` (or null)
 * - Rich-text cell `{richText: [{text}, ...]}` → concatenated text (or null)
 * - Formula cell `{formula, result}` → recursively coerces `result`
 * - Anything else → `JSON.stringify(v)` (defensive fallback for
 *   diagnosability; should not fire on real customer files).
 */
export function cellText(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    // ExcelJS hyperlink cell: { text: string, hyperlink: string }
    if ('text' in v && typeof (v as { text: unknown }).text === 'string') {
      const text = (v as { text: string }).text.trim();
      return text || null;
    }
    // ExcelJS rich-text cell: { richText: [{ text: string, font?: {...} }, ...] }
    if ('richText' in v && Array.isArray((v as { richText: unknown }).richText)) {
      const joined = ((v as { richText: Array<{ text?: string }> }).richText)
        .map((r) => r.text ?? '')
        .join('')
        .trim();
      return joined || null;
    }
    // ExcelJS formula cell: { formula: string, result: unknown }
    if ('result' in v) return cellText((v as { result: unknown }).result);
    // Defensive fallback — never expected to fire on real files.
    return JSON.stringify(v);
  }
  return String(v);
}
