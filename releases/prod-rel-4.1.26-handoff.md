# prod-rel-4.1.26 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Reversible.
**Tag:** `prod-rel-4.1.26` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.25` (v1.17.45).
**Bundles:** v1.17.46 — one small UI addition on top of the 4.1.25 UX bundle.

## TL;DR

Single follow-on to prod-rel-4.1.25. Adds the HCP's NPI directly under the name on the KOL Profile (the "HCP detail view" inside KOL Explorer). Pteam asked for it during the 4.1.25 review; landed too late to fold into PR #172.

Also reflects the design decision on the related "tiles inline vs. own row" question — kept as a row, reasoning logged in the commit + handoff.

## What changes for customers

| Surface | Before (4.1.25) | After (4.1.26) |
|---|---|---|
| KOL Profile header (inside KOL Explorer) | Name `<h2>` only, then the 4 metric tiles row (Influencer Type / Specialty / Total Weighted Score / State) | Name `<h2>` + **NPI** rendered directly under the name (font-mono `text-sm`, muted, tabular-nums to defer visually to the hero name). Then the same 4-tile row. |

## Design decision: tiles row stays separate (not inline with name)

Pteam: "would the tiles be better off inline with the name instead of its own row — think and let me know."

Decision: **kept tiles as a separate row**. Reasoning logged in the commit + 4.1.25 handoff doc:

- The name uses `text-4xl extra-bold` (a hero element). 4 tiles inline would compete visually.
- At standard 1280px laptop widths with the sidebar expanded, names like "Marguerite McDonald MD PhD FACS" + 4 ~130px tiles overflow the content area.
- The amber "Total Weighted Score" tile carries the methodology tooltip + is a real visual anchor — demoting it inline loses that.

If post-deploy feedback prefers inline, easy to flip (~10 LOC).

## Migrations

**None.** Code-only.

## Risk

**Very low.** Single UI string render on an existing response field (`profile.npi` was already in the kol-profile schema since the original 4.1.19-era work). No API change, no schema change, no auth/role change.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green |
| API unit tests | 230/230 |

## Rollback

Redeploy `prod-rel-4.1.25` (v1.17.45). NPI line disappears from the KOL Profile header. Everything else unaffected.

## See also

- Soak checks: [`prod-rel-4.1.26-soak-checks.md`](prod-rel-4.1.26-soak-checks.md)
- Predecessor: [`prod-rel-4.1.25-handoff.md`](prod-rel-4.1.25-handoff.md)
