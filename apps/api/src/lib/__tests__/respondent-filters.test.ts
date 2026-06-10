import { describe, it, expect } from 'vitest';
import { parseRespondentFilters } from '../respondent-filters';

// v1.17.31 — synthetic unit test for the respondent-filter query parser.
//
// Lives at the parser-seam level (no Fastify, no DB) so it catches the
// comma-bug class deterministically without depending on prod-shape
// data. See docs/findings/splitcsv-comma-bug-2026-06-09.md.

describe('parseRespondentFilters', () => {
  describe('comma-containing values (THE bug)', () => {
    // The exact value the customer reported. Pre-fix, the route layer
    // split on ',', producing ["Dry Eye (including OSD", "MGD", "and NK)"]
    // — none of which match the real category, so the filter zeroed out.
    it('preserves "Dry Eye (including OSD, MGD, and NK)" as a single value', () => {
      const out = parseRespondentFilters({
        coreFocuses: 'Dry Eye (including OSD, MGD, and NK)',
      });
      expect(out.coreFocuses).toEqual(['Dry Eye (including OSD, MGD, and NK)']);
    });

    it('preserves a comma inside a generic value as a single value', () => {
      const out = parseRespondentFilters({
        practiceSettings: 'Hospital, Outpatient',
      });
      expect(out.practiceSettings).toEqual(['Hospital, Outpatient']);
    });

    it('preserves a comma even when the dimension also has a sibling value', () => {
      // Fastify decodes repeated `?k=A&k=B` into ['A','B']. If 'A' itself
      // contains a comma, it must remain whole.
      const out = parseRespondentFilters({
        coreFocuses: ['Dry Eye (including OSD, MGD, and NK)', 'Glaucoma'],
      });
      expect(out.coreFocuses).toEqual(['Dry Eye (including OSD, MGD, and NK)', 'Glaucoma']);
    });
  });

  describe('repeated query params (the new wire shape)', () => {
    it('accepts a string[] for coreFocuses', () => {
      const out = parseRespondentFilters({ coreFocuses: ['A', 'B', 'C'] });
      expect(out.coreFocuses).toEqual(['A', 'B', 'C']);
    });

    it('accepts a string[] for respondentRoles', () => {
      const out = parseRespondentFilters({ respondentRoles: ['Optometry', 'Ophthalmology'] });
      expect(out.respondentRoles).toEqual(['Optometry', 'Ophthalmology']);
    });

    it('drops empty / whitespace-only entries in an array', () => {
      const out = parseRespondentFilters({ coreFocuses: ['A', '', '  ', 'B'] });
      expect(out.coreFocuses).toEqual(['A', 'B']);
    });
  });

  describe('single-value strings', () => {
    it('wraps a single string in a 1-element array', () => {
      const out = parseRespondentFilters({ coreFocuses: 'Glaucoma' });
      expect(out.coreFocuses).toEqual(['Glaucoma']);
    });

    it('trims whitespace', () => {
      const out = parseRespondentFilters({ coreFocuses: '  Glaucoma  ' });
      expect(out.coreFocuses).toEqual(['Glaucoma']);
    });
  });

  describe('absence', () => {
    it('returns undefined for missing keys', () => {
      const out = parseRespondentFilters({});
      expect(out.coreFocuses).toBeUndefined();
      expect(out.respondentRoles).toBeUndefined();
      expect(out.stateOfPractices).toBeUndefined();
      expect(out.practiceSettings).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      const out = parseRespondentFilters({ coreFocuses: '' });
      expect(out.coreFocuses).toBeUndefined();
    });

    it('returns undefined for an empty array', () => {
      const out = parseRespondentFilters({ coreFocuses: [] });
      expect(out.coreFocuses).toBeUndefined();
    });
  });

  describe('legacy singular fallback keys', () => {
    it('reads coreFocus when coreFocuses absent', () => {
      const out = parseRespondentFilters({ coreFocus: 'Glaucoma' });
      expect(out.coreFocuses).toEqual(['Glaucoma']);
    });

    it('plural key wins when both supplied', () => {
      const out = parseRespondentFilters({ coreFocus: 'A', coreFocuses: 'B' });
      expect(out.coreFocuses).toEqual(['B']);
    });
  });

  describe('numeric range filters', () => {
    it('coerces numeric strings to numbers', () => {
      const out = parseRespondentFilters({ yearsMin: '5', yearsMax: '20' });
      expect(out.yearsMin).toBe(5);
      expect(out.yearsMax).toBe(20);
    });

    it('returns undefined for non-numeric strings', () => {
      const out = parseRespondentFilters({ yearsMin: 'lol' });
      expect(out.yearsMin).toBeUndefined();
    });

    it('returns undefined for missing range keys', () => {
      const out = parseRespondentFilters({});
      expect(out.yearsMin).toBeUndefined();
      expect(out.monthlyPatientsMax).toBeUndefined();
    });
  });
});
