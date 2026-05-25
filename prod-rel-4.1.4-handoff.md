# prod-rel-4.1.4 — Handoff to Prod Team

**Status:** Ready for prod deploy. **UI-only patch — low risk.**
**Tag:** [`prod-rel-4.1.4`](https://github.com/PreDiCaInc/kol360/releases/tag/prod-rel-4.1.4) → commit on `main` (cut after this PR merges).
**Supersedes:** `prod-rel-4.1.3` (v1.17.2) — same backend, two UX improvements on the Insights surface.

## TL;DR

Code-only patch. **No migrations. No backend changes.** Reversible (redeploy 4.1.3 if anything regresses). Safe to deploy on any standard cadence.

| # | Severity | Area | Change |
|---|---|---|---|
| 1 | UX (P2 — second recurrence) | Insights filters | Reworked the "Clear filters" UX after customers reported (twice) they couldn't find it. Now applied consistently to all 5 insights filter bars, with a prominent right-anchored button + removable chips below. |
| 2 | UX/IA | Sidebar nav | Enabled the previously-disabled "Insights" link. Grouped Insights + KOL Analyses under a new collapsible "KOL Insights" parent with verb-pair children (View / Configure). Resolves the long-standing naming clash with the top-level "Dashboard" (program overview). |

## What changed in detail

### 1. Clear filters — rethought + consistent across 5 surfaces

Customer reported (a second time, after the v1.17.1 / 4.1.2 incremental fixes) that the Clear filters button still wasn't visible enough — **and** was missing entirely from two tabs (KOL Explorer / Total Weighted Score, Sociometric Leaders).

**New shared component** at [`apps/web/src/components/insights/shared/filter-clear-controls.tsx`](apps/web/src/components/insights/shared/filter-clear-controls.tsx) exports:
- **`ClearFiltersButton`** — right-anchored, **default-size**, **secondary (filled) variant** with embedded count badge (`Clear filters (3)`). Pinned to the right edge so the eye lands on it after selecting filters. (Earlier `size="sm"` + `outline` + tucked-next-to-muted-label was the visibility problem all along.)
- **`ActiveFilterChips`** — removable chip row below the filter inputs; each chip clears just its own filter on click. Customers now see *what is filtered*, not just that *something is filtered*.

**Applied consistently** to all 5 surfaces:

| Tab / Surface | Before 4.1.4 | After |
|---|---|---|
| Top-of-page global filters | small outline button + ad-hoc chips | shared component |
| Demographics tab | small outline ghost | shared component |
| Dynamic Benchmarking (Leader Rankings) | small outline ghost | shared component |
| Total Weighted Score (KOL Explorer) | **missing entirely** | shared component (first add) |
| Sociometric Leaders | **missing entirely** | shared component (first add) |

### 2. Sidebar nav — KOL Insights grouping

The disabled "Insights" link in the sidebar is now enabled. The naming clash with the top-level "Dashboard" (program overview) is resolved by grouping the two related Insights screens under one collapsible parent.

**Before:**
```
- Dashboard           (/admin)              ← program overview
- ...
- Insights            (/admin/dashboards)   ← DISABLED
- KOL Analyses        (/admin/kol-analysis)
- Users
```

**After:**
```
- Dashboard           (/admin)              ← unchanged
- ...
- KOL Insights ▾                            ← NEW collapsible parent
    - View            (/admin/dashboards)   ← enabled
    - Configure       (/admin/kol-analysis) ← moved + renamed
- Users
```

Rationale: verb-pair children read naturally ("am I looking or editing?"). Parent keeps the noun ("KOL Insights"). CLIENT_ADMIN sees View only — configuration is platform-admin only.

## What's NOT changing

- Backend / API behavior — unchanged from 4.1.3
- Database — unchanged
- KOL Analysis dashboard data — unchanged
- Lite client portal — unchanged
- HCP CSV import — unchanged (the 4.1.3 P1 fix is in this release too)

## Customer-facing comm worth signaling

- **Insights Dashboard customers:** Clear filters now visible on every tab (was missing or hidden on most). If customers had been struggling to reset filters, this is fixed.
- **Admin users:** sidebar has reorganized — "Insights" / "KOL Analyses" are now grouped under "KOL Insights" (with View / Configure children). 1-time muscle-memory adjustment.

## Migrations

**None.** Code-only patch.

## Test environment verification

| Check | Result |
|---|---|
| Shared unit tests | green |
| API unit tests | green |
| Web build | green |
| Test-env deploy (`kol360-api-test` + `kol360-web-test`) | RUNNING on **1.17.3** ✓ |
| E2E full workflow vs test env | **169/169** ✓ |

## Soak checks

[`prod-rel-4.1.4-soak-checks.md`](prod-rel-4.1.4-soak-checks.md) — short 2-phase checklist (sanity + functional smoke). Recommend **1-2 day soak** given UI-only scope.

## Rollback

Redeploy `prod-rel-4.1.3` (v1.17.2). No data-state divergence — code-only patch. Reversible in minutes.

## What's next on our side

After 4.1.4 soaks: nothing else queued. The Insights surface arc + the HCP CSV P1 hotfix arc are both done.

Outstanding minor items (not blocking):
- Migration baseline reconciliation on prod (housekeeping; see [`prod-team-deploy-guidance.md`](prod-team-deploy-guidance.md))
- Repo housekeeping: archived older `prod-rel-*-handoff.md` / `prod-rel-*-soak-checks.md` from root to `docs/releases/` so the root stays scannable. Bundled into this PR. Cross-references in `prod-team-deploy-guidance.md` updated to point at the new paths.
