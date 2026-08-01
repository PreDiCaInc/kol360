import { describe, it, expect } from 'vitest';
import { isCooldownExempt } from '../email.service';

// v2.0.5 — regression coverage for the 12-month cooldown Bio-Exec
// exemption. Prior behavior: internal QA users (jboyd@bio-exec.com,
// jpikor@bio-exec.com) were silently skipped by the cooldown when
// running a new B&L Canada test send after a Sun Pharma / Dry Eye
// completion ~4.7 months earlier. Fix: exempt @bio-exec.com addresses
// from the cooldown only — everything else (opt-out, placeholder-email,
// bounce, complaint) still applies to bio-exec addresses because those
// are legal / SES-suppression / data-integrity signals. See
// docs/findings/send-cooldown-bioexec-exception-2026-07-30.md.
describe('isCooldownExempt', () => {
  it.each([
    'jboyd@bio-exec.com',
    'jpikor@bio-exec.com',
    'JBoyd@Bio-Exec.com',
    'test@BIO-EXEC.COM',
    'x@bio-exec.com',
  ])('returns true for %s', (email) => {
    expect(isCooldownExempt(email)).toBe(true);
  });

  it.each([
    'jboyd@exec-bio.com',        // The workaround domain biz used pre-fix
    'jenniferpikor@gmail.com',   // The workaround gmail biz used pre-fix
    'real.hcp@example.com',      // A real HCP address
    'nomail@kol360research.com', // Placeholder shape
    'user@bio-exec.co',          // Suffix typo — must NOT match
    'user@bio-exec.com.attacker.com', // Suffix-injection guard
    'bio-exec.com@evil.example',      // Prefix-injection guard
  ])('returns false for %s', (email) => {
    expect(isCooldownExempt(email)).toBe(false);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
  ])('returns false for %s', (_label, email) => {
    expect(isCooldownExempt(email)).toBe(false);
  });
});
