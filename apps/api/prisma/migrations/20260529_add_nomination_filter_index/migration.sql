-- Idempotent: prod applies migrations via raw psql.
-- Composite index covering the filter pattern in
-- insights-report.service.ts:computeRespondentFilteredCounts and
-- getKolProfile's nominator lookup:
--   WHERE responseId IN (...) AND matchStatus IN (...) AND matchedHcpId = ...
--
-- Current scale (~12k nominations / ~1.3k responses ≈ 10 noms/response)
-- already gets most of the benefit from the existing single-column
-- responseId index. This composite is growth insurance — keeps p99
-- flat as Nomination grows past ~100k rows.

CREATE INDEX IF NOT EXISTS "Nomination_filter_idx"
  ON "Nomination" ("responseId", "matchStatus", "matchedHcpId");
