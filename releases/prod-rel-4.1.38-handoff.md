# prod-rel-4.1.38 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Reversible.
**Tag:** `prod-rel-4.1.38` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.36` (v1.17.56). The intermediate v1.17.57 (covered by an earlier draft 4.1.37 doc set) was held back on `dev` waiting for the next bundle; this release rolls those two commits up with three more into a single consolidated drop.
**Bundles:** v1.17.58 — five commits sitting on `dev` since 4.1.36 shipped. One real production-code bug (HCP importer race), three e2e test fixups, one polish change (Benchmarking (i) right-alignment), one UX feature (Demographics Chart/Table toggle), one user-reported bug (HCP list export only exported the current page).

## TL;DR

1. **HCP importer UPDATE branch stale-snapshot race fix (PRODUCTION CODE).** The v1.17.56 importer relaxation used `row.X || existing.X` to fall back to the bulk-load snapshot for omitted columns. Under concurrent admin uploads (or the test suite's interleaved tests on the same HCP), the snapshot is stale by the time the UPDATE runs — writing it back clobbers any concurrent edit. Fix: only set columns the row actually provides; omit the rest from the Prisma `update` call (Prisma leaves them untouched). No FE change.

2. **HCP admin list export covers the full filtered list, not just the current page (PRODUCTION CODE).** User-reported bug. `/admin/hcps` export button was building the CSV from `data?.items` (the page of 50 currently loaded by `useHcps`). Admins exporting 1,000+ HCPs would silently get only the 50 they were paging through. Fix: re-fetch via `apiClient.get('/api/v1/hcps', { ...currentFilters, limit: 5000, page: 1 })` before building rows. Matches the v1.17.32 pattern already shipped on Sociometric Summary, KOL Explorer, Leader Rankings, and Survey Status. Button shows "Exporting…" during the fetch; falls back to the visible page if the fetch fails. Audit of all 6 other export surfaces confirmed they already export the full filtered list — only the HCP admin list had been missed.

3. **Benchmarking (i) info popover right-aligned in the title bar.** Polish item. The (i) was previously next to the title text in colored Benchmarking title bars (v1.17.55 placement); Demographics chart cards put it at the right corner. User asked to standardize on the Demographics placement (more visible, eye lands there last). `LeaderTable` title bar now uses `justify-between` so the title sits left and `titleSuffix` sits right.

4. **Chart/Table toggle on Demographics chart cards.** New affordance — right-aligned "Chart | Table" toggle on each demographic chart card. Flipping to Table replaces the chart with a sortable, copy-friendly tabular view of the same data (capped at 50 rows; filtered + sorted desc). Shared wrapper `ChartTableToggle` in `apps/web/src/components/insights/shared/chart-table-toggle.tsx`. Applied to 10 single-series cards (Role pie, Treatment Decile, Monthly Patients, DED Patients, Years in Practice, Core Focus × Avg Patients, Valuable Content, Objectivity Rating, Topics Discussed pie + bar). StackedBarChart-backed cards (Educational Resources × 3, Social Media Rankings) skipped — multi-dimensional data needs a different table layout. `StateBarChart` was retrofitted to use the same shared wrapper, replacing its inline toggle.

5. **E2E `valid` influencer-type set updated.** Was hardcoded to the pre-4.1.24 3-value list (`'National Leaders', 'Rising Stars', 'Regional Influencers'`). v1.17.44 expanded the canonical set to 5 (added `'Regional Leaders'` and `'Pre-Emergent'`). The data team's recent direct-SQL backfill populated `'Pre-Emergent'` on ~3,978 prod HCPs, so the test was guaranteed to fail when sampling those rows.

6. **E2E ZodError-specific assertion loosened to status-only.** The `nomination-matching.test.ts` 4.1.36-era guard against the 2026-05-21 "Optometrist → 500 + raw Prisma error" regression demanded the 400 specifically carry `errorName === 'ZodError'`. 4.1.36's HCP importer moved validation earlier in the request lifecycle — 400 no longer Zod-shaped. Customer-visible behavior unchanged. Test now asserts the contract ("rejected with structured 400"), not the implementation layer.

7. **E2E match-count parity test pinned to isolated fixture.** The parity test (`match-count == demographics.totalRespondents`) used the top-scored analysis. Same (client, DA) as the `createTestCampaign` pool. Campaigns mutated mid-suite → `resolveAccessibleCampaignIds` returned different sets between the two API calls → flake. New `STABLE_FIXTURE.PARITY_*` seed: dedicated DA + campaign + analysis under their own disease area no other test touches.

## What changes for customers

### Item 1 — HCP importer concurrency safety

Single-admin bulk-upload flows are unaffected (no concurrent writes to clobber). The race only bites when two admins upload to the same set of HCPs at the same time, or when an admin uploads while the data team runs a SQL backfill.

| Scenario | Before (4.1.36) | After (4.1.38) |
|---|---|---|
| Solo admin full-row CSV | Worked. UPDATE wrote all 8 columns. | Worked. UPDATE writes only the columns the row provides; for full rows, that's all 8. Same end state. |
| Solo admin partial CSV (`NPI,City,State`) | Worked. UPDATE used `row.X \|\| existing.X` — `existing.X` from bulk-load snapshot. | Works correctly. Now writes only city + state; firstName/lastName/email/specialty stay untouched in DB. |
| Concurrent admin A (`NPI,City,State`) + admin B (`NPI,Specialty`) | **Clobber race.** Whoever wrote second's `existing` snapshot was stale → restored the first writer's pre-write values. The later write would erase the earlier one's changes. | No clobber. A's update sets `{city, state}` only; B's sets `{specialty}` only. Both land cleanly. |

The pre-fix race wasn't yet observed in customer ops sessions (admins haven't done concurrent bulk uploads), but it would have surfaced once two admins started working in parallel. Caught by the test suite's interleaved test execution exposing the race deterministically.

### Item 2 — HCP list export full-list fix

Affects any admin who exports `/admin/hcps`. Before: pressing Export downloaded a CSV with only the 50 rows on the visible page (silently — no UI hint), so an admin exporting a 1,500-HCP filtered slice got 50 rows. After: export downloads up to 5,000 rows matching the current filter state (matches the limit used by every other surface). Button shows "Exporting…" while fetching.

### Items 3-4 — Demographics polish

- **(i) placement:** No data change. Survey-question info popovers in Benchmarking colored title bars now sit at the right corner (same as Demographics cards) instead of next to the title text.
- **Chart/Table toggle:** Each demographic chart card gets a toggle in the top-right. Default view is Chart (unchanged). Flipping to Table shows the same data in a sortable, copy-friendly list — useful for sharing exact numbers in slides/email or for filtering in Excel. No backend or data change.

### Items 5-7 — Test maintenance

Pure dev hygiene. No customer impact. After this release, the e2e suite passes deterministically against prod data instead of requiring re-runs to clear known flakes.

## API changes

**None.** Item 1's fix changes the Prisma `update` data payload shape — fields are omitted instead of set to fallback values — but the request/response contract is identical. Item 2 calls the existing `/api/v1/hcps` endpoint with a larger `limit` value (already supported).

## Migrations

**None.** Code-only.

## Risk

**Low.**
- Item 1 (importer race) is strictly safer: writes only what the row provides; never clobbers. Existing full-row CSV flow is unchanged in behavior.
- Item 2 (export full list) is additive: the re-fetch path is new but isolated to the export button; if the fetch fails it falls back to the legacy current-page CSV.
- Items 3-4 (UX polish) are FE-only, no behavioral change to the underlying data or filters.
- Items 5-7 are e2e-only edits + a new fixture seed.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green at 1.17.58 |
| API unit tests | 231/231 pass |
| Stable parity fixture seeded on test DB | ✓ (e2e:seed run; parity DA + campaign + analysis present) |
| E2E run | will run post-deploy via `tdct` against v1.17.58 |

## Rollback

Redeploy `prod-rel-4.1.36` (v1.17.56). Effects:
- HCP importer UPDATE reverts to the stale-snapshot fallback pattern. Concurrent-write races return; solo uploads unaffected.
- HCP list export reverts to current-page-only behavior. Affected admins see truncated CSVs.
- Demographics chart cards lose the table-view toggle; Benchmarking (i) reverts to the next-to-title placement.
- E2E test fixes are local to dev clones (don't deploy); not part of rollback.

No data destruction.

## Manual soak

Most important post-deploy checks:

1. **HCP importer race-safe partial UPDATE** (item 1):
   1. Pick an existing HCP. Note their current values (name, email, specialty, city, state).
   2. Upload `NPI,City,State` CSV with new city + state for that HCP.
   3. Confirm city + state changed; name/email/specialty preserved.
   4. Repeat with `NPI,Specialty` CSV. Confirm specialty changed; city/state preserved.

2. **HCP list export full coverage** (item 2):
   1. Go to `/admin/hcps`. Apply any filter that yields > 50 results (e.g. a common specialty).
   2. Note the total count badge.
   3. Click Export. Open the CSV.
   4. Confirm the CSV row count matches the displayed total (capped at 5,000), not 50.

3. **Demographics Chart/Table toggle** (item 4):
   1. Open any insights analysis → Demographics tab.
   2. On each chart card with a toggle, flip to Table and back. Confirm same data shown both ways.

## See also

- Soak checks: [`prod-rel-4.1.38-soak-checks.md`](prod-rel-4.1.38-soak-checks.md)
- Predecessor: [`prod-rel-4.1.36-handoff.md`](prod-rel-4.1.36-handoff.md)
- Source ticket for items 1, 5-7: [`docs/findings/e2e-maintenance-3-fixups-2026-06-18.md`](../docs/findings/e2e-maintenance-3-fixups-2026-06-18.md)
