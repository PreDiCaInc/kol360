# prod-rel-4.1.57 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migration.** Reversible.
**Tag:** `prod-rel-4.1.57` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.56` (v1.17.76).
**Bundles:** v1.17.77 — Insights Use Cases guide v1.1 image sweep + Case 5 tour anchor fix + drawer support for secondary screenshots.

Ticket: [`docs/findings/insights-use-case-tours-interactive-walkthroughs-2026-07-04.md`](../docs/findings/insights-use-case-tours-interactive-walkthroughs-2026-07-04.md) + follow-up on [`docs/findings/insights-guide-v1.1-image-refresh-2026-07-01.md`](../docs/findings/insights-guide-v1.1-image-refresh-2026-07-01.md).

## TL;DR

Follow-up on the tour polish work. Two items customers see, one item devs see.

### 1. Static Insights Use Cases guide — full re-alignment to Sun Pharma Case Study v1.1 docx

Walked the v1.1 docx systematically, mapped every `r:embed` reference to its (Case Study N, Step M) context via document-order parsing, and swapped the shipped `apps/web/public/help/insights-guide/case-*.png` assets to match v1.1 exactly. Net: 3 stale v1.0-era files removed, 1 new secondary image added, 1 image restored (Case 3 Step 2 — the July 1 finding proposed dropping it, but v1.1 as-shipped kept it; following the source of truth).

**File-system diff** (`apps/web/public/help/insights-guide/`):

| File | Change |
|---|---|
| `case-1-step-3.png` | Content refreshed (composite State + Role filter view from v1.1's rId10 / image8.png) |
| `case-1-step-4.png` | **Deleted** — v1.1 has no image at Case 1 Step 4 |
| `case-1-step-5.png` | Content refreshed (Leader tables with "Click to view KOL full profile" arrow, from v1.1's rId11 / image3.png) |
| `case-1-step-5b.png` | **New** — secondary screenshot for Step 5 (KOL Profile drill-down, from v1.1's rId12 / image9.png). Step 5 walks across two distinct UI states; two images render stacked in the drawer. |
| `case-1-step-6.png` | **Deleted** — v1.1 has no image at Case 1 Step 6 |
| `case-3-step-2.png` | **Restored** (had been removed per July 1 finding; v1.1 kept it, so following the source of truth) |
| `case-5-step-1.png` | **Deleted** — v1.1 has no image at Case 5 Step 1 |
| `case-5-step-2.png` | **New** — first-time addition (from v1.1's rId18 / image1.png; Total Weighted Score sorted by Trade Publication) |
| Everything else | Refreshed to v1.1 content |

11 case-study images total after the sweep, matching v1.1's 11 embedded images exactly.

**`guide-content.ts` changes:**

- Extended `GuideStep` interface with optional `image2` + `image2Alt` fields for steps that walk across two UI states.
- Case 1 Step 4: `image` field dropped.
- Case 1 Step 5: added `image2: 'case-1-step-5b.png'` + descriptive alt text for the KOL Profile drill-down capture.
- Case 1 Step 6: `image` field dropped.
- Case 3 Step 2: `image` field restored with fresh alt text ("Sociometric Leaders table with a red 'Click to sort list' arrow on the Rising Star column header").
- Case 5 Step 1: `image` field dropped.
- Case 5 Step 2: `image: 'case-5-step-2.png'` added with fresh alt text.

**Drawer render** (`insights-guide-content.tsx`): renders `image2` as a stacked secondary `<figure>` below the primary. Existing single-image steps behave identically to today.

### 2. Case 5 tour anchor fix — walkthrough no longer silently mis-anchored

Audited the 5 case-study tour arrays against the actual anchors mounted in the UI components. Found one silent mismatch:

- **Case 5 Deep-dive steps 5 + 6 targeted `leader-table`** which is applied to `<LeaderTable>` on the Benchmarking tab. Case 5's tour runs on the Total Weighted Score tab (which renders `KolExplorerTab`, not `LeaderTable`). Result: `waitForElement` timed out, `tour.anchor_missing` telemetry fired, users got no highlight during "Sort by Trade Pubs" / "Read the composite" — the two most important deep-dive steps of Case 5.

**Fix:** added a new `weighted-score-table` anchor, applied it to the KOL Explorer / Total Weighted Score results-table wrapper in `kol-explorer.tsx:558`, and retargeted Case 5's deep-dive steps. `TOUR_ANCHORS` registry updated in `packages/shared/src/tours/anchors.ts` so the TypeScript union type covers it.

Cases 1-4 tours verified aligned with their static case-study bodies — no other anchor mismatches found.

## What changes for customers

| Surface | Before (4.1.56) | After (4.1.57) |
|---|---|---|
| Insights Use Cases drawer — Case 1 Step 3 | Content mismatch (older screenshot) | v1.1 composite showing State + Role filter |
| Insights Use Cases drawer — Case 1 Step 5 | Single image (older Leaders table) | Two stacked images: Leader tables with "click a name" arrow → KOL Profile drill-down |
| Insights Use Cases drawer — Case 3 Step 2 | Text-only | v1.1 image restored (sort arrow on Rising Star column) |
| Insights Use Cases drawer — Case 5 Step 1 | Older weight-config screenshot referenced | Text-only (v1.1 has no image here) |
| Insights Use Cases drawer — Case 5 Step 2 | Text-only | v1.1 image added (sorted-by-trade-pub result view) |
| Case 5 interactive tour — Sort by Trade Pubs + Read the composite | No highlight (anchor missing) | KOL Explorer scores table highlighted with pulse + outline |

## API changes

**None.** Only asset + content + tour anchor changes.

## Migrations

**None.**

## Risk

**Very low.**

- Static asset changes are self-contained under `apps/web/public/help/insights-guide/` — no runtime dependencies.
- `image2` field is optional — every existing step continues to render as before.
- The new `weighted-score-table` tour anchor is applied to a stable wrapper div; if anything drops off the anchor, `tour.anchor_missing` telemetry fires as the same visible-signal it did for the old `leader-table` misalignment.
- Rollback: revert the PR. Old images restore from git; tour retargets back to `leader-table` (silent mis-anchor for Case 5 returns).

## Test environment verification

| Check | Result |
|---|---|
| Shared / Web builds | green at 1.17.77 |
| Unit tests | 91/91 web pass |

## Manual soak

1. `/admin/dashboards/<disease-area-id>` → "How to…" → "Read the full documentation".
2. Case Study 1: verify Steps 1-6 render; Step 3 shows the State + Role composite; Step 5 shows TWO images stacked (Leader tables with click arrow, then KOL Profile).
3. Case Study 3 Step 2: verify sort-arrow screenshot is present.
4. Case Study 5 Step 2: verify sorted-by-trade-pub screenshot is present.
5. Close the drawer. Open "How to…" → "Trade Publication + National Leader composite" tour.
6. Walk through the intro (Total Weighted Score tab + optional filters + Apply).
7. Deep dive: **the "Sort by Trade Pubs" step should highlight the KOL Explorer scores table with an outline** (previously showed no highlight at all).
8. **"Read the composite" step highlights the same table**.

## See also

- Soak checks: [`prod-rel-4.1.57-soak-checks.md`](prod-rel-4.1.57-soak-checks.md)
- Predecessor: [`prod-rel-4.1.56-handoff.md`](prod-rel-4.1.56-handoff.md)
- Source tickets: [`docs/findings/insights-guide-v1.1-image-refresh-2026-07-01.md`](../docs/findings/insights-guide-v1.1-image-refresh-2026-07-01.md) + [`docs/findings/insights-use-case-tours-interactive-walkthroughs-2026-07-04.md`](../docs/findings/insights-use-case-tours-interactive-walkthroughs-2026-07-04.md)
