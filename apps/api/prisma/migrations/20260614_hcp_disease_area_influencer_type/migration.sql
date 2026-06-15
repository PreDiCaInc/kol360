-- v1.17.42 — data-team-managed influencerType per (HCP, disease area).
-- Replaces the computed determineInfluencerType() output. When set, this
-- column is authoritative; when null, the Insights UI displays the
-- column as empty (no algorithmic fallback).
--
-- Background: pteam will roll classification CSVs per disease area
-- (starting with Sun Pharma Dry Eye). Until a disease area's data is
-- imported, all HCPs in it will display empty influencer-type — known
-- rollout behavior, coordinated with pteam.
--
-- Idempotent (re-runnable) per kol360 prod-psql convention. All
-- ADD COLUMN / CREATE INDEX use IF NOT EXISTS.

ALTER TABLE "HcpDiseaseArea"
  ADD COLUMN IF NOT EXISTS "influencerType" TEXT;

CREATE INDEX IF NOT EXISTS "HcpDiseaseArea_diseaseAreaId_influencerType_idx"
  ON "HcpDiseaseArea" ("diseaseAreaId", "influencerType");
