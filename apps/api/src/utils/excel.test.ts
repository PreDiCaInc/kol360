import { describe, it, expect } from 'vitest';
import { cellText } from './excel';

// v2.0.5 — regression coverage for the xlsx-hyperlink silent-drop bug
// (14/417 rows lost on the BC Canada file, 2026-07-31). Every parse
// site now routes cell.value through cellText() at the boundary, so
// this helper's shape-matrix behavior is the load-bearing invariant.
// See docs/findings/xlsx-import-hyperlink-cells-silently-drop-rows-
// 2026-07-31.md.
describe('cellText', () => {
  describe('empty / nullish inputs', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['empty string', ''],
    ])('returns null for %s', (_label, input) => {
      expect(cellText(input)).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(cellText('   ')).toBeNull();
    });
  });

  describe('primitive inputs (pass through)', () => {
    it('returns trimmed string', () => {
      expect(cellText('  hello@example.com  ')).toBe('hello@example.com');
    });

    it('returns number as string', () => {
      expect(cellText(42)).toBe('42');
      expect(cellText(0)).toBe('0');
    });

    it('returns boolean as string', () => {
      expect(cellText(true)).toBe('true');
      expect(cellText(false)).toBe('false');
    });

    it('returns Date as ISO string', () => {
      const d = new Date('2026-07-31T12:00:00Z');
      expect(cellText(d)).toBe(d.toISOString());
    });
  });

  describe('ExcelJS hyperlink cell shape (THE bug class)', () => {
    it('extracts text from { text, hyperlink } object', () => {
      // This is what ExcelJS returns when Excel auto-hyperlinks an
      // email cell (`typed a@b.com` → auto-formatted mailto: link).
      // Prior to v2.0.5 this object flowed straight into row['Email']
      // and caused PrismaClientValidationError downstream.
      const cell = { text: 'jane@bc-canada.example.com', hyperlink: 'mailto:jane@bc-canada.example.com' };
      expect(cellText(cell)).toBe('jane@bc-canada.example.com');
    });

    it('trims whitespace from hyperlink text', () => {
      const cell = { text: '  jane@example.com  ', hyperlink: 'mailto:jane@example.com' };
      expect(cellText(cell)).toBe('jane@example.com');
    });

    it('returns null when hyperlink text is empty after trim', () => {
      const cell = { text: '   ', hyperlink: 'mailto:x' };
      expect(cellText(cell)).toBeNull();
    });
  });

  describe('ExcelJS rich-text cell shape', () => {
    it('joins richText runs into a single string', () => {
      const cell = {
        richText: [
          { text: 'Dr. ', font: { bold: true } },
          { text: 'Jane Smith' },
        ],
      };
      expect(cellText(cell)).toBe('Dr. Jane Smith');
    });

    it('handles missing text fields in richText runs', () => {
      const cell = { richText: [{ text: 'A' }, {}, { text: 'B' }] };
      expect(cellText(cell)).toBe('AB');
    });

    it('returns null when all richText runs are empty', () => {
      const cell = { richText: [{ text: '' }, { text: '  ' }] };
      expect(cellText(cell)).toBeNull();
    });
  });

  describe('ExcelJS formula cell shape', () => {
    it('recurses into formula result (string)', () => {
      const cell = { formula: 'CONCAT(A1, B1)', result: 'hello world' };
      expect(cellText(cell)).toBe('hello world');
    });

    it('recurses into formula result (number)', () => {
      const cell = { formula: 'SUM(A1:A10)', result: 42 };
      expect(cellText(cell)).toBe('42');
    });

    it('recurses into formula result (nested hyperlink)', () => {
      const cell = {
        formula: 'HYPERLINK(...)',
        result: { text: 'x@y.com', hyperlink: 'mailto:x@y.com' },
      };
      expect(cellText(cell)).toBe('x@y.com');
    });
  });

  describe('defensive fallback', () => {
    it('never returns an object for arbitrary shapes', () => {
      // Load-bearing invariant — the downstream truthy-object bug
      // was caused by a non-string leaking through. Fallback path
      // stringifies rather than returning the object.
      const cell = { foo: 'bar', bar: 123 } as unknown;
      const result = cellText(cell);
      expect(typeof result).toBe('string');
    });
  });

  // v2.1.0 — payment-status import hygiene sweep. The 4 sites in
  // apps/api/src/services/export.service.ts (paymentIdCol, npiCol,
  // statusCol, and the header row) now route through cellText() —
  // same class of pattern as the HCP import parse-boundary bug the
  // v2.0.5 fix closed, but for payment-status imports. Lower risk
  // than HCP (payment IDs / NPIs unlikely to be Excel-auto-hyperlinked
  // in real payment exports) but same class of bug. These tests
  // parameterize over the specific shapes those columns care about.
  describe('payment-status import — column value shapes', () => {
    const paymentIdShapes = [
      ['plain string', 'PAY-2026-000123', 'PAY-2026-000123'],
      ['trimmed whitespace', '  PAY-2026-000123  ', 'PAY-2026-000123'],
      // Very unlikely to happen in a real payment export but proves
      // the class of bug is closed.
      ['auto-hyperlinked cell', { text: 'PAY-2026-000123', hyperlink: 'https://example.com/p/123' }, 'PAY-2026-000123'],
      ['richText cell', { richText: [{ text: 'PAY-' }, { text: '2026-000123' }] }, 'PAY-2026-000123'],
      ['numeric ID', 1000023, '1000023'],
      ['empty cell', null, null],
    ] as const;
    it.each(paymentIdShapes)('payment ID column — %s', (_label, input, expected) => {
      expect(cellText(input)).toBe(expected);
    });

    const npiShapes = [
      ['plain string', '1234567890', '1234567890'],
      ['numeric', 1234567890, '1234567890'],
      // Real risk: an NPI cell where the user typed the URL to a
      // provider directory instead of the raw ID → Excel auto-links.
      ['hyperlinked (defensive)', { text: '1234567890', hyperlink: 'https://npi.example.com/1234567890' }, '1234567890'],
      ['empty cell', '', null],
    ] as const;
    it.each(npiShapes)('NPI column — %s', (_label, input, expected) => {
      expect(cellText(input)).toBe(expected);
    });

    const statusShapes = [
      ['sent (plain)', 'sent', 'sent'],
      ['SENT (case is preserved by helper; caller lowercases)', 'SENT', 'SENT'],
      ['richText status', { richText: [{ text: 'del' }, { text: 'ivered' }] }, 'delivered'],
      ['empty', undefined, null],
    ] as const;
    it.each(statusShapes)('status column — %s', (_label, input, expected) => {
      expect(cellText(input)).toBe(expected);
    });
  });
});
