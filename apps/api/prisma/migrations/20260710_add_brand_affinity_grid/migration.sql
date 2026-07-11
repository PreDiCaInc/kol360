-- Brand-Affinity Grid Nomination — Phase 1 data model.
-- Ticket: docs/findings/brand-affinity-grid-nomination-plan-2026-07-08.md
--
-- Introduces:
--   * BrandFlagType enum (BRAND, NEUTRAL, DONT_KNOW)
--   * Campaign.brandsFrozenAt        — timestamp of first response,
--                                       nulls brand-option mutation past this point (item O).
--   * SurveyQuestion.useBrandGrid    — per-question grid toggle (item L).
--   * CampaignBrandOption            — ordered brand list per campaign.
--   * NominationBrandFlag            — per-nomination brand / Neutral / DK selections.
--                                       Sentinel flagType with brandOptionId NULL
--                                       stores NEUTRAL and DONT_KNOW rows.
--
-- Mutual-exclusion invariant (BRAND vs NEUTRAL/DK per nomination) is
-- enforced at the Zod write-schema layer, not at the DB. See item S in
-- the ticket. Rationale: mixed-mode analyses can still cleanly INSERT
-- either shape without a hard CHECK constraint failing on partial
-- migrations mid-rollout.
--
-- Rollback: drop the two new tables (cascades from Campaign relation),
-- drop the enum, drop the two new columns. Existing surveys / campaigns
-- unaffected — `useBrandGrid` defaults FALSE and `brandsFrozenAt` is
-- NULL for every existing campaign.
--
-- Idempotent: safe to re-apply. Every DDL uses IF NOT EXISTS, and the
-- enum + FK creations are guarded by DO $$ … EXCEPTION blocks.

-- ---- New enum: BrandFlagType --------------------------------------
DO $$ BEGIN
  CREATE TYPE "BrandFlagType" AS ENUM ('BRAND', 'NEUTRAL', 'DONT_KNOW');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---- Additive columns ---------------------------------------------
ALTER TABLE "Campaign"        ADD COLUMN IF NOT EXISTS "brandsFrozenAt" TIMESTAMP(3);
ALTER TABLE "SurveyQuestion"  ADD COLUMN IF NOT EXISTS "useBrandGrid"   BOOLEAN NOT NULL DEFAULT FALSE;

-- ---- New table: CampaignBrandOption -------------------------------
CREATE TABLE IF NOT EXISTS "CampaignBrandOption" (
    "id"           TEXT NOT NULL,
    "campaignId"   TEXT NOT NULL,
    "brandName"    TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignBrandOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CampaignBrandOption_campaignId_brandName_key"
    ON "CampaignBrandOption"("campaignId", "brandName");
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignBrandOption_campaignId_displayOrder_key"
    ON "CampaignBrandOption"("campaignId", "displayOrder");
CREATE INDEX IF NOT EXISTS "CampaignBrandOption_campaignId_idx"
    ON "CampaignBrandOption"("campaignId");

DO $$ BEGIN
  ALTER TABLE "CampaignBrandOption"
    ADD CONSTRAINT "CampaignBrandOption_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---- New table: NominationBrandFlag -------------------------------
CREATE TABLE IF NOT EXISTS "NominationBrandFlag" (
    "id"            TEXT NOT NULL,
    "nominationId"  TEXT NOT NULL,
    "flagType"      "BrandFlagType" NOT NULL,
    "brandOptionId" TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NominationBrandFlag_pkey" PRIMARY KEY ("id")
);

-- BRAND rows (brandOptionId non-null): compound unique catches dups.
-- NEUTRAL / DONT_KNOW rows (brandOptionId NULL): Postgres treats NULL
-- as distinct inside a UNIQUE tuple, so the compound above does NOT
-- prevent duplicate sentinel rows. The partial unique below closes
-- that gap. Zod also enforces the invariant at write-time (item S).
CREATE UNIQUE INDEX IF NOT EXISTS "NominationBrandFlag_nominationId_brandOptionId_flagType_key"
    ON "NominationBrandFlag"("nominationId", "brandOptionId", "flagType");
CREATE UNIQUE INDEX IF NOT EXISTS "NominationBrandFlag_sentinel_uniq"
    ON "NominationBrandFlag"("nominationId", "flagType")
    WHERE "brandOptionId" IS NULL;
CREATE INDEX IF NOT EXISTS "NominationBrandFlag_nominationId_idx"
    ON "NominationBrandFlag"("nominationId");
CREATE INDEX IF NOT EXISTS "NominationBrandFlag_brandOptionId_idx"
    ON "NominationBrandFlag"("brandOptionId");
CREATE INDEX IF NOT EXISTS "NominationBrandFlag_flagType_idx"
    ON "NominationBrandFlag"("flagType");

DO $$ BEGIN
  ALTER TABLE "NominationBrandFlag"
    ADD CONSTRAINT "NominationBrandFlag_nominationId_fkey"
    FOREIGN KEY ("nominationId") REFERENCES "Nomination"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "NominationBrandFlag"
    ADD CONSTRAINT "NominationBrandFlag_brandOptionId_fkey"
    FOREIGN KEY ("brandOptionId") REFERENCES "CampaignBrandOption"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
