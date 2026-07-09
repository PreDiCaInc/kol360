# prod-rel-4.1.56 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migration.** Reversible.
**Tag:** `prod-rel-4.1.56` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.55` (v1.17.75).
**Bundles:** v1.17.76 — Insights Demographics pie-chart-blank hotfix + Playwright regression spec.

Ticket: [`docs/findings/insights-demographics-pie-blank-inside-chart-table-toggle-2026-07-08.md`](../docs/findings/insights-demographics-pie-blank-inside-chart-table-toggle-2026-07-08.md).

## TL;DR

Two-line customer-visible bugfix. The Respondent Role pie chart on Insights → Demographics was rendering blank on first paint (the Table view of the same card correctly showed the data). Regression bit customers on every Demographics dashboard since v1.17.57 / 2026-06-22.

Root cause: Recharts' `ResponsiveContainer` inside `PieDistributionChart` measures the parent DOM element at mount, but the `ChartTableToggle` wrapper's outer bare `<div>` doesn't have a stable width at that moment. Result: pie draws at 0×0 (invisible). Bar charts in the same wrapper aren't affected because their axis-based layout re-measures on scale changes.

Fix (recommended #1 from the ticket): give the pie's parent `<div>` explicit inline `width: '100%'` + `minHeight: 288` so `ResponsiveContainer` measures a stable box on first render. Two chart cards fixed:

- **Respondent Role** — first card on Demographics (highest-visibility fix)
- **Topics Discussed (Distribution)** — same wrapper pattern; renders when the DA has topic data

Bar-chart cards on the same tab are unchanged (Treatment Decile, Monthly Patients, DED Patients, Years in Practice, State, Practice Setting, Core Focus × Avg Monthly Patients, all the Educational Resources cards, Social Media cards, Valuable Content, Objectivity Rating, Topics Discussed Counts). Zero regression risk to any of them.

## Regression spec

`e2e/web/insights-demographics-pie.spec.ts` — 2 tests:

1. **Respondent Role pie renders with non-zero dimensions on first paint** — logs in, navigates directly to `/admin/dashboards/<da>` (fresh mount), opens Demographics tab, measures the pie's `<svg>` bounding rect. Requires `.width > 100 && .height > 100`. Skips on data-empty DAs (e2e stable fixture DA has no demographic data — use `E2E_TEST_DEMOGRAPHICS_DA_ID` in CI to point at a data-rich DA).
2. **Chart ↔ Table toggle on the Respondent Role card works both directions** — flips to Table view (verifies `<table>` renders), flips back to Chart view.

Catches this class of "chart renders but at 0×0" bug across future refactors.

## What changes for customers

Immediate:

| Surface | Before (4.1.55) | After (4.1.56) |
|---|---|---|
| Respondent Role card on Demographics — first paint | Blank Chart view (Table view correct) | Pie renders correctly with the role distribution |
| Topics Discussed (Distribution) card — first paint | Same bug when the card renders | Pie renders correctly |
| Bar chart cards on Demographics | unchanged | unchanged |

Long-standing customer complaint from Sun Pharma → Dry Eye Insights review 2026-07-08 (*"insights - sunpharma dryeye - demo tab - respondent role is blank"*) is closed.

## API changes

**None.** Only affects two FE chart-card wrappers.

## Migrations

**None.**

## Risk

**Very low.**

- Additive `style` prop on 2 chart card `<div>` wrappers. No changes to `PieDistributionChart` itself, no changes to `ChartTableToggle`, no changes to any bar-chart card.
- Rollback: revert the 2 inline-style additions. Chart view goes blank again, Table view still works.

## Test environment verification

| Check | Result |
|---|---|
| Web build | green at 1.17.76 |
| Unit tests | 91/91 web pass |

## Manual soak

1. Log into `koltest.bio-exec.com` as a client that has a disease-area with real Demographics data (Sun Pharma → Dry Eye is the flagged case).
2. Open Insights → Demographics tab.
3. **Respondent Role card should show the pie chart on first paint** — no need to flip the Chart/Table toggle.
4. Flip to Table view, back to Chart — pie still renders.
5. Confirm all bar-chart cards on the tab render byte-identically to 4.1.55 (Treatment Decile, Monthly Patients, DED Patients, etc.).

## See also

- Soak checks: [`prod-rel-4.1.56-soak-checks.md`](prod-rel-4.1.56-soak-checks.md)
- Predecessor: [`prod-rel-4.1.55-handoff.md`](prod-rel-4.1.55-handoff.md)
- Source ticket: [`docs/findings/insights-demographics-pie-blank-inside-chart-table-toggle-2026-07-08.md`](../docs/findings/insights-demographics-pie-blank-inside-chart-table-toggle-2026-07-08.md)

## Recommended follow-up (not in this PR)

The ticket also proposes fix #2 — apply a `w-full` container to `ChartTableToggle`'s chart-branch so any future chart type dropped into it gets a stable parent by default. That's a wrapper-level 1-line change; small scope, worth doing in the next sprint to bulletproof the pattern. Skipped in this hotfix to minimize risk.
