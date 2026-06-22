# prod-rel-4.1.39 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Reversible.
**Tag:** `prod-rel-4.1.39` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.38` (v1.17.58).
**Bundles:** v1.17.59 — single one-line follow-up to v1.17.58 item 2.

## TL;DR

**HCP admin list export no longer capped at 5,000 rows.** v1.17.58 fixed the "export only the current page" bug by re-fetching with `limit=5000` — but customers with > 5,000 HCPs hit the hard cap and got a silent truncation. Now paginates through all pages (1,000 per page) and concatenates: first page fetched to learn `pagination.pages`, remaining pages fired in parallel. No 5k ceiling; works for any size customer.

## What changes for customers

Affects any admin who exports `/admin/hcps` on a tenant with > 5,000 HCPs. Before: export downloaded the first 5,000 rows (silently). After: export downloads all rows matching the active filter set. Button still shows "Exporting…" during the fetch — duration scales with row count + concurrent page fetches.

For tenants with ≤ 5,000 HCPs: identical to v1.17.58 behavior. First page completes; no follow-up pages fired.

## API changes

**None.** Uses the existing `/api/v1/hcps` endpoint with the existing `page` and `limit` query params.

## Migrations

**None.** Code-only.

## Risk

**Low.** FE-only change isolated to the export button handler. Pagination loop has bounded total work (capped at `pagination.pages` returned by the API; never spins). Falls back to the visible page on any fetch failure (same fallback as v1.17.58).

The one risk is server load — for a customer with 20,000 HCPs the export fires 20 concurrent `/api/v1/hcps` calls. Each call is the same shape as a normal page-1 load (already running constantly in prod). Should be fine on App Runner's current capacity; if it becomes a problem we'd add a concurrency cap or move to a streaming BE endpoint.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green at 1.17.59 |
| Test env Export full list | will verify post-deploy via `tdct` soak check A1 |

## Rollback

Redeploy `prod-rel-4.1.38` (v1.17.58). HCP list export reverts to the single-fetch 5k cap; customers with > 5k HCPs see truncated CSVs again.

No data destruction.

## Manual soak

1. Pick a tenant with > 5,000 HCPs (or use the test fixture).
2. Go to Admin → HCPs with no filter applied.
3. Note the total count badge.
4. Click Export. Button shows "Exporting…".
5. Open the CSV. **Expected**: row count matches the total badge (no 5k cap).

## See also

- Soak checks: [`prod-rel-4.1.39-soak-checks.md`](prod-rel-4.1.39-soak-checks.md)
- Predecessor: [`prod-rel-4.1.38-handoff.md`](prod-rel-4.1.38-handoff.md)
