-- Idempotent: prod applies migrations via raw psql.
-- Per-client allowed email domain list. Empty array = no restriction
-- (opt-in mode for backwards compat). Validated only at user invite +
-- reassignment time; existing users with mismatched domains keep working.
-- Hardcoded ALWAYS_ALLOWED_DOMAINS in userService (currently bio-exec.com)
-- is applied on top of whatever's stored here.

ALTER TABLE "Client"
  ADD COLUMN IF NOT EXISTS "emailDomains" TEXT[] NOT NULL DEFAULT '{}';
