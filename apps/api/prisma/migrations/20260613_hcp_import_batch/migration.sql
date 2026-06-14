-- v1.17.35 — per-batch record for bulk HCP imports + back-pointer
-- column on Hcp. Foundational for hcp-row-level-audit-gap-2026-06-13.md.
--
-- "Which CSV did this person come from?" becomes one join:
--   SELECT b."fileName" FROM "Hcp" h
--   JOIN "HcpImportBatch" b ON h."importBatchId" = b.id
--   WHERE h.id = ?
--
-- Idempotent (re-runnable) per the kol360 migration convention — prod
-- runs migrations via psql, and a re-applied non-idempotent migration
-- hard-fails. All CREATE / ADD COLUMN / ADD CONSTRAINT statements use
-- IF NOT EXISTS or DO-block guards.

-- 1. The batch table
CREATE TABLE IF NOT EXISTS "HcpImportBatch" (
  "id"             TEXT PRIMARY KEY,
  "campaignId"    TEXT,
  "importedBy"    TEXT NOT NULL,
  "fileName"      TEXT NOT NULL,
  "recordsTotal"  INTEGER NOT NULL,
  "recordsCreated" INTEGER NOT NULL,
  "recordsUpdated" INTEGER NOT NULL,
  "recordsSkipped" INTEGER NOT NULL DEFAULT 0,
  "recordsErrored" INTEGER NOT NULL DEFAULT 0,
  "createdHcpIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "updatedHcpIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "errorRows"     JSONB,
  "importedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "HcpImportBatch_campaignId_idx"
  ON "HcpImportBatch" ("campaignId");
CREATE INDEX IF NOT EXISTS "HcpImportBatch_importedAt_idx"
  ON "HcpImportBatch" ("importedAt");

-- 2. Hcp.importBatchId — back-pointer for CREATEd rows
ALTER TABLE "Hcp"
  ADD COLUMN IF NOT EXISTS "importBatchId" TEXT;

CREATE INDEX IF NOT EXISTS "Hcp_importBatchId_idx"
  ON "Hcp" ("importBatchId");

-- 3. FK Hcp → HcpImportBatch. Postgres has no ADD CONSTRAINT IF NOT
-- EXISTS — wrap in a DO block so re-runs don't fail.
DO $$ BEGIN
  ALTER TABLE "Hcp"
    ADD CONSTRAINT "Hcp_importBatchId_fkey"
    FOREIGN KEY ("importBatchId") REFERENCES "HcpImportBatch"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
