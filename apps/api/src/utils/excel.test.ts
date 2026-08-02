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
});
