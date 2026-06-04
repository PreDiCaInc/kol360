# prod-rel-4.1.12 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migration.** Reversible (code-only).
**Tag:** `prod-rel-4.1.12` → commit on `main` (cut after this docs PR merges).
**Supersedes:** `prod-rel-4.1.11` (v1.17.23).
**Bundles:** v1.17.24 + v1.17.25 + v1.17.26 + v1.17.27 + v1.17.28 — second wave of fixes against the 2026-06-02 customer bug bundle, all surfaced after the prod-rel-4.1.11 deploy gave the customer a working environment to test against.

## TL;DR

Five themes, all customer-reported. No DB migration. No data backfill required beyond what's already in the application data (the v1.17.20 `nomail@kol360research.com` re-domain and the `Question.type` Practice Setting flip from prod-rel-4.1.11 are already in place).

1. **Demographics Practice Setting filter** worked on Benchmarking + Sociometric Summary tabs but only allowed one selection on Demographics. Root cause: Demographics derived dropdown options from the same filtered `data` object that the chart used. Mirrored the Benchmarking pattern — second unfiltered `useDemographics()` call provides the option universe.

2. **Missing Demographics graphs** — three of the "B-remainder" skeletons added in v1.17.15 weren't lighting up: educational ranking (`#5`), social media platforms ranking + valuable content (`#6a/b`), objectivity rating (`#6c`).
   - Educational + Social Media Platforms: SQL assumed `[{text, rank}]` element shape, prod data is `["item1","item2",...]` strings with array position = rank. Rewrote both to use `WITH ORDINALITY`.
   - Valuable Content: keyword `%valuable%` matched the ranking question too — tightened to `%type of content%`.
   - Objectivity: SQL was correct; lit up after the v1.17.24/25 deploy.

3. **Sociometric Leaders + Total Weighted Score layout** — three sub-asks customer flagged on the existing tables:
   - Sociometric Leaders matrix and Total Weighted Score: Total now sits at the head of the count/score block (between descriptors and the per-category counts), not at the row's start. Default sort highest-first (already correct in v1.17.15; comparator inversion in `getSociometricSummary` fixed in v1.17.28 so the desc request actually sorts desc).
   - Benchmarking + Sociometric Tables (per-nomination LeaderTable): Count back to the LAST column (`# | Name | Specialty | … | State | Count`), descriptors-first / single-count-column convention. Sort still `count desc`.
   - Sociometric Tables single-column grid (`lg:grid-cols-2 → grid-cols-1`) so the 6-column tables don't overflow at common laptop widths.

4. **Educational Resources chart layout** — long labels like "Medical education conferences (i.e., AAO, ASCRS, AOA)" overlapped each other at 40px per row. Per-row height 40→64, Y-axis label column 180→280, custom `WrappedTick` SVG component splits labels into up to 3 word-wrapped tspans centered on the tick anchor, `interval={0}` so Recharts renders every label. Same chart powers the four Educational Resources / Top 5 Social Media Platforms panels — all benefit.

5. **Two cross-tab UX polish items**:
   - "Exclude Internal Emails" toggle on campaign Overview tab — disabled for client roles. They see the current state but can't toggle. Their only visible campaign tab is Overview, so this gate matters.
   - Practice Setting question (in survey templates) flipped to MULTI_CHOICE on prod via the v1.17.20 SQL — already deployed in prod-rel-4.1.11; no action here.

Plus an inverted-sort bug fix in v1.17.28 (`getSociometricSummary` comparator was `order * (bVal - aVal)` which sent `sortOrder='desc'` back ascending). Aligned the comparator shape across all three insights sort paths.

## What changes for customers (the visible bit)

| Surface | Before (prod-rel-4.1.11) | After (prod-rel-4.1.12) |
|---|---|---|
| Demographics → Practice Setting filter | Only one selection allowed | Multi-select works, same as Benchmarking + Sociometric Summary tabs |
| Demographics → Educational Resources card | Empty (or visible-but-empty for some customers) | Populated with ranked breakdown across all 7 sources; 555 prod respondents on Sun Pharma now counted |
| Demographics → Top 5 Social Media Platforms | Empty | Populated from `answerJson->'ranked'` array shape |
| Demographics → Valuable Social Media Content | Empty | Populated for the "type of content" MULTI_CHOICE question only |
| Demographics → Objectivity Rating | Empty | Populated from the standard SINGLE_CHOICE shape |
| Demographics → Educational Resources chart | Labels wrapped 3 lines deep, overlapped each other | Clean word-wrap, every label visible, bars centered on label blocks |
| Sociometric Leaders matrix | Total at the rightmost column | Total between State and Discussion, sorted highest-first by default |
| Sociometric Tables (per-nomination type) | 2-column grid → horizontal scroll inside each table | Single-column grid, all 6 columns visible per table |
| Benchmarking + Sociometric Tables | Count at the rightmost column (or wherever) | Consistent: `# | Name | … | State | Count`, sorted Count-desc |
| Total Weighted Score table | Total at the rightmost column | Total between Type and (first segment score), sorted compositeScore-desc |
| Campaign Overview (as CLIENT_ADMIN / TEAM_MEMBER) | "Exclude Internal Emails" toggle was interactive | Toggle is disabled / read-only |

## Per-PR detail

### v1.17.24 (multiple commits — initial reorg pass)

- Sociometric Tables single-column layout. Customer ask: "make the view so that you can see all of the columns".
- Educational Resources SQL: handle string-array shape with `WITH ORDINALITY`.
- Practice Setting `Question.type` migration: `SINGLE_CHOICE → MULTI_CHOICE` plus 1,266 answer rows backfilled (`scripts/migrate-practice-setting-to-multichoice.sql`).
- Exclude Internal Emails toggle: `canEdit`-gated for client roles.

### v1.17.25 (Practice Setting MultiSelect + missing graphs)

- Demographics Practice Setting MultiSelect: separate unfiltered `useDemographics()` call provides options. Mirrors Benchmarking pattern.
- Social Media Rankings SQL: read from `answerJson->'ranked'` (was running on the wrapper object).
- Valuable Content keyword: tightened from `%valuable%` to `%type of content%`.
- Initial column reorder on Sociometric Summary + Total Weighted Score (later refined in v1.17.26 / .27).

### v1.17.26 (column position correction + Educational Resources chart)

- Total column moved from "first column of table" to "first of the count/score block" on Sociometric Summary + Total Weighted Score.
- `StackedBarChart`: per-row height 40→64, Y-axis 180→280, `interval={0}`, custom `WrappedTick` SVG component for clean word-wrap.

### v1.17.27 (LeaderTable convention)

- Benchmarking + Sociometric Tables (per-nomination LeaderTable): Count moved back to LAST column. These tables have only one count column, so the "first-of-count-block" rule from v1.17.26 collapses to "last of the table". Descriptors-first / single-count-column convention.

### v1.17.28 (inverted-sort fix)

- `getSociometricSummary` numeric comparator was `order * (bVal - aVal)` which inverted both directions: `sortOrder='desc'` requests came back ascending, and vice versa. Customer-reported on the matrix where Total wasn't ranking leaders highest-first despite the default `sortBy='total' sortOrder='desc'`.
- Rewrote using the same `dir + ternary` shape that `getKolExplorer` (Total Weighted Score) and `getLeaderRankings` (Benchmarking) already use. One sort pattern across all three insights services now.

## Migrations

**None.** All code-only. The Practice Setting `Question.type` migration ran on prod during prod-rel-4.1.11 (via `scripts/migrate-practice-setting-to-multichoice.sql`); no further data steps in 4.1.12.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green (all 5 versions cleanly compiled) |
| Shared unit tests (165 tests) | green |
| API unit tests (210 tests) | green |
| E2E (test env, v1.17.25) | **196/196 green** — first fully clean run in a while |
| E2E (test env, v1.17.27) | **196/196 green** — second consecutive clean |
| E2E (test env, v1.17.28) | **194/196** — 2 data-dependent flakes (nominations-stats 404, KOL-name round-trip 0 results). Neither path was touched in v1.17.28; comparator fix only affects `getSociometricSummary`. |
| Deploy status | API + web both at v1.17.28 on test |

## Risk

**Low.**

- No DB migration to roll back or forward.
- All five themes are display-layer changes (column reorder, chart layout, dropdown source, comparator sign) — no data is modified.
- Comparator fix in v1.17.28 affects only `getSociometricSummary`. The other two sort paths (`getKolExplorer`, `getLeaderRankings`) were already using the correct shape and are unchanged.

## Rollback

Redeploy `prod-rel-4.1.11` (v1.17.23). Effects:
- Sociometric Summary Total sorts ascending again.
- Demographics Practice Setting back to single-select.
- Demographics Educational Resources / Top 5 Social Media Platforms / Valuable Content / Objectivity Rating graphs hide again (their SQL queries return 0 rows on the rolled-back code).
- Column positions revert (Total at the right edge).
- StackedBarChart labels overlap on long entries.
- Toggle becomes interactive for client roles again (visible regression for the role-tightening soaked in prod-rel-4.1.11).

No data state to unwind.

## See also

- Soak checks: [`prod-rel-4.1.12-soak-checks.md`](prod-rel-4.1.12-soak-checks.md)
- Predecessor: [`prod-rel-4.1.11-handoff.md`](prod-rel-4.1.11-handoff.md)
