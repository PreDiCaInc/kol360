-- Drift fix: schema.prisma has declared OptOut.@@index([hcpId]) and the
-- `hcp Hcp? @relation` FK since the v1.15.14 opt-out canonical-key work, but
-- no migration ever created them — the init migration built OptOut with only
-- email/scope/campaignId indexes + the campaignId FK. Prod (built from init)
-- is missing OptOut_hcpId_idx and OptOut_hcpId_fkey, so the cutover drift
-- check is non-zero until this lands.
--
-- Idempotent by convention (may be applied via raw psql, possibly re-run).

CREATE INDEX IF NOT EXISTS "OptOut_hcpId_idx" ON "OptOut"("hcpId");

-- Null out any dangling hcpId (the HCP was deleted or re-imported with a new
-- id — exactly the staleness the v1.15.14 work moved away from). Required so
-- the FK below validates against existing prod rows. Safe: opt-out lookups
-- are email-canonical; hcpId is provenance only and a dangling value is
-- already meaningless. Idempotent (no-op once clean).
UPDATE "OptOut" SET "hcpId" = NULL
 WHERE "hcpId" IS NOT NULL
   AND "hcpId" NOT IN (SELECT "id" FROM "Hcp");

-- FK matches the existing OptOut_campaignId_fkey shape (optional relation,
-- no explicit onDelete → Prisma default ON DELETE SET NULL ON UPDATE CASCADE),
-- so post-apply drift resolves to zero. Postgres has no
-- ADD CONSTRAINT IF NOT EXISTS — guard against re-run.
DO $$ BEGIN
  ALTER TABLE "OptOut" ADD CONSTRAINT "OptOut_hcpId_fkey"
    FOREIGN KEY ("hcpId") REFERENCES "Hcp"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
