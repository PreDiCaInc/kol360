# prod-rel-4.1.33 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Reversible.
**Tag:** `prod-rel-4.1.33` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.32` (v1.17.52).
**Bundles:** v1.17.53 — Track B frontend: Apply Filters button + live "N match" indicator on 4 Insights tabs. Plus three pteam-flagged cleanups bundled in: (1) deletion of the duplicate per-category leader tables that lived at the bottom of the Sociometric Leaders tab; (2) fix for the influencer-type filter dropdown which was hardcoded to a stale 3-value list and missed the v1.17.44 expansion ('Regional Leaders' + 'Pre-Emergent'); (3) survey-question (i) info popovers on the Benchmarking tab (per leader panel) and the Demographics tab (per chart card) — show users WHAT was asked when these KOLs were nominated / when respondents answered.

## TL;DR

Companion to prod-rel-4.1.32 (Track B backend). The pteam-requested fix for the auto-fire filter pattern that cascaded 4–5 heavy queries during the demo. Each Insights filter dropdown change used to immediately re-run the heavy aggregation query; now changes stage as "pending" and the user explicitly clicks **Apply Filters** (or hits Enter) to commit.

Shipped to 4 tabs in this release:
- **Sociometric Summary**
- **KOL Explorer (Weighted Score Table)**
- **Demographics**
- **Leader Rankings (Benchmarking)**

KOL Profile drill-down filters → next PR (it doesn't currently have a filter bar at all; adding one is a separate UI surface, not a conversion).

## What changes for customers

### Benchmarking + Demographics — (i) survey-question popovers

Two new endpoints (additive, no contract changes):
- `GET /insights/:da/nomination-questions` — one entry per `NominationType` from the analysis's included campaigns; most-recent-campaign tie-break.
- `GET /insights/:da/demographic-questions` — one entry per Demographics chart dimension (role, coreFocus, practiceSetting, yearsInPractice, monthlyPatients, dedPatients, topicsDiscussed, educationalResources, socialMedia, valuableContent, objectivity).

Frontend places a small info icon button next to each panel header (Benchmarking) / chart card title (Demographics). Click → popover with the question text + the campaign it was sourced from.

Cross-campaign tie-break: when an analysis pools campaigns whose `questionTextSnapshot` differs slightly for the same dimension (rare but possible across imports), the popover shows the text from the most recent campaign — confirmed by the pteam ticket request.

### Sociometric Leaders tab — duplicate per-category tables removed

The "Per-Category Leader Tables" block that used to render below the matrix on the **Sociometric Leaders** tab is gone. Those 7 panels were a feature-equivalent subset of the **Benchmarking** tab — same `useLeaderRankings` hook, same component shape, no filter bar. Customers had two routes to the same data; Benchmarking is the canonical one.

This is a UI cleanup, not a data change. Anyone using those panels is one tab click away from the same data with more capability (filters).

### Influencer Type filter dropdown — drift fix

Before: `/insights/:da/filter-options` returned a hardcoded `influencerTypes: ['National Leaders', 'Rising Stars', 'Regional Influencers']` — three values that haven't matched prod data since v1.17.44 / prod-rel-4.1.24 (when the canonical `INFLUENCER_TYPES` list grew to include 'Regional Leaders' and 'Pre-Emergent' and the data team uploaded those values onto prod HCPs).

User-visible symptom on prod: KOL Explorer / Sociometric Summary / Benchmarking — picking "Regional Influencers" returned **0 results** (no HCP was classified that way; the actual prod count of 1,291 HCPs is under 'Regional Leaders'). 'Pre-Emergent' wasn't selectable at all.

After: the endpoint now queries `SELECT DISTINCT "influencerType" FROM "HcpDiseaseArea"` scoped to the DA — same DB-driven pattern already used for `specialties`, `states`, and `coreFocuses`. The dropdown reflects whatever the data team has uploaded.

For prod on Dry Eye specifically, the dropdown now shows: **National Leaders** (87), **Pre-Emergent** (2,261), **Regional Leaders** (1,291), **Rising Stars** (319). Old "Regional Influencers" disappears (it was never in the data).

### Filter flow — before vs after

| Action | Before (4.1.32) | After (4.1.33) |
|---|---|---|
| User opens a tab | Heavy aggregation query fires immediately (existing behavior). | Same — initial load auto-fires the default unfiltered view. |
| User selects/changes a filter dropdown | Query refires IMMEDIATELY on every dropdown click → 4-5 cascaded heavy queries during demo. | Edit stages in "pending" state. Apply button lights up (primary / colored). Heavy query stays on the previous applied result until user clicks Apply. |
| User clicks Apply Filters (or hits Enter inside a filter input) | N/A — no Apply button. | Pending → applied snapshot; heavy query refires once. |
| User clicks Reset | "Clear filters (N)" button on Demographics/Sociometric/KOL-Explorer/Leader-Rankings cleared pending state (and on a tab with auto-fire, that immediately refetched). | Same intent: clears everything AND immediately applies the cleared state — heavy query fires once. |
| Live count next to Apply | N/A. | "**N KOLs match**" / "**N respondents match**" updates as the user edits filters. Fires via the new cheap `match-count` endpoint (debounced 250ms), only while there are uncommitted edits. When clean, the displayed count is the applied data's `total` / `totalRespondents`. |

### Dirty-state styling

- **Clean** (pending == applied): Apply button muted (outline) + disabled. "Nothing to apply."
- **Dirty** (pending changed): Apply button primary / filled / colored. Eye lands here.
- **Loading** (Apply just clicked): spinner + "Applying…" label. Disabled to prevent double-fire.

### Filter chip removal

Existing active-filter chips (`Specialty: Optometry`, `Resp Role: Optometry`, etc.) are still rendered. Clicking the × on a chip now **edits pending** (consistent with the Apply pattern) — the user clicks Apply to commit. The dirty-state styling on Apply tells them their click is staged.

### Pagination / sort behavior

Page / limit / sort are view controls, not filters. They re-fire the heavy query immediately (unchanged from 4.1.32). The Apply pattern only governs filter dimensions (search, multi-selects, score ranges, respondent filters).

## API changes

**None.** This release uses the match-count endpoints shipped in 4.1.32 (additive). No new endpoint surface; no contract changes.

## Migrations

**None.** Pure UI release.

## Risk

**Medium-low.** Behavioral change to the filter UX on 4 customer-facing tabs.

Mitigations:
- Live "N match" indicator means users always see the impact of their pending edits BEFORE committing — they don't have to guess.
- Dirty-state Apply button is visually unmistakable (primary color, "Apply Filters" label vs muted outline).
- Reset button still gets back to defaults in one click.
- KOL-side + respondent-side filters preserve every dimension that worked in 4.1.32 — only the trigger semantics changed.

Watch for during soak:
- Customer feedback that the new flow feels "broken" (filter changed, page didn't move). Dirty-state styling should prevent this but worth confirming with one or two customer phone calls during the rollout.
- Page resets ON Apply (not on every filter change) — if a user is on page 4 with Specialty=X and changes Specialty to Y, the page doesn't snap back to 1 until they click Apply. That's intentional — page resets are now tied to Apply.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green at 1.17.53 |
| API unit tests | unchanged (no backend changes) |
| E2E full-workflow | will run post-deploy via `tdct` (existing tests against the deployed FE — manual UI inspection covers the new pattern) |
| Manual smoke | see soak doc Phase A |

## Rollback

Redeploy `prod-rel-4.1.32` (v1.17.52). Effects:
- Filter UX reverts to auto-fire pattern across all 4 tabs.
- Apply button + live count disappear.
- Match-count endpoints continue to exist (they were the 4.1.32 backend) — harmless.
- Customer state isn't persisted between reloads on any of these tabs today, so there's nothing to recover.

No data destruction.

## Manual soak

For each of the 4 tabs:

1. Open the tab — initial unfiltered view loads automatically.
2. Pick a couple of filter values (specialty + state + respondent role). Confirm:
   - Apply button transitions to primary/colored.
   - "N KOLs match" / "N respondents match" appears (or updates) within ~250ms.
   - The displayed table/charts DO NOT change yet.
3. Click Apply.
   - Spinner appears briefly.
   - Table/charts refresh with the filtered data.
   - Apply button transitions back to muted/disabled.
   - Live count now reflects the applied total (matches the table count).
4. Click Reset.
   - All filters clear.
   - Heavy query refires immediately to the unfiltered view.
5. Repeat 2; press **Enter** inside the search input instead of clicking Apply. Same result.
6. Click an existing active-filter chip (×). The filter clears from pending; Apply transitions to dirty. Click Apply to commit.

PLATFORM_ADMIN smoke: log in as PLATFORM_ADMIN, navigate to a real customer dashboard (Sun Pharma → Dry Eye), exercise the Apply flow on each tab. Confirm filter result counts match what they would have produced under 4.1.32 with the same filter set (parity already verified by the 4.1.32 backend tests — the FE wrappers don't reshape the request).

## See also

- Soak checks: [`prod-rel-4.1.33-soak-checks.md`](prod-rel-4.1.33-soak-checks.md)
- Predecessor: [`prod-rel-4.1.32-handoff.md`](prod-rel-4.1.32-handoff.md)
- Source ticket: [`docs/findings/insights-apply-filters-button-2026-06-16.md`](../docs/findings/insights-apply-filters-button-2026-06-16.md)
- Next PR: KOL Profile drill-down — build a new respondent-filter bar + Apply pattern on the single-HCP view. Uses the `useNominatorMatchCount` endpoint already shipped in 4.1.32 backend.
