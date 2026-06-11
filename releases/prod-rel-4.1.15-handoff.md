# prod-rel-4.1.15 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migration.** Reversible (code-only).
**Tag:** `prod-rel-4.1.15` → commit on `main` (cut after this docs PR merges).
**Supersedes:** `prod-rel-4.1.14` (v1.17.31).
**Bundles:** v1.17.32 — Insights customer asks: column reorder + Biased column + full-list exports w/ NPI.

## TL;DR

Three customer-requested polish items on Insights, bundled in one release. No DB migration, no data backfill.

1. **Sociometric Summary matrix score column order** now matches Leader Rankings + Sociometric Tables tabs (the consistency convention already used everywhere else in Insights):
   - **Pre-4.1.15:** Discussion / Referral / Advice / National / Rising Star / Social
   - **Post-4.1.15:** **Total | National | Discussion | Advice | Rising Star | Referral | Social | Biased**

2. **Biased column added** to the Sociometric Summary matrix. The `biasedLeaders` field was already in the API response (since v1.15 — Biased Leaders nomination type) but never displayed in the matrix. Customers asking "where's biased?" — now visible.

3. **Every Insights "Export to Excel" button** now exports the **full filtered list** (not just the currently-visible page) **and includes an NPI column**. Pre-4.1.15 each export emitted only the page rows (silent truncation depending on pagination state — e.g. a 76-row analysis on a default 25-row page exported only 25). NPI was never in the export.

## What changes for customers (the visible bit)

| Surface | Before (4.1.14) | After (4.1.15) |
|---|---|---|
| Insights → Sociometric Summary → matrix | Total \| Discussion \| Referral \| Advice \| National \| Rising Star \| Social. No Biased column. | **Total \| National \| Discussion \| Advice \| Rising Star \| Referral \| Social \| Biased.** Matches Leader Rankings + Sociometric Tables. |
| Insights → Sociometric Summary → Export | Excel had only the currently-rendered page; no NPI | Excel has the FULL filtered list with NPI column in the new column order |
| Insights → KOL Explorer → Export | Same truncation; no NPI | Full filtered list with NPI |
| Insights → Benchmarking (Leader Rankings) → per-card Export | Same truncation; no NPI | Full filtered list with NPI |
| Insights → Sociometric Tables → per-card Export | Same truncation; no NPI | Full filtered list with NPI |

## Per-PR detail

**PR #159** — one commit on dev: `2d96b65` — `v1.17.32: Sociometric matrix column reorder + Biased + every Insights export now full-list + NPI`.

### Backend

- `apps/api/src/services/insights-report.service.ts`
  - `getSociometricSummary`: added `npi: true` to the Hcp `select`; surfaced as `item.npi` on the response.
  - `getLeaderRankings`: same.
  - `getKolExplorer`: surfaced `row.npi` (Hcp.npi was already selected, just unused in the response).

- `packages/shared/src/schemas/insights-report.ts` — `KolExplorerItem`, `LeaderRankingItem`, `SociometricSummaryItem` Zod schemas all extended with `npi: z.string().nullable().optional()`. **Optional + nullable** so any downstream consumer that doesn't expect the field still validates.

### Frontend

- `apps/web/src/components/insights/tabs/sociometric-summary.tsx`
  - `NOMINATION_COLUMNS` reordered to National → Discussion → Advice → Rising Star → Referral → Social → Biased.
  - `SortField` type + `maxValues` map + row rendering + colspan all updated for the Biased column.
  - `handleExportAll` is now async: refetches `/sociometric-summary` with `limit=5000` and every active filter, then builds the export. Column order in the export matches the visible matrix. NPI column added.

- `apps/web/src/components/insights/tabs/kol-explorer.tsx`
  - `handleExportExcel` async-refetches with `limit=5000`; NPI column added.

- `apps/web/src/components/insights/tables/leader-table.tsx`
  - New optional `getAllItemsForExport?: () => Promise<LeaderTableItem[]>` prop. When supplied, the export awaits it and uses the returned items; legacy behaviour preserved when omitted.
  - `LeaderTableItem` type extended with `npi?: string | null`.
  - NPI column inserted between Rank and the descriptors block; rank renumbered when exporting the full list.

- `apps/web/src/components/insights/tabs/leader-rankings.tsx` + `sociometric-tables-tab.tsx`
  - Both panels implement `getAllItemsForExport` by hitting `/api/v1/insights/.../leader-rankings` with `limit=5000` (carrying every current filter), then mapping into `LeaderTableItem` shape with `npi`.

## Migrations

**None.** All code-only.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green |
| API unit tests | **226/226** (no test additions in this PR; behaviour change is observable end-to-end via the export button) |
| Shared unit tests | **165/165** |
| Test env deploy (api-test) | `api-test.bio-exec.com/health` reports `1.17.32` |
| Sociometric Summary response | `npi` + `biasedLeaders` both present in JSON |
| Leader Rankings response | `npi` present |
| KOL Explorer response | `npi` present (was present pre-fix at SQL level; now surfaced) |
| Full E2E API suite | **197 passed / 7 skipped / 0 failed** — first fully clean run including the previously-flaky `nomination-matching.test.ts` |
| Browser UI smoke (operator-verified) | Sociometric Summary matrix column order correct; export downloads full Sun Pharma list (76 rows, matches DB count for that analysis) with NPI column populated |

## Risk

**Low.**

- **Sociometric matrix UI:** column reorder + new Biased column. Visually different; functionally additive (no data loss, no removed signals). All other Insights tabs unchanged.
- **Backend NPI selects:** two additional `npi: true` lines in Prisma `select`s. Negligible perf impact; the column was already indexed (`@unique`).
- **Schema change:** `npi: string().nullable().optional()` on three item shapes. Purely additive; no breaking change for any downstream consumer.
- **Full-list exports:** new `limit=5000` fetch on export click. Single additional API call per export, only when the button is pressed. No background load.

## Rollback

Redeploy `prod-rel-4.1.14` (v1.17.31). Effects:
- Sociometric matrix reverts to Discussion-first order; Biased column disappears (reintroduces the inconsistency that customers asked us to fix).
- All four Insights export buttons revert to current-page-only behaviour (silent truncation depending on user's pagination state).
- NPI column disappears from all four exports.

No data state to unwind.

## See also

- Soak checks: [`prod-rel-4.1.15-soak-checks.md`](prod-rel-4.1.15-soak-checks.md)
- Predecessor: [`prod-rel-4.1.14-handoff.md`](prod-rel-4.1.14-handoff.md)
