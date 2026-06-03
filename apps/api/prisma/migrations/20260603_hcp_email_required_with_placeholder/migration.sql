-- v1.17.20: Hcp.email becomes required with a placeholder default.
--
-- The data backfill (prod 4,009 rows / test 1,058 rows, see
-- scripts/backfill-hcp-nomail-domain.sql) already eliminated every
-- NULL email on both envs. This migration just locks in the new
-- shape: NOT NULL + DEFAULT 'nomail@kol360research.com'. New rows
-- inserted without an email pick up the default; the application
-- form layer also offers a "Use placeholder" hint so operators do
-- it explicitly.
--
-- Idempotent: re-running is safe. SET NOT NULL on a column that's
-- already NOT NULL is a no-op; SET DEFAULT is idempotent.

ALTER TABLE "Hcp"
  ALTER COLUMN "email" SET DEFAULT 'nomail@kol360research.com';

-- Safety guard before the NOT NULL: re-run the backfill so a
-- re-applied migration on a DB that drifted (somehow re-acquired
-- NULL rows) doesn't fail at the SET NOT NULL step.
UPDATE "Hcp"
SET "email" = 'nomail@kol360research.com'
WHERE "email" IS NULL;

ALTER TABLE "Hcp"
  ALTER COLUMN "email" SET NOT NULL;
