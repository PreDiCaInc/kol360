# prod-rel-4.1.25 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Reversible.
**Tag:** `prod-rel-4.1.25` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.24` (v1.17.44).
**Bundles:** v1.17.45 — a focused UX bundle. 7 commits, all UI/layout work plus one small API addition (`/hcps` sort). No schema, no behavior shifts beyond what's documented below.

## TL;DR

Pteam's review of the deployed app surfaced a series of UX wins worth shipping together: the column-selector layout was sub-optimal, client users had a crowded sidebar with surfaces they shouldn't see, the user-profile placement felt dated, and the HCP profile's Nominators table needed NPI + role-gated Campaign visibility. All in one drop.

## What changes for customers

| Surface | Before (4.1.24) | After (4.1.25) |
|---|---|---|
| KOL Explorer + Sociometric Summary tabs | Column Selector lived on its own row above the table | Moved inline with Clear Filters + Export Excel — saves vertical space, groups table-action buttons together |
| HCP admin page (`/admin/hcps`) | "View Scores" button shown to all roles; segment-score upload only on `/admin/hcps/scores`; "Import Aliases" used a Users icon | "View Scores" gated to PLATFORM_ADMIN; new "Import Segment Scores" button visible to all writers; "Import Aliases" now uses the Upload icon — all 4 import buttons share the same affordance |
| `/admin/hcps/scores` (View Scores page) | Visible to CLIENT_ADMIN — overlapping with Insights and confusing | **PLATFORM_ADMIN-only** (data-team raw-data + cross-client tool). CLIENT_ADMIN gets a 302 redirect on direct URL nav. Plus a facelift: column-visibility selector, sticky NPI + Name columns, server-side sort on Name / NPI / State / Specialty (mirrors Insights' SortableHeader pattern). |
| CLIENT_ADMIN left nav | Dashboard / HCPs / Campaigns / KOL Insights > View / Users | Just "KOL Insights" (direct link to `/admin/dashboards`). Sidebar default-collapses for client users on mount. |
| User profile menu | Top-right of the header (dropdown with avatar + name) | Moved to the **bottom of the sidebar**, above the collapse toggle. Matches modern SaaS patterns (Linear, Notion, Slack, Vercel). Renders avatar-only when collapsed; avatar + name + role when expanded. PLATFORM_ADMIN's "View as Client" picker rode along to the same dropdown. |
| Header bar | Breadcrumb (left) + ClientBadge (middle) + User dropdown (right) | Stripped to **Breadcrumb (left) + ClientBadge (right)**. ~150 LOC removed; cleaner. |
| KOL Profile (inside KOL Explorer) — Nominators table | 5 columns: Name / Specialty / State / Nomination Type / Campaign — Campaign visible to everyone | 6 columns. + **NPI** column (between Name and Specialty, font-mono + tabular-nums for alignment, sortable). **Campaign column gated to PLATFORM_ADMIN only** (CLIENT_ADMIN + impersonation hide it). |

## API additions (small)

| Endpoint | New | Why |
|---|---|---|
| `GET /api/v1/hcps` | Optional `sortBy` (`name` \| `npi` \| `state` \| `specialty`) + `sortOrder` (`asc` \| `desc`) | Powers the View Scores facelift's sortable headers |
| `GET /api/v1/insights/:da/kol-profile/:hcp` | Each nominator item now includes `npi` (was: 5 fields) | Powers the Nominators table NPI column |

Both are additive — pre-4.1.25 callers that don't set the params or read the field continue to work unchanged.

## Migrations

**None.** Code-only.

## Risk

**Low.** All UI / hook layer + one new optional query-string param + one new field on an existing response. No DB writes changed, no schema modified, no auth-flow change (impersonation + role checks unchanged).

Header layout shuffle is the most user-visible: muscle memory for "click avatar in top-right to find Sign Out" needs to shift to "click avatar in sidebar bottom" — flagged so pteam can mention to client champions during the next call if asked.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green |
| API unit tests | **230/230** |
| New e2e: `e2e/api/hcps-sort.test.ts` | 4 cases — will run post-deploy |

## Rollback

Redeploy `prod-rel-4.1.24` (v1.17.44). Effects:
- User menu reverts to top-right header (sidebar bottom loses it).
- CLIENT_ADMIN sees Dashboard / HCPs / Campaigns / Users in the nav again.
- Nominators table Campaign column visible to all roles; NPI column disappears.
- View Scores page visible to CLIENT_ADMIN (the dual-surface confusion vector re-opens).
- KOL Explorer + Sociometric column selectors revert to their own row.
- HCP admin page loses the Import Segment Scores button.
- `/hcps` sort params still accepted by the backend (additive — no callers break), but the View Scores facelift's sortable header UI reverts.

No data destruction.

## See also

- Soak checks: [`prod-rel-4.1.25-soak-checks.md`](prod-rel-4.1.25-soak-checks.md)
- Predecessor: [`prod-rel-4.1.24-handoff.md`](prod-rel-4.1.24-handoff.md)
