import { describe, it, expect } from 'vitest';
import {
  isPlaceholderEmail,
  partitionByPlaceholderEmail,
  PLACEHOLDER_EMAILS,
  PLACEHOLDER_PREFIX_RE,
} from '../email-placeholders';

// v1.17.36 — unit coverage for the placeholder predicate. The predicate
// is load-bearing — every email send path on the platform gates on it,
// and a regression here would re-introduce the bulk-send-into-the-void
// bug (docs/findings/bulk-send-accepts-placeholder-emails-2026-06-13.md).

describe('isPlaceholderEmail', () => {
  describe('null/empty inputs', () => {
    it('treats null as placeholder', () => {
      expect(isPlaceholderEmail(null)).toBe(true);
    });
    it('treats undefined as placeholder', () => {
      expect(isPlaceholderEmail(undefined)).toBe(true);
    });
    it('treats empty string as placeholder', () => {
      expect(isPlaceholderEmail('')).toBe(true);
    });
    it('treats whitespace-only string as placeholder', () => {
      expect(isPlaceholderEmail('   ')).toBe(true);
    });
  });

  describe('known placeholders', () => {
    it('matches nomail@kol360research.com (v1.17.20 canonical)', () => {
      expect(isPlaceholderEmail('nomail@kol360research.com')).toBe(true);
    });
    it('matches nomail@bio-exec.com (legacy)', () => {
      expect(isPlaceholderEmail('nomail@bio-exec.com')).toBe(true);
    });
    it('is case-insensitive on the known set', () => {
      expect(isPlaceholderEmail('NoMail@Kol360Research.com')).toBe(true);
      expect(isPlaceholderEmail('NOMAIL@BIO-EXEC.COM')).toBe(true);
    });
    it('trims whitespace before matching', () => {
      expect(isPlaceholderEmail('  nomail@kol360research.com  ')).toBe(true);
    });
  });

  describe('prefix-based catch-all (^nomail@)', () => {
    it('matches any nomail@ variant', () => {
      // Future variants the team might coin without telling us.
      expect(isPlaceholderEmail('nomail@example.com')).toBe(true);
      expect(isPlaceholderEmail('nomail@anothereddomain.org')).toBe(true);
    });
    it('is case-insensitive on the prefix', () => {
      expect(isPlaceholderEmail('NoMail@whatever.com')).toBe(true);
    });
    it('does NOT match "mail@" or other prefixes', () => {
      expect(isPlaceholderEmail('mail@example.com')).toBe(false);
      expect(isPlaceholderEmail('email@example.com')).toBe(false);
    });
    it('does NOT match "nomail" embedded later in the local part', () => {
      // The regex is anchored to the start.
      expect(isPlaceholderEmail('user.nomail@example.com')).toBe(false);
    });
  });

  describe('real-looking addresses (should NOT be flagged)', () => {
    it.each([
      'alice@example.com',
      'paul.karpecki+research@gmail.com',
      'firstname.lastname@hospital.org',
      'doctor@subdomain.example.com',
      'someone@bio-exec.com', // bio-exec.com itself is fine; only nomail@ is bad
      'a@b.co',
    ])('"%s" is NOT a placeholder', (email) => {
      expect(isPlaceholderEmail(email)).toBe(false);
    });
  });

  describe('exported constants', () => {
    it('PLACEHOLDER_EMAILS includes both canonical and legacy values', () => {
      expect(PLACEHOLDER_EMAILS.has('nomail@kol360research.com')).toBe(true);
      expect(PLACEHOLDER_EMAILS.has('nomail@bio-exec.com')).toBe(true);
    });
    it('PLACEHOLDER_PREFIX_RE is exported and matches nomail@', () => {
      expect(PLACEHOLDER_PREFIX_RE.test('nomail@example.com')).toBe(true);
      expect(PLACEHOLDER_PREFIX_RE.test('NOMAIL@EXAMPLE.COM')).toBe(true);
      expect(PLACEHOLDER_PREFIX_RE.test('hello@example.com')).toBe(false);
    });
  });
});

describe('partitionByPlaceholderEmail', () => {
  it('splits a mixed list into deliverable + placeholder buckets', () => {
    const rows = [
      { id: '1', email: 'alice@example.com' },
      { id: '2', email: 'nomail@kol360research.com' },
      { id: '3', email: 'bob@example.com' },
      { id: '4', email: null },
      { id: '5', email: 'nomail@bio-exec.com' },
    ];
    const { deliverable, placeholder } = partitionByPlaceholderEmail(rows);
    expect(deliverable).toHaveLength(2);
    expect(deliverable.map((r) => r.id)).toEqual(['1', '3']);
    expect(placeholder).toHaveLength(3);
    expect(placeholder.map((r) => r.id)).toEqual(['2', '4', '5']);
  });

  it('handles an all-deliverable list', () => {
    const rows = [{ email: 'a@b.com' }, { email: 'c@d.com' }];
    const { deliverable, placeholder } = partitionByPlaceholderEmail(rows);
    expect(deliverable).toHaveLength(2);
    expect(placeholder).toHaveLength(0);
  });

  it('handles an all-placeholder list', () => {
    const rows = [
      { email: 'nomail@kol360research.com' },
      { email: null },
      { email: '' },
    ];
    const { deliverable, placeholder } = partitionByPlaceholderEmail(rows);
    expect(deliverable).toHaveLength(0);
    expect(placeholder).toHaveLength(3);
  });

  it('handles an empty input', () => {
    const { deliverable, placeholder } = partitionByPlaceholderEmail([]);
    expect(deliverable).toEqual([]);
    expect(placeholder).toEqual([]);
  });
});
