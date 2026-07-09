# prod-rel-4.1.53 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migration.** Reversible.
**Tag:** `prod-rel-4.1.53` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.52` (v1.17.72).
**Bundles:** v1.17.73 — Interactive tour Tier 1 (muscle-memory Next hiding) + a small automated-soak test fix.

Ticket: [`docs/findings/insights-use-case-tours-interactive-walkthroughs-2026-07-04.md`](../docs/findings/insights-use-case-tours-interactive-walkthroughs-2026-07-04.md).

## TL;DR

Two small changes. The tour walkthrough that shipped in 4.1.52 gets a UX improvement — steps that ask the user to click a specific UI element (Open Benchmarking, Drill into a KOL) no longer render a Next button. Users must actually click the highlighted target to advance. Shepherd's built-in `advanceOn` handles the transition on click.

- **`target-click` steps hide Next.** Skip + Prev stay so the user always has an exit. Subtle inline hint under the body reads *"Click the highlighted element to continue"* (themed in the KOL360 primary color).
- **Empty-data fallback.** If the target's genuinely missing (e.g. Drill into a KOL when the leader table has no rows), `beforeShowPromise` injects a Next button at runtime via `shepherdTour.getById().updateStepOptions()`. `tour.anchor_missing` telemetry still fires so we can spot data-shape drift.
- **`canada-hcp-isolation.test.ts` fix** — the leader-rankings test was calling the endpoint without a `nominationType` query param. v1.17.71's curation hardening made that a required param; test was silently 400ing on every e2e run since. One-line fix: pass `nominationType: 'NATIONAL_LEADER'`.

## What changes for customers

Very small. Only the two target-click steps in Case Study 1 (Open Benchmarking, Drill into a KOL) render without a Next button. Everything else is identical to 4.1.52.

| Step | Before (4.1.52) | After (4.1.53) |
|---|---|---|
| Step 1 — Open Benchmarking | Tooltip has Skip / Prev / Next. Clicking Next auto-clicked the tab AND advanced. | Tooltip has Skip / Prev only. User must click the highlighted Benchmarking tab; Shepherd's advanceOn fires the transition. Hint under body: "Click the highlighted element to continue." |
| Step 5 — Drill into a KOL | Same. | Same as above — user must click a KOL row. |
| All other steps | unchanged | unchanged |

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
| Shared / API / Web builds | green at 1.17.73 |
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

- Soak checks: [`prod-rel-4.1.53-soak-checks.md`](prod-rel-4.1.53-soak-checks.md)
- Predecessor: [`prod-rel-4.1.52-handoff.md`](prod-rel-4.1.52-handoff.md)
- Source ticket: [`docs/findings/insights-use-case-tours-interactive-walkthroughs-2026-07-04.md`](../docs/findings/insights-use-case-tours-interactive-walkthroughs-2026-07-04.md)
