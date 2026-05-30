# prod-rel-4.1.9 — Handoff to Prod Team

**Status:** Ready for prod deploy. **Migration required** (one additive index — idempotent). Reversible.
**Tag:** `prod-rel-4.1.9` → commit on `main` (cut after this docs PR merges).
**Supersedes:** `prod-rel-4.1.8` (v1.17.9).
**Bundles:** v1.17.10 + v1.17.11 (insights perf pass A + B — both ship together; v1.17.10 was never separately deployed).

## TL;DR

**Insights dashboard performance pass.** Cuts the heaviest endpoints' latency by pushing aggregation work from app-side JS loops into Postgres `GROUP BY`. **No functional behavior changes; no schema or API contract changes.** Output shape is identical to 4.1.8 (modulo deterministic tie-break ordering on count ties — see Caveats).

Headlines:
- `/demographics`: ~1.45 s → < 250 ms expected (the biggest single endpoint cost)
- `/respondent-analytics`: ~1.10 s → < 250 ms expected
- `/filter-options`: ~0.45 s → < 150 ms (DB-side `DISTINCT` instead of fetch-and-dedupe)
- KOL Explorer / Leader Rankings / Sociometric Summary: ~10–15% off via narrower `select` on HCP fetches + threshold cache
- New composite index on `Nomination` for growth insurance (no measurable today-win)

Origin: this implements [docs/findings/insights-dashboard-performance-pass.md](../docs/findings/insights-dashboard-performance-pass.md) (the prod-team perf review from 2026-05-28). Items #1, #2, #3, #5, #6, #7 implemented; item #4 dropped during review (the spec's premise that three sequential awaits were independent didn't hold — they have data dependencies).

## What's in it

### v1.17.10 (perf pass A — PR #140)

Four cheap wins (~2.75 hr scope):

- **#3 `getFilterOptions`** — two parallel `$queryRaw` `DISTINCT` queries replace fetch-all-then-dedupe-in-JS. State whitelist (US 50 + DC) stays app-side because a 51-element SQL `IN (...)` would be ugly.
- **#5 Composite index** on `Nomination(responseId, matchStatus, matchedHcpId)`. **Migration: idempotent** (`CREATE INDEX IF NOT EXISTS`). At current scale (~12k nominations) the existing single-column index handles most queries; this is growth insurance — keeps p99 flat past ~100k.
- **#6 Narrow Hcp `findMany`** in 3 sites (Explorer / Rankings / Sociometric). Old code did `include` without `select` on the outer Hcp, fetching ~20 columns when 6–7 were used. ~65% payload reduction per row.
- **#7 Module-level cache** for `InfluencerThreshold` (60s TTL). The cross-request win: a dashboard load fires 3–4 parallel API calls each doing their own threshold lookup — now 1 lookup per 60s window. The operational `UPDATE` tuning flow tolerates 60s lag (per the 4.1.7 handoff).

### v1.17.11 (perf pass B — PR #141)

The two heavy SQL-aggregation refactors (~7–10 hr scope):

- **#2 `getRespondentAnalytics`** — replaces full-table fetches of `CampaignHcp` + `SurveyResponse` with 11 small parallel `GROUP BY` queries. Output identical modulo tie-order.
- **#1 `getDemographics`** — replaces the ~23k-row `SurveyResponseAnswer` load + 9-branch JS loop with 13 parallel SQL aggregations (one per dimension): `COALESCE` extraction for single-choice/text, `UNION ALL` of `jsonb_array_elements_text` for MULTI_CHOICE, `CROSS JOIN LATERAL jsonb_array_elements` for the RANK_ORDER educational-resources dimension, `DISTINCT ON` for per-respondent vote-collapsing on decile + cross-tab dimensions. Respondent filter (v1.17.5 `RespondentFilters`) preserved — the existing pipeline runs once and the result-id set is spliced into each dimension query.

## Migrations

**One migration, idempotent:** `20260529_add_nomination_filter_index` (from v1.17.10).

```sql
CREATE INDEX IF NOT EXISTS "Nomination_filter_idx"
  ON "Nomination" ("responseId", "matchStatus", "matchedHcpId");
```

v1.17.11 ships no migration.

**Apply order:** index migration before code deploy is fine but not strictly required — both versions of the code use whatever indexes are available; the new index just makes the existing queries faster. Safe to re-run.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green |
| API unit tests | 210/210 |
| Migration applied to test DB | ✅ `Nomination_filter_idx` present |
| E2E suite (test env, v1.17.11) | **193/193 passing** |
| New contract tests (2): structural invariants for `/respondent-analytics` + `/demographics` | green |
| Curl-diff against deployed v1.17.10 (pre-PR-B) | matched modulo tie-order + small multi-campaign-respondent edge |
| Deploy status | API + web both at v1.17.11 |

## Caveats (and what to watch in soak)

These are documented behavioral nuances, not bugs:

1. **Tie-break order on categorical distributions is now deterministic** (`ORDER BY count DESC, name ASC`) instead of Prisma's non-deterministic physical-row order. UI charts label by name; no semantic dependence on tie ordering, but eyeballing two consecutive prod calls may show different ordering of ties than 4.1.8 did.
2. **Multi-campaign respondents** (a HCP assigned to 2+ campaigns of the same DA with different `marketDecile` or different last-answer values) — the old impl's `Map.set(hcpId, val)` "last write wins" depended on Prisma row order. The new impl is deterministic but picks a different "last". `byDecile` counts shifted by ~5% across a handful of respondents in the test-env diff; functionally equivalent, semantically explicit. Worth verifying that customer-facing chart values don't move enough to confuse a soak-checker.
3. **Threshold cache (60s)** — admin retunes via `UPDATE InfluencerThreshold` now propagate within 60s instead of immediately. Already documented in the 4.1.7 handoff; just reiterating.

## Soak checks

[`prod-rel-4.1.9-soak-checks.md`](prod-rel-4.1.9-soak-checks.md) — 3-phase checklist. Recommend **1-day soak** with attention on Insights tab tile/chart numerics.

## Rollback

Pure code rollback redeploy v1.17.9. The new index is harmless if left in place. If you want a fully clean revert:

```sql
DROP INDEX IF EXISTS "Nomination_filter_idx";
```

## What's next on our side

- **Perf pass C** (if/when warranted) — no spec yet. The current pass closed all 6 items the prod-team perf review called out as actionable. The bonus item (frontend `useClients()` serialization at the dashboard mount) is still a backlog flag.
- **Per-client `Client.region` setting** — replaces hardcoded US state whitelist (v1.17.4). Tracked separately; doesn't block anything.
- **Phase 3 of the email-domain feature** — adoption audit script. Local helper, no deploy.
