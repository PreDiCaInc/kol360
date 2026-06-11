# prod-rel-4.1.16 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migration.** Reversible (code-only).
**Tag:** `prod-rel-4.1.16` → commit on `main` (cut after this PR merges).
**Supersedes:** `prod-rel-4.1.15` (v1.17.32).
**Bundles:** v1.17.33 — Sociometric Summary KOL-side filter fix + e2e structural-check expansion.

## TL;DR

P1 customer fix: on Insights → Sociometric Summary, picking any value in the **KOL State**, **Specialty**, or **Influencer Type** filter has been silently ignored — the result was identical to no-filter. Single-method fix in the service + a new e2e matrix that catches this exact bug class going forward.

Background + repro: [`docs/findings/sociometric-state-filter-broken-2026-06-11.md`](../docs/findings/sociometric-state-filter-broken-2026-06-11.md).

## What changes for customers (the visible bit)

| Surface | Before (4.1.15) | After (4.1.16) |
|---|---|---|
| Insights → Sociometric Summary → Filter button → KOL State | "CA" returned all 2337 KOLs (5/50 visible page were CA, rest weren't) — filter ignored | Returns only KOLs whose `state=CA` — same behavior as KOL Explorer + Leader Rankings |
| Sociometric Summary → Filter → Specialty | "Optometry" returned all 2337 KOLs mixed | Returns only Optometry KOLs |
| Sociometric Summary → Filter → Influencer Type | "National Leaders" returned all 2337 KOLs (top item was a Rising Stars) | Returns only KOLs classified as National Leaders |
| Multi-value (e.g. `states=CA&states=NY`) | Ignored | Union semantic — CA ∪ NY |
| Legacy singular (`state=CA`) | Worked (was already the only working path) | Continues to work |

Sibling endpoints (KOL Explorer, Leader Rankings, Demographics) unchanged — they already handled the plural shape correctly. The bug was isolated to Sociometric Summary.

## Per-PR detail

Single PR: **v1.17.33 — fix Sociometric Summary KOL-side filter destructure + structural-check e2e**. One service-side change, one e2e file added, one e2e file extended.

### Backend

[`apps/api/src/services/insights-report.service.ts`](../apps/api/src/services/insights-report.service.ts) — `getSociometricSummary` method:

1. **Destructure expanded.** Pre-fix only `specialty` / `state` were pulled from filters. v1.17.33 also reads `specialties`, `states`, `influencerType`, `influencerTypes`.

2. **Dual-shape where-clause** — mirrors the working pattern in `getLeaderRankings:784-790` verbatim:
   ```ts
   const hcpWhere: Record<string, unknown> = { id: { in: baseHcpIds } };
   if (specialties?.length) hcpWhere.specialty = { in: specialties };
   else if (specialty)      hcpWhere.specialty = specialty;
   if (states?.length)      hcpWhere.state = { in: states };
   else if (state)          hcpWhere.state = state;
   ```

3. **InfluencerType post-filter.** The classification (`National Leaders` / `Rising Stars` / `Regional Influencers`) is computed at item-build time from `compositeScore` + `scoreSurvey` + thresholds. The new filter is a post-fetch `continue` after the classification call:
   ```ts
   if (influencerTypeFilter && !influencerTypeFilter.includes(influencerTypeVal)) continue;
   ```
   Same shape as `getKolExplorer:649-658`.

No other backend file touched. The Zod schema, the route handler, the frontend — all already correct. The drop happened only inside this one service method.

### E2E

**New file:** [`e2e/api/insights-kol-side-filters.test.ts`](../e2e/api/insights-kol-side-filters.test.ts).

The matrix iterates `(endpoint × dim)` for `endpoint ∈ {kol-explorer, sociometric-summary}` and `dim ∈ {states, specialties, influencerTypes}`. Two assertions per cell:

- **(a) Monotonicity:** `filtered.total <= baseline.total` (cheap; the existing pattern).
- **(b) Structural:** for every returned item, `item[singularField] === requested_value` (load-bearing; this is what would have caught the bug). Falls through to a "silent-drop sentinel" (every probed value returns baseline → fail loudly) when no strict-narrow witness exists in the test env's data.

**Confirmed bug-catching.** Run pre-fix against api-test (v1.17.32): all 3 sociometric tests fail with structural mismatches (e.g. `"Rising Stars" is not "National Leaders"`). KOL Explorer tests pass — that endpoint was always correct. After v1.17.33 lands, all 6 should pass.

**Existing file extended:** [`e2e/api/insights-respondent-filters.test.ts`](../e2e/api/insights-respondent-filters.test.ts) — the v1.17.30 respondent matrix now has the same silent-drop sentinel (`every probed value returns baseline → fail`), so a future silent-drop on respondent filters fails loudly here too.

### Frontend

**None.** The frontend already sends the plural shape correctly (since v1.17.31). The Zod schema accepts it. Only the service destructure was the gap.

### `e2e/api-client.ts`

Extended `getInsightsKolExplorer` + `getInsightsSociometricSummary` method signatures to accept plural `states` / `specialties` / `influencerTypes` (each as `string | string[]`). Arrays serialize as repeated query params per the v1.17.31 wire convention. Singular params still accepted for back-compat tests.

## Migrations

**None.** All code-only.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green |
| API unit tests | **226/226** |
| Shared unit tests | **165/165** |
| New e2e `insights-kol-side-filters.test.ts` against api-test (pre-fix v1.17.32) | KOL Explorer 3/3 ✓, Sociometric Summary 0/3 ✗ — **proves the bug exists + test catches it** |
| Existing e2e `insights-respondent-filters.test.ts` | **7/7** still green after the silent-drop sentinel addition |
| Full E2E API suite (post-v1.17.33 deploy) | Will report in soak-checks after deploy lands |
| `?states=CA` on /sociometric-summary (post-deploy) | Should match `?state=CA` count (~244 on Sun Pharma DA on test) |
| `?influencerTypes=National%20Leaders` on /sociometric-summary | Should narrow significantly |

## Risk

**Very low.**

- Pattern proven elsewhere — `getLeaderRankings` has the exact same dual-shape handler since v1.17.4 and has been working in prod throughout.
- Single-method change; no breakage surface outside `getSociometricSummary`.
- Schema unchanged (it already accepted the plural shape).
- Frontend unchanged (it already sent the plural shape).
- No DB / migration / data backfill.

## Rollback

Redeploy `prod-rel-4.1.15` (v1.17.32). Effect: Sociometric Summary KOL-side filters revert to silently ignoring (the current customer-reported state). Customer's repro path stays broken; the rest of Insights remains unaffected.

No data state to unwind.

## See also

- Soak checks: [`prod-rel-4.1.16-soak-checks.md`](prod-rel-4.1.16-soak-checks.md)
- Predecessor: [`prod-rel-4.1.15-handoff.md`](prod-rel-4.1.15-handoff.md)
- Bug ticket: [`docs/findings/sociometric-state-filter-broken-2026-06-11.md`](../docs/findings/sociometric-state-filter-broken-2026-06-11.md)
