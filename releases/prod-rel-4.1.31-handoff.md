# prod-rel-4.1.31 — Handoff to Prod Team

**Status:** Ready for prod deploy. **One idempotent migration.** Reversible.
**Tag:** `prod-rel-4.1.31` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.30` (v1.17.50).
**Bundles:** v1.17.51 — perf-pass-C: shared respondent-filter SQL rewrite + composite index on `SurveyResponse(campaignId, status)`.

## TL;DR

Pteam ticket [`docs/findings/insights-perf-query-optimization-2026-06-16.md`](../docs/findings/insights-perf-query-optimization-2026-06-16.md) flagged 2-9s latency on Insights endpoints under filter activity, traced via EXPLAIN ANALYZE on test DB to:
1. **Payload + JS aggregation, not SQL execution.** The shared respondent-filter pipeline loaded ALL `SurveyResponseAnswer` rows for the analysis's campaigns (multi-MB on prod), then ran 7 sequential JS filter passes over the in-memory array.
2. **Seq scans on `SurveyResponse`** for the multi-campaign + status filter shape (no composite index covering the IN-list).

This release ships:
- **Rewrite #1** — collapse `loadAnswersForRespondentFilter` → `computeFilteredResponseIds` (the old 2-step chain) into one `$queryRaw` returning just the matching responseId set. Each active filter becomes one EXISTS clause; inactive filters are spliced out at zero runtime cost. Estimated **2-5× faster** on the filter-active path (getLeaderRankings, getSociometricSummary, getDemographics).
- **#3** — idempotent composite index `SurveyResponse_campaignId_status_idx` on `(campaignId, status)`. EXPLAIN-verified to replace the seq scan in every analysis-scoped query that gates on `campaignId IN (...) AND status='COMPLETED'`.

Original #2 (push KolExplorer / SocoSummary sort+page into SQL) was **dropped after EXPLAIN profiling** — the analysis HCP set is bounded (368 max in test, <1500 in prod). The "round-trip count + payload size" issue is in #1, not in those endpoints. See assessment notes in PR description.

## What changes for customers

| Surface | Before (4.1.30) | After (4.1.31) |
|---|---|---|
| Insights tabs (Sociometric Summary, Leader Rankings / Benchmarking, Demographics) under **active respondent filters** | API method loads ALL SurveyResponseAnswer rows in scope (multi-MB on prod), JSON-deserializes them, then runs 7 sequential JS filter passes. Two round-trips, large payload. | Single `$queryRaw` issues 1 SQL query with EXISTS clauses for each active filter dimension; returns just the matching responseId set (small CUID array). No JS filter loop. |
| Same tabs under **NO respondent filters** | Unchanged — fast path bypasses the filter helper entirely. | Unchanged. |
| Postgres plan for `SurveyResponse WHERE campaignId IN (...) AND status='COMPLETED'` | Two single-column index hits (`SurveyResponse_campaignId_idx` and `SurveyResponse_status_idx`) combined via BitmapAnd, then sequential scan filtering. | New composite index `SurveyResponse_campaignId_status_idx` covers both predicates in one bitmap scan. Helps the dedup query in getDemographics, the totalRespondents subquery in getSummary, and the new respondent-filter `$queryRaw`. |
| Semantics | Filter result IDs computed in JS. | Filter result IDs computed in SQL. Mathematically equivalent on every filter dimension — verified by smoke test on test DB (categorical + multi-choice + numeric range filters all match the JS algorithm row-for-row). |

## API changes

**None.** Same response shapes. The aggregation SOURCE is unchanged; the FILTERING moves from JS to SQL.

## Migrations

**One idempotent migration:** [`20260616_add_survey_response_campaign_status_index/migration.sql`](../apps/api/prisma/migrations/20260616_add_survey_response_campaign_status_index/migration.sql)

```sql
CREATE INDEX IF NOT EXISTS "SurveyResponse_campaignId_status_idx"
  ON "SurveyResponse" ("campaignId", "status");
```

- Idempotent (`CREATE INDEX IF NOT EXISTS` — safe to re-run via raw `psql` per the project SOP).
- No backfill, no data change.
- Schema update in `schema.prisma` adds `@@index([campaignId, status])` so Prisma stays in sync.
- **CRITICAL**: this migration MUST be applied to the prod DB before or during the code deploy. Pre-deploy is safest (the new code path WILL run faster with the index but is correct without it). App Runner does NOT auto-run migrations — see the runbook command in soak doc Phase A1.

## Risk

**Low-medium.** The SQL helper is mathematically equivalent to the old JS algorithm, but a subtle drift in any of the 7 EXISTS clauses (question-text LIKE, MULTI_CHOICE jsonb_array_elements branch, SINGLE_CHOICE COALESCE branch, numeric REGEXP/cast guard) could silently produce wrong counts.

Mitigations:
- Test-DB smoke test (Optometry alone: 36 matches → Optometry + Dry Eye + 10-30yrs: 20 matches — matches manual count).
- Existing v1.17.30 structural-narrowing matrix (coreFocuses iterated across demographics + leader-rankings + sociometric) catches the silent-zero regression on MULTI_CHOICE — the most complex branch.
- "filtered ≤ baseline" smoke tests across all three endpoints catch any silent-widen regression.

The composite index is a strict additive change. Index plan changes are reverted by dropping the index (one line of SQL).

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green at 1.17.51 |
| Migration applied to test DB | ✓ via `psql -v ON_ERROR_STOP=1 -f migration.sql`; idempotent re-run verified (no error, NOTICE skipping) |
| Schema.prisma index recorded | ✓ |
| Test DB SQL smoke (richest analysis: 2 campaigns, 2,158 answers, 83 completed responses) | base query 21ms (was 21ms — plan stable), respondent-filter 1-filter 85ms, 3-filter combined 96ms — sub-100ms across the board |
| Behavioral E2E | will run post-deploy via `tdct`. Existing structural-narrowing matrix exercises the rewritten code path. |

## Rollback

Two rollback options:

**Option A — code-only (preserves index)**: redeploy `prod-rel-4.1.30` (v1.17.50). The composite index stays (harmless additive change); the API reverts to JS-side filtering.

**Option B — full rollback**: redeploy `prod-rel-4.1.30` THEN drop the index:
```sql
DROP INDEX IF EXISTS "SurveyResponse_campaignId_status_idx";
```

No data destruction either way.

## Manual soak

Two specific things to look for during soak (in addition to the standard Insights tab smoke):

1. **Filter result counts match v1.17.50 for the same filter set.** Pick a customer dashboard (Sun Pharma → Dry Eye), set respondent filters (e.g. Optometry + Private Practice + Dry Eye Core Focus), capture the totalRespondents / total KOL counts on Demographics + Sociometric tabs. They MUST match what the same filter set produced pre-deploy. A drift here is the silent-semantic-bug class.

2. **Filter response latency.** With the index + new SQL helper, the Sociometric Summary / Demographics tabs SHOULD feel snappier under active filters. Not a hard pass/fail (depends on prod data shape), but a noticeable improvement is the expected outcome.

## See also

- Soak checks: [`prod-rel-4.1.31-soak-checks.md`](prod-rel-4.1.31-soak-checks.md)
- Predecessor: [`prod-rel-4.1.30-handoff.md`](prod-rel-4.1.30-handoff.md)
- Source ticket: [`docs/findings/insights-perf-query-optimization-2026-06-16.md`](../docs/findings/insights-perf-query-optimization-2026-06-16.md)
- Assessment notes (logged in PR description): rewrite #2 deferred after EXPLAIN profiling showed marginal gain at current data scale.
