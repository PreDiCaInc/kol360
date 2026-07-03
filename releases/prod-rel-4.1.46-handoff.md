# prod-rel-4.1.46 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Reversible.
**Tag:** `prod-rel-4.1.46` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.45` (v1.17.65).
**Bundles:** v1.17.66 — Insights Use Cases guide v1.1 image refresh from pteam ticket [`insights-guide-v1.1-image-refresh-2026-07-01.md`](../docs/findings/insights-guide-v1.1-image-refresh-2026-07-01.md).

## TL;DR

Two guide screenshots updated to match the v1.1 source Case Study doc:

1. **New consolidated KOL Profile screenshot** placed at **Case Study 1 Step 5** slot (where the KOL Profile is first introduced). Replaces the prior score-table list view (which showed the WTS table before the click, not the profile drill-down after — mismatched the Step 5 body copy "Click any KOL's name to open the KOL Profile drill-down"). New image is Bio-Exec branded, shows the full KOL Profile page with the Respondent Filters bar (post-4.1.36) + Use Cases button (post-4.1.43).
2. **Case Study 3 Step 2 image removed.** The sort-arrow UI is self-evident; the deleted screenshot only showed "the result after clicking the arrow" which didn't teach anything the user can't see in real time. Step 2 body text unchanged.

## Deviation from the ticket (worth calling out)

The ticket recommended placing the new image at the **CS1 Step 3** slot ("that's where the KOL Profile is first introduced"). Both the source `docs/Sun Pharma - Case Study.txt` extract AND the shipped `guide-content.ts` have CS1 Step 3 as the "apply Respondent Role filter" step; the KOL Profile is first introduced at **Step 5**. Placing the new full-page Profile capture at Step 3 would have visually contradicted the Step 3 body copy.

Placement: **CS1 Step 5** (semantically correct). The new image also visually consolidates what the prior Step 5 + CS3 Step 2 screenshots covered separately, so the net image count still drops from 12 → 11 as the ticket described.

Old CS1 Step 3 image (Respondent Role filter view) preserved — it's functionally correct even if pre-Bio-Exec-branded. A broader Bio-Exec-branding refresh of the remaining 10 screenshots was flagged in the ticket as future polish; deferred.

## What changes for customers

| Surface | Before (4.1.45) | After (4.1.46) |
|---|---|---|
| Insights guide → CS1 Step 5 image | Score-table LIST view (the pre-click state; mismatched the "click to open profile" body copy) | Full post-click KOL Profile drill-down with Score Breakdown, per-type Nomination Counts, Respondent Filters bar, Nominations by Role + State, Nominations table, and 6 demographic sub-charts. Bio-Exec branded. |
| Insights guide → CS3 Step 2 image | Sociometric Leaders Rising Stars panel sorted descending | Image removed — Step 2 renders text-only. Body copy unchanged. |
| CS1 Step 3 image (Respondent Role filter) | (unchanged) | (unchanged) |

## API changes

**None.**

## Migrations

**None.**

## Risk

**Trivial.** Two static asset changes + two `guide-content.ts` field edits. Zero server-side impact.

Rollback: restore the two removed assets from git history and revert the guide-content.ts edits.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green at 1.17.66 |
| New `case-1-step-5.png` md5 | `f99e6da83e44938c38a0d60baa860eeb` (matches ticket) |
| Old `case-1-step-3.png` preserved | md5 `c7cdfd08b67ab4a16eb9662bf606fe7a` (matches original) |
| `case-3-step-2.png` removed | file no longer in tree |

## Manual soak

1. Open `/admin/dashboards/guide` (or the drawer from the Insights dashboard).
2. Scroll to **Case Study 1 → Step 5**. Confirm the image shows the full KOL Profile page for Eric Donnenfeld with:
   - Score Breakdown chart
   - Nomination Counts by Type bar chart
   - Respondent Filters bar showing "224 nominations match"
   - Nominations by Respondent Role donut + Nominations by State bar chart
   - Nominations table
   - 6 demographic sub-charts (Practice Setting, Core Focus, Treatment Decile, DED Patients, Total Monthly Patients, Years in Practice)
3. Scroll to **Case Study 3 → Step 2**. Confirm no screenshot renders; text-only step is visible.
4. Scroll to **Case Study 1 → Step 3**. Confirm the Respondent Role filter image still renders (unchanged from 4.1.45).

## See also

- Soak checks: [`prod-rel-4.1.46-soak-checks.md`](prod-rel-4.1.46-soak-checks.md)
- Predecessor: [`prod-rel-4.1.45-handoff.md`](prod-rel-4.1.45-handoff.md)
- Source ticket: [`docs/findings/insights-guide-v1.1-image-refresh-2026-07-01.md`](../docs/findings/insights-guide-v1.1-image-refresh-2026-07-01.md)
