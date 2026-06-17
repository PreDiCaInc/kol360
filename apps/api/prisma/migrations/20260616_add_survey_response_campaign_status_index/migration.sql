-- Idempotent: prod applies migrations via raw psql.
-- Composite index covering the filter pattern shared across
-- insights-report.service.ts:
--   loadAnswersForRespondentFilter (the JOIN target into SurveyResponse)
--   getDemographics dedup query
--   getSummary totalRespondents subquery
--   any analysis-scoped path that gates on completed responses
-- All share:
--   WHERE "campaignId" = ANY(...) AND status = 'COMPLETED'
--
-- EXPLAIN ANALYZE on test DB showed Seq Scan on SurveyResponse for these
-- queries even at 624-row scale. The single-column campaignId index
-- (SurveyResponse_campaignId_idx) helps when there's only one campaign,
-- but the multi-campaign IN-list + status filter drops it for a seq scan.
-- This composite is growth insurance — keeps the plan stable as
-- SurveyResponse grows.

CREATE INDEX IF NOT EXISTS "SurveyResponse_campaignId_status_idx"
  ON "SurveyResponse" ("campaignId", "status");
