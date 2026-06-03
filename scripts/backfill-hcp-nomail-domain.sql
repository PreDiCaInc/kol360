-- v1.17.20 (prod-rel-4.1.11) — backfill `nomail@bio-exec.com` placeholders
-- to `nomail@kol360research.com` so they stop being caught by the
-- excludeInternalEmails filter (which suffix-matches `@bio-exec.com`).
--
-- Context: when an HCP CSV import didn't have an email, operators were
-- typing `nomail@bio-exec.com` as a placeholder. That made 2,651 legit
-- HCPs look like internal Bio-Exec staff to every downstream filter
-- (insights, nominations, exports, KOL analysis), silently excluding
-- them from campaigns that had excludeInternalEmails=true.
--
-- The 5 actual staff-on-Hcp entries (charisza, haranath, jpikor, jboyd
-- variants) are intentional — they're internal team members used as
-- HCPs for testing. Those keep their @bio-exec.com email and continue
-- to be caught by the filter.
--
-- Already applied to prod (2026-06-03, 2651 rows) and test (1058 rows)
-- via this query. Idempotent — re-running is a no-op (the LIKE pattern
-- won't match after the rename).
--
-- Going forward: operators should use `nomail@kol360research.com` as
-- the placeholder for missing HCP emails, not `nomail@bio-exec.com`.

UPDATE "Hcp"
SET email = 'nomail@kol360research.com'
WHERE email = 'nomail@bio-exec.com';

-- Sanity check (should return 0):
SELECT COUNT(*) AS remaining_old_placeholder
FROM "Hcp"
WHERE email = 'nomail@bio-exec.com';
