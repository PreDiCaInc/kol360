// v1.17.36 — placeholder-email helper used by every email send path
// on the platform.
//
// Background: docs/findings/bulk-send-accepts-placeholder-emails-2026-06-13.md.
//
// Operators have historically typed `nomail@bio-exec.com` (2,651 rows
// historically, per the v1.17.20 backfill script) or
// `nomail@kol360research.com` (4,012 rows currently — that backfill's
// canonical target) when no real email was available on import. Both
// are syntactically valid; both went to SES and got 250 OK; the
// platform marked `emailSentAt`; 3 reminders followed. 269
// platform-sent invitations across the two ACTIVE Sun Pharma 2026
// campaigns went into the void.
//
// This helper is the single point where the platform decides whether
// an address is real enough to send to. Every email send path
// (sendBulkInvitations, sendBulkReminders, sendSurveyInvitation,
// sendReminderEmail, any future single-send) calls this before
// dispatching.

/**
 * Known placeholder addresses. Lowercase comparison.
 * Add new ones here if the team coins them.
 */
export const PLACEHOLDER_EMAILS: ReadonlySet<string> = new Set([
  'nomail@kol360research.com', // v1.17.20 canonical
  'nomail@bio-exec.com', // legacy (pre-v1.17.20)
]);

/**
 * Anything matching this prefix is treated as a placeholder.
 * Catches future variants ('nomail@somethingelse.com') without
 * needing a code change.
 */
export const PLACEHOLDER_PREFIX_RE = /^nomail@/i;

/**
 * Returns true if the address is null/empty OR matches a known
 * placeholder OR has the placeholder prefix. The send path should
 * skip these and bucket them under skippedPlaceholder so the
 * admin-visible "X HCPs skipped" stat tells the truth.
 */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  if (!email) return true; // null/empty is a placeholder for send purposes
  const lower = email.trim().toLowerCase();
  if (lower === '') return true;
  if (PLACEHOLDER_EMAILS.has(lower)) return true;
  if (PLACEHOLDER_PREFIX_RE.test(lower)) return true;
  return false;
}

/**
 * Convenience splitter: given a list of HCPs (anything with an `email`
 * field), returns the deliverable subset and the placeholder subset.
 * Same predicate as isPlaceholderEmail; provided so consumers can
 * count both buckets in a single pass.
 *
 * Don't use this for the actual send loop — the per-row skip path
 * needs to call isPlaceholderEmail() at the top of the loop and
 * increment its own counters so the existing skippedOptedOut /
 * skippedCompleted etc. flow keeps working. This helper is for
 * pre-flight counts.
 */
export function partitionByPlaceholderEmail<T extends { email: string | null | undefined }>(
  rows: T[]
): { deliverable: T[]; placeholder: T[] } {
  const deliverable: T[] = [];
  const placeholder: T[] = [];
  for (const row of rows) {
    if (isPlaceholderEmail(row.email)) {
      placeholder.push(row);
    } else {
      deliverable.push(row);
    }
  }
  return { deliverable, placeholder };
}
