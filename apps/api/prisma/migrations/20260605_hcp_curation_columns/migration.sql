-- v1.17.29 — curation sync support: add two columns to Hcp so the new
-- POST /api/v1/hcps/get-beid route can record the curation-side discovery
-- context for a minted or dedup-hit beId.
--
-- - curationManagedAt: timestamp of the first time the curation-svc M2M
--   client touched this Hcp. NULL for every Hcp not in the curation flow.
-- - discoveredFrom: opaque JSON blob passed through from the curation
--   request body (source_url, scraper_run_id, ai_verification_snapshot_url,
--   captured_at, notes). Stored verbatim; we promote to a relational
--   HcpSourceContribution model later if/when we need queryable shape.
--
-- Both columns are nullable so the migration touches zero existing rows.
-- Idempotent (re-runnable): ADD COLUMN IF NOT EXISTS.

ALTER TABLE "Hcp"
  ADD COLUMN IF NOT EXISTS "curationManagedAt" TIMESTAMP(3) NULL;

ALTER TABLE "Hcp"
  ADD COLUMN IF NOT EXISTS "discoveredFrom" JSONB NULL;
