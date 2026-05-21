-- Phase 3 PR B (v1.17.0) — campaign-scoring schema teardown.
--
-- This is the IRREVERSIBLE half of Phase 3. PR A (v1.16.0) deleted the code
-- that wrote these columns (calculateSurveyScores, calculateCompositeScores,
-- publishScores, recalculateDiseaseAreaComposites + CompositeScoreConfig
-- editor); this migration drops the table and the 4 vestigial computed
-- columns on the two score tables. The 8 objective columns on
-- HcpDiseaseAreaScore (scorePublications, scoreClinicalTrials, etc.) are
-- preserved — they're the canonical objective-score store still actively
-- populated by segment CSV import and live-pulled by the KOL Analysis
-- composite at recalc time.
--
-- Code-side already repointed:
-- - lite-client.service.ts: composite + survey from HcpAnalysisScore; objective
--   from HcpDiseaseAreaScore (live-pull).
-- - dashboard.service.ts (getSegmentScores): weights from KolAnalysis.weightsJson;
--   survey segment from HcpAnalysisScore.scoreSurvey for the campaign's HCPs.
-- - hcp.service.ts: HCP detail include block stops selecting the dropped columns.
-- - campaign.service.ts: stops including/deleting CompositeScoreConfig rows.
--
-- Idempotent per convention. All DROPs use `IF EXISTS`. The CASCADE on
-- DROP TABLE handles the inverse relation cleanup if any FK rows remain
-- (none should — we removed the writer in PR A and the table has been
-- read-only since).

-- 1. Drop the per-campaign weights table.
DROP TABLE IF EXISTS "CompositeScoreConfig" CASCADE;

-- 2. Drop the 2 vestigial computed columns from HcpCampaignScore.
--    Per-type counts + nominationCount stay as ops/QA input.
ALTER TABLE "HcpCampaignScore" DROP COLUMN IF EXISTS "scoreSurvey";
ALTER TABLE "HcpCampaignScore" DROP COLUMN IF EXISTS "compositeScore";

-- 3. Drop the 2 vestigial computed columns from HcpDiseaseAreaScore.
--    The 8 objective columns (scorePublications, scoreClinicalTrials,
--    scoreTradePubs, scoreOrgLeadership, scoreOrgAwards, scoreConference,
--    scoreSocialMedia, scoreMediaPodcasts) + totalNominationCount + the
--    SCD bookkeeping stay — segment import writes them, analysis composite
--    live-pulls them.
ALTER TABLE "HcpDiseaseAreaScore" DROP COLUMN IF EXISTS "scoreSurvey";
ALTER TABLE "HcpDiseaseAreaScore" DROP COLUMN IF EXISTS "compositeScore";
