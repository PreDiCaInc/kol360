# prod-rel-4.1.54 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migration.** Reversible.
**Tag:** `prod-rel-4.1.54` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.52` (v1.17.72).
**Bundles:** v1.17.74 — Interactive tour Tier 1 + Cases 2-5 tour content authoring + case-1-step-3 image refresh + one automated-soak test fix.

Ticket: [`docs/findings/insights-use-case-tours-interactive-walkthroughs-2026-07-04.md`](../docs/findings/insights-use-case-tours-interactive-walkthroughs-2026-07-04.md).

## TL;DR

Four items in one bundle.

### 1. Tier 1 muscle-memory (target-click steps hide Next)

Tour steps that ask the user to click a specific UI element (Open Benchmarking, Drill into a KOL) no longer render a Next button. Users must actually click the highlighted target to advance. Shepherd's built-in `advanceOn` handles the transition on click.

- Skip + Prev stay so the user always has an exit. Subtle inline hint under the body reads *"Click the highlighted element to continue"* (themed in the KOL360 primary color).
- Empty-data fallback: if the target's genuinely missing (e.g. Drill into a KOL when the leader table has no rows), `beforeShowPromise` injects a Next button at runtime via `shepherdTour.getById().updateStepOptions()`. `tour.anchor_missing` telemetry still fires so we can spot data-shape drift.

### 2. Cases 2-5 tour content authored

Every case study in the "How to…" dropdown now has an authored walkthrough (previously only Case 1 shipped in 4.1.52). ~25 authored steps across the 4 cases + `tourSummary` bullets for the Phase 3 "Show me the summary" digest.

- **Case 2 (SECO Discussion + Advice Leaders)** — 6 steps + checkpoint: open Benchmarking, filter State GA/FL/AL + Role Optometrist, apply, scan panels, sort/export.
- **Case 3 (SECO Rising Stars)** — 6 steps + checkpoint: switch to Sociometric Leaders, reuse SECO filters, apply, find Rising Stars column, sort.
- **Case 4 (NY/NJ Symposium)** — 7 steps + checkpoint: Sociometric Leaders, NY/NJ + Ophthalmologist + Cornea/Dry Eye Core Focus, apply, compare National vs Rising Stars.
- **Case 5 (Trade Pub + National Leader composite)** — 6 steps + checkpoint: Total Weighted Score tab, optional geography + audience filters, apply, sort by Trade Pubs, read composite score.

Two new tour anchors applied to unlock Cases 3-5's deep dives:
- `sociometric-table` on the `SociometricSummaryTab` outer Card
- `filter-specialty` on `RespondentFiltersBar`'s Core Focus MultiSelect (reused for Cornea/Dry Eye sub-specialty in Case 4)

### 3. case-1-step-3 image refresh

Swapped the older static-guide screenshot for the v1.1 docx `image9.png` (fresher Bio-Exec-branded version, current dataset numbers).

### 4. `canada-hcp-isolation.test.ts` fix

The leader-rankings test was calling the endpoint without a `nominationType` query param. v1.17.71's curation hardening made that a required param; test was silently 400ing on every e2e run since. One-line fix: pass `nominationType: 'NATIONAL_LEADER'`.

## What changes for customers

Two things: target-click steps in Case Study 1 lose their Next button (Tier 1), and the "How to…" dropdown now lists **all 5 case studies** as clickable tours instead of just Case 1 + "coming soon" placeholders.

| Surface | Before (4.1.52) | After (4.1.54) |
|---|---|---|
| Case 1 Step 1 — Open Benchmarking | Skip / Prev / Next tooltip. Clicking Next auto-clicked the tab AND advanced. | Skip / Prev only. User must click the highlighted Benchmarking tab; Shepherd's advanceOn fires the transition. Inline hint: "Click the highlighted element to continue." |
| Case 1 Step 5 — Drill into a KOL | Same. | Same as above — user must click a KOL row. |
| "How to…" dropdown | Case 1 tour launches; Cases 2-5 tagged "coming soon" | All 5 cases launch tours. |
| Cases 2-5 tours | Not available | Full walkthroughs with checkpoint at Quick intro / Deep dive boundary. |
| Case 1 Step 3 image | Older screenshot | Refreshed from docx v1.1 (Eric Donnenfeld profile, current dataset numbers). |
| All other steps + tours | unchanged | unchanged |

## API changes

**None.** Response shapes and endpoint contracts identical to 4.1.52.

## Migrations

**None.** Schema unchanged from 4.1.48/49/50/51/52.

## Risk

**Very low.**

- Tour engine only mounts on `/admin/dashboards/*` routes.
- Fallback injection covers the "empty data → no target to click" edge (was already documented as a data-shape-drift signal via `tour.anchor_missing`).
- The `canada-hcp-isolation` test fix is a test-only change; no runtime impact.
- Rollback: redeploy 4.1.52. The two target-click steps get their Next buttons back; the rest of the tour is identical.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green at 1.17.74 |
| Unit tests | 520/520 pass |
| E2E soak (workflow suite) | will run post-deploy via `tdct`; the `canada-hcp-isolation` fix takes 1 known-broken test back to passing |

## Manual soak

Post-deploy:

1. `/admin/dashboards/<a-DA-id>` → "How to…" dropdown → Case Study 1.
2. Step 1 shows Skip + Prev only (no Next). Hint reads "Click the highlighted element to continue."
3. Click Benchmarking → tour auto-advances to Step 2.
4. Continue through the intro → checkpoint → deep dive. Step 5 (Drill into a KOL) also has no Next.
5. Click a KOL row → tour advances into the profile drawer.
6. Empty-data scenario: try a fresh disease-area with no scored HCPs → Step 5 (Drill into a KOL) should show an injected Next after ~1 second of waitForElement timing out.

## See also

- Soak checks: [`prod-rel-4.1.54-soak-checks.md`](prod-rel-4.1.54-soak-checks.md)
- Predecessor: [`prod-rel-4.1.52-handoff.md`](prod-rel-4.1.52-handoff.md)
- Source ticket: [`docs/findings/insights-use-case-tours-interactive-walkthroughs-2026-07-04.md`](../docs/findings/insights-use-case-tours-interactive-walkthroughs-2026-07-04.md)
