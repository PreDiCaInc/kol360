-- v1.17.68 — Multi-country HCP support (Canada MINC).
-- Ticket: docs/findings/canada-hcp-support-lite-plan-2026-06-25.md
--
-- Three new columns on Hcp:
--   * nationalIdType — 'NPI' (US) or 'MINC' (CA). Defaults 'NPI' so
--     the existing 13k rows keep behaving as US HCPs.
--   * country — 'US' or 'CA'. Threads into Insights via
--     Client.defaultCountry (also added here).
--   * alternateIds — rare cross-licensed HCPs' secondary ID.
--     Informational only, not indexed. Nullable Json array.
--
-- One new column on Client:
--   * defaultCountry — determines which national-ID regime this
--     tenant's HCPs use + scopes Insights queries. Defaults 'US'.
--     Existing clients (Sun Pharma, B+L, Bio-Exec, DE Pharma) all
--     remain US-scoped without any explicit write.
--
-- One new index on Hcp:
--   * country — used by Insights WHERE clauses. Cheap to add.
--
-- Rollback: drop the four columns + drop the index. Existing rows
-- have their defaults applied; dropping them just loses the
-- multi-country distinction.
--
-- Idempotent: every DDL uses IF NOT EXISTS.

ALTER TABLE "Hcp" ADD COLUMN IF NOT EXISTS "nationalIdType" TEXT NOT NULL DEFAULT 'NPI';
ALTER TABLE "Hcp" ADD COLUMN IF NOT EXISTS "country"        TEXT NOT NULL DEFAULT 'US';
ALTER TABLE "Hcp" ADD COLUMN IF NOT EXISTS "alternateIds"   JSONB;

CREATE INDEX IF NOT EXISTS "Hcp_country_idx" ON "Hcp"("country");

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "defaultCountry" TEXT NOT NULL DEFAULT 'US';
