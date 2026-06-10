# prod-rel-4.1.14 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migration.** Reversible (code-only).
**Tag:** `prod-rel-4.1.14` → commit on `main` (cut after this docs PR merges).
**Supersedes:** `prod-rel-4.1.13` (v1.17.30).
**Bundles:** v1.17.31 — P1 hotfix for the comma-shred filter bug surfaced during 4.1.13 soak + P3 ops hygiene.

## TL;DR

One P1 customer hotfix + one P3 cleanup. No DB migration, no data backfill.

1. **`splitCsv` shredded filter values containing commas (P1).** prod-rel-4.1.13 fixed the MULTI_CHOICE branch correctly, but exposed a latent bug one layer up at the URL-parsing seam: the route-layer parser naïvely split on `,`. After 4.1.13 deployed, **7 of 8 Core Focus values worked** — the one that didn't was **"Dry Eye (including OSD, MGD, and NK)"**, i.e. the customer's exact value. The string was being shredded into `["Dry Eye (including OSD", "MGD", "and NK)"]` and matched nothing in the data, zeroing the dashboard. Same latent bug existed on `respondentRoles`, `stateOfPractices`, `practiceSettings`, plus the HCP-side `specialties` / `states` / `influencerTypes`. Full repro + root cause: [`docs/findings/splitcsv-comma-bug-2026-06-09.md`](../docs/findings/splitcsv-comma-bug-2026-06-09.md).

2. **`scripts/tunnel-up.sh` hardening (P3).** The script (shipped v1.17.29) embedded the prod DB password + bastion IP inline. Pteam stripped it from the 4.1.13 Bio-Exec snapshot during safety scan #4. v1.17.31 env-var-izes both so the script is safe-to-ship across the PreDiCaInc → Bio-Exec mirror without manual stripping going forward. Background: [`docs/findings/tunnel-script-cred-hardening-2026-06-09.md`](../docs/findings/tunnel-script-cred-hardening-2026-06-09.md).

Plus an internal test-fix carried over: the v1.17.30 two-sided filter matrix was over-strict on test-env sparse data — scoped to `coreFocuses` only (the dimension whose bug we fixed) and refactored to iterate every value from `/filter-options` so single-value sampling can't trip on a legitimately empty subset.

## What changes for customers (the visible bit)

| Surface | Before (prod-rel-4.1.13) | After (prod-rel-4.1.14) |
|---|---|---|
| Insights → Demographics → Core Focus → "Dry Eye (including OSD, MGD, and NK)" | 0 respondents (silent bug) | ~288 respondents on Sun Pharma DA |
| Same filter on Sociometric Leaders / Strategic / Benchmarking | 0 (same bug, same surface) | Narrows as expected |
| Multi-select Core Focus (e.g. Dry Eye + Glaucoma) | Multiple-with-comma combinations could shred | Union semantic preserved |
| Other filters (respondentRoles / stateOfPractices / practiceSettings / specialties / states / influencerTypes) | Worked for values without commas; silently broken for any with commas | Latent bug class fully gone |

## Per-PR detail

**PR #157** — two commits on dev:

### v1.17.30.1 (test-only) — `62264b5` — scoped filter matrix
The v1.17.30 two-sided matrix was over-strict on test-env data. Now scopes the `> 0` assertion to `coreFocuses` (the bug we fixed) and iterates every available value; only fails when EVERY value zeros (the bug-class signature). No deploy impact — test file only.

### v1.17.31 — `08a6997` — comma-shred fix + tunnel-up hardening

**Backend** — new `apps/api/src/lib/respondent-filters.ts` with `parseRespondentFilters()`:
- Accepts EITHER `string[]` (Fastify decodes repeated `?k=A&k=B` into an array) OR a single string (back-compat for cached old-client tabs).
- Does NOT comma-split. Single strings wrap as 1-element arrays.
- Numeric range filters (`yearsMin`, etc.) safely extract via `num()` helper.
- Plus 16 synthetic unit tests at `apps/api/src/lib/__tests__/respondent-filters.test.ts` covering the bug class deterministically (no Fastify / DB needed).

Route at `apps/api/src/routes/insights-report.ts` now imports the shared parser; the old inline `splitCsv` is gone.

**Shared Zod schemas** — `packages/shared/src/schemas/insights-report.ts`:
- `insightsFilterSchema` + `leaderRankingQuerySchema` — `specialties` / `states` / `influencerTypes` now `z.union([z.string(), z.array(z.string())])`, transform wraps single string as 1-element array (no comma split).

**Frontend** — serializers updated end-to-end so arrays flow through as arrays:
- `apps/web/src/lib/api.ts` — central param serializer detects arrays, emits one `.append()` per element.
- `apps/web/src/hooks/use-insights-report.ts` — new `appendParam()` helper, applied to all 4 hooks. `useDemographics()` filter param type widened to accept `string[]`.
- `apps/web/src/components/insights/shared/respondent-filters-bar.tsx` — `respondentFiltersToApiParams()` returns arrays (no more `.join(',')`).
- 4 page components (`demographics-tab`, `kol-explorer`, `leader-rankings`, `sociometric-summary`) — `apiFilters` / `apiOptions` builders pass arrays through unmolested.

**`scripts/tunnel-up.sh`** — env-var-ized:
- `BASTION_IP`: from env, or auto-resolved via `aws ec2 describe-instances` (looks up the running bastion EC2 dynamically). New exit code 6 if unable to resolve.
- `PGPASSWORD`: from env (the standard `psql` env var). New exit code 7 with a runbook pointer if unset.
- Grep verification clean: `RDS4Bioexec2025`, `Kol360Prod@2024`, `E2eTest@2024Secure`, and `3.142.171.8` all return empty.

## Migrations

**None.** All code-only.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green |
| API unit tests | **226/226** (was 210; +16 new parser tests) |
| Shared unit tests | **165/165** |
| Test env deploy (api-test) | `api-test.bio-exec.com/health` reports `1.17.31` |
| `?coreFocuses=Dry%20Eye%20(including%20OSD%2C%20MGD%2C%20and%20NK)` | HTTP 200 (no parser shred, no Zod rejection) |
| Repeated params (`?coreFocuses=A&coreFocuses=B`) | HTTP 200 |
| Full E2E API suite (vs api-test) | 195 passed / 7 skipped / 2 failed |
| The 2 failures | Pre-existing intermittent flakes in `nomination-matching.test.ts` (documented race class — `finding_kol_analysis_explain_inSync_flake.md`, P3, predates v1.17.30/31). Different test lines fail across runs; not v1.17.31-introduced. |

## Risk

**Lower than 4.1.13.**

- **Bidirectional back-compat.** Backend accepts either repeated params (new wire shape from v1.17.31 frontend) OR a single string (legacy CSV from any cached old-client tab). Single strings are no longer comma-split, so the bug class is gone in both directions. The single-string path with no commas still works exactly as before for all currently-working categories.
- **No DB migration.** Schema and data untouched.
- **No new endpoint.** Existing routes; only the parser at the seam changed.
- **Frontend cache.** Anyone with an old client tab open continues to work (CSV path). Hard refresh (or React Query's normal cache invalidation) picks up the new repeated-param serializer.

The tunnel-up.sh change has zero runtime impact — App Runner doesn't use it. It's a dev/ops convenience script; the change just makes it safe-to-ship.

## Rollback

Redeploy `prod-rel-4.1.13` (v1.17.30). Effects:
- "Dry Eye (including OSD, MGD, and NK)" filter regresses to 0 respondents. Other 7 Core Focus categories continue to work (because they have no commas in the value).
- `respondentRoles` / `practiceSettings` / `stateOfPractices` / HCP-side `specialties` / `states` / `influencerTypes` regress to comma-shredding behavior for any new comma-containing value.
- `scripts/tunnel-up.sh` returns to the embedded-creds form (but pteam's safety-scan strip already removed it from the deployed snapshot; rollback has no impact on Bio-Exec).

Strictly an improvement over rolling further back; no data state to unwind.

## Customer-facing communication

The customer reported on 2026-06-09; the prod-rel-4.1.13 fix addressed the underlying MULTI_CHOICE branch correctly but the comma-shred bug still produced 0 for their specific value. Per the original ticket's note (Phase C4 of the 4.1.13 soak):

> "I'd suggest pteam holds the customer-loop-back from the 4.1.13 soak doc (Phase C4) until 4.1.14 ships, so we close their ticket in one round rather than two."

Once 4.1.14 lands on prod and the smoke confirms ~288 on Dry Eye, close the loop with the customer.

## See also

- Soak checks: [`prod-rel-4.1.14-soak-checks.md`](prod-rel-4.1.14-soak-checks.md)
- Predecessor: [`prod-rel-4.1.13-handoff.md`](prod-rel-4.1.13-handoff.md)
- P1 ticket: [`docs/findings/splitcsv-comma-bug-2026-06-09.md`](../docs/findings/splitcsv-comma-bug-2026-06-09.md)
- P3 ticket: [`docs/findings/tunnel-script-cred-hardening-2026-06-09.md`](../docs/findings/tunnel-script-cred-hardening-2026-06-09.md)
