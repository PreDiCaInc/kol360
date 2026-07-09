# prod-rel-4.1.55 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migration.** Reversible.
**Tag:** `prod-rel-4.1.55` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.54` (v1.17.74).
**Bundles:** v1.17.75 — Interactive tour Phase 3 polish (first-visit CTA ring + "Show me the summary" per case study + Playwright E2E specs).

Ticket: [`docs/findings/insights-use-case-tours-interactive-walkthroughs-2026-07-04.md`](../docs/findings/insights-use-case-tours-interactive-walkthroughs-2026-07-04.md).

## TL;DR

Three FE polish items on top of the tours system. **DB-persisted `TourCompletionStore` deferred to a future release** (kept on localStorage for now).

### 1. First-visit ring on the "How to…" button

New users get a subtle 3-pulse ring around the "How to…" trigger button in the Insights header on their first visit to any `/admin/dashboards/*` page. Draws attention without hijacking the UI with an auto-modal.

- Ring runs for ~3.2s (three quick pulses) then fades naturally.
- localStorage flag (`kol360.how-to-cta-shown-at`) suppresses re-firing on subsequent visits per device.
- Dismissed instantly if the user clicks the button OR opens the dropdown, so the ring never keeps flashing after engagement.
- `@media (prefers-reduced-motion: reduce)` disables the animation and falls back to a static outline — a11y hard-req.

### 2. "Show me the summary" per case study

Each case study in the Insights Use Cases drawer now carries a **📄 Show me the summary** button next to **▶ Take the tour**. Clicking opens a small popover with the case's takeaway bullets — content already authored via `caseStudy.tourSummary.bullets` in `guide-content.ts` (from 4.1.54's Phase 2 work).

- Users who want the digest without doing the walkthrough now have it.
- Available for all 5 case studies (each has a `tourSummary` block).
- Popover renders above the drawer via Radix's portal; no z-index conflicts with the tour engine.

### 3. Playwright E2E specs for the tour engine

Added `e2e/web/tour.spec.ts` — 6 tests covering the tour's happy path + edge cases:

1. `"How to…"` dropdown lists all 5 case studies + "Read the full documentation" link
2. Case 1 launches from the dropdown; step counter + target-click hint render correctly
3. Full Case 1 walk — advances through all 7 steps + auto-inserted checkpoint + `Done`; verifies telemetry (`tour.launched`, `.step_advanced`, `.checkpoint_reached`, `.completed`)
4. Completion checkmark appears next to the case study after finishing the tour
5. First-visit ring visible + localStorage flag written; reload suppresses re-fire
6. "Show me the summary" popover reveals the case-takeaway bullets

Runs against the deployed test env at `koltest.bio-exec.com` via `pnpm test:web:test` or against local dev via `pnpm test:web:local`. Expects `E2E_TEST_DA_ID` (defaults to the well-known e2e stable fixture DA).

## What changes for customers

Two visible additions in the Insights header + drawer:

| Surface | Before (4.1.54) | After (4.1.55) |
|---|---|---|
| First-visit "How to…" button | No cue | 3-pulse attention ring, one-time per device |
| Case study card in the drawer | "Take the tour" only | "Take the tour" + "Show me the summary" popover |
| Case-study takeaway bullets | Authored but not surfaced | Rendered in the popover on demand |

Everything else identical to 4.1.54.

## API changes

**None.** Response shapes + endpoints unchanged.

## Migrations

**None.** No schema changes. `TourCompletionStore` remains localStorage-backed — DB persistence is a follow-up release.

## Risk

**Very low.**

- Ring is a CSS animation gated by localStorage; degrades to static outline under `prefers-reduced-motion`.
- Summary popover reads authored content only; can't render if the field is absent (guarded).
- Playwright specs run in the workflow suite; they don't touch prod runtime.
- Rollback: redeploy 4.1.54. Ring + summary popover disappear; tours themselves are unchanged.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green at 1.17.75 |
| Unit tests | 520/520 pass |
| Playwright specs — local dev | expected to pass (they run against deployed after tdct) |

## Manual soak

1. Load `/admin/dashboards/<disease-area-id>` in an incognito window. The "How to…" button pulses with a teal ring for ~3s.
2. Reload the same URL in the same window. Ring does NOT re-appear.
3. Open the Insights Use Cases drawer. Each case study card shows both "▶ Take the tour" and "📄 Show me the summary".
4. Click "Show me the summary" on Case Study 1. Popover shows 4 bullets (case takeaways).
5. Same on Cases 2-5 — each shows its authored bullets.

## See also

- Soak checks: [`prod-rel-4.1.55-soak-checks.md`](prod-rel-4.1.55-soak-checks.md)
- Predecessor: [`prod-rel-4.1.54-handoff.md`](prod-rel-4.1.54-handoff.md)
- Source ticket: [`docs/findings/insights-use-case-tours-interactive-walkthroughs-2026-07-04.md`](../docs/findings/insights-use-case-tours-interactive-walkthroughs-2026-07-04.md)
