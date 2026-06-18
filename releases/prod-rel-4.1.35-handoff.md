# prod-rel-4.1.35 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Reversible.
**Tag:** `prod-rel-4.1.35` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.34` (v1.17.54).
**Bundles:** v1.17.55 — three pteam-flagged Insights polish items that landed during 4.1.34 soak / inspection.

## TL;DR

Three small fixes, all surfaced by pteam while reviewing 4.1.34 on test:

1. **Survey-source privacy strip** — the `(i)` popover's "Source: <Campaign Name>" line is now hidden for non-PLATFORM_ADMIN viewers. Lite clients pool data across OTHER clients' campaigns; surfacing the source campaign name leaks the cross-tenant data origin. Conservative blanket rule: only PLATFORM_ADMIN sees source.

2. **Benchmarking `(i)` visibility** — the survey-question icon moved from a muted text-xs row above each panel's search input into the colored title bar where the bold white "National Leaders" / "Discussion Leaders" / etc. label lives. Pteam reported "I don't see the questions on the benchmarking tab" — the previous placement was easy to miss. Now sits next to the title, white-on-color, hard to miss.

3. **Search bar is realtime, not gated on Apply** — pteam: "the text search bar should not be with the apply filter — that should be realtime — the ux now is not good as we type." Search now bypasses the Apply Filters batch on both Sociometric Summary and KOL Explorer (KOL Explorer = "Total Weighted Score" tab). Debounced 250ms so the heavy aggregation query fires only after the user stops typing. The Apply pattern still governs every other filter dimension (specialty / state / influencer type / score ranges / respondent filters).

## What changes for customers

### Item 1: `Source: <Campaign>` line hidden for non-PLATFORM_ADMIN

Affects the `(i)` popover on Benchmarking + Demographics tabs.

| Role | Pre-fix | Post-fix |
|---|---|---|
| PLATFORM_ADMIN | sees question text + "Source: Sun Pharma - SOT Ophthalmology Import" | unchanged |
| PLATFORM_ADMIN impersonating | sees source (their actual role is still PLATFORM_ADMIN) | unchanged |
| CLIENT_ADMIN / TEAM_MEMBER (full client) | sees source — fine, they own the campaign | source hidden (conservative blanket) |
| CLIENT_ADMIN / TEAM_MEMBER (**lite client**) | sees source — would leak cross-tenant data origin | **source hidden** |

Backend: route handlers for `/insights/:da/nomination-questions` and `/insights/:da/demographic-questions` strip `campaignName` to `''` before responding. The service stays role-agnostic and unit-testable; gating happens at the route boundary. Frontend popover already renders the source line only when `campaignName` is truthy — no FE changes needed.

### Item 2: Benchmarking `(i)` in the colored title bar

Before: tiny gray "(i) Survey question" row above each panel's search input. Easy to miss against the muted-foreground color + text-xs size.

After: white info icon inside the colored title bar, immediately right of the panel name. The user's eye lands on the title bar; the (i) is right there. Click → same popover.

Implementation: `LeaderTable` gains an optional `titleSuffix?: ReactNode` prop rendered inside its existing color-coded header bar (yellow for National Leaders, blue for Discussion Leaders, etc.). Benchmarking passes the popover as `titleSuffix`.

Also: `QuestionInfoPopover` icon size hardcoded to `h-4 w-4` (was a templated `h-${iconSize}` which Tailwind JIT can't resolve dynamically). Slightly larger icon helps title-bar visibility.

### Item 3: Realtime search

Affects Sociometric Summary + KOL Explorer (Total Weighted Score). Both tabs have a "Search by name…" input.

| Action | Pre-fix (4.1.33+) | Post-fix |
|---|---|---|
| Type in search input | Pending state, must click Apply to see results | Query fires 250ms after the last keystroke — no Apply click needed |
| Apply button "dirty" state | Lit up by every keystroke | Search no longer counts toward dirty; specialty/state/score/respondent edits still light it up |
| Reset button | Clears search + everything else | Same — Reset clears search too |
| Live "N KOLs match" indicator | Already debounced 250ms via `useKolMatchCount` | Unchanged |
| Other filter dimensions (specialty / state / influencer / score ranges / respondent) | Still gated on Apply | Still gated on Apply |

Implementation: new `useDebouncedValue` hook in `apps/web/src/hooks/use-filters.ts`. Sociometric reads `debouncedSearch` directly into `apiFilters.search` instead of routing through `appliedFilters.search`. Same pattern in KOL Explorer.

## API changes

**None contract-wise.** The two `/insights/:da/{nomination,demographic}-questions` endpoints now return `campaignName: ''` for non-PLATFORM_ADMIN viewers (was: actual campaign name) — same field shape, narrower data.

## Migrations

**None.** Code-only.

## Risk

**Low.** All three items are small and scoped.

Watch for during soak:
- Item 1 (privacy strip): if a customer reports "I used to see the source campaign and now I don't" — that's the intentional behavior change. Tell them to ask PLATFORM_ADMIN if they need source.
- Item 3 (realtime search): if users were accidentally relying on Apply firing after a search edit to commit OTHER pending filters, they'd be surprised that typing in search doesn't commit those. Mitigated by the dirty-state styling on Apply (still visible and unmistakable).

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green at 1.17.55 |
| API unit tests | unchanged |
| E2E (will run post-deploy via `tdct`) | no test additions; existing tests cover the contract shape (campaignName presence is a string in both roles — empty for non-PLATFORM_ADMIN) |
| Manual smoke | see soak doc Phase A |

## Rollback

Redeploy `prod-rel-4.1.34` (v1.17.54). Effects:
- "Source: <Campaign>" line reappears for all roles (privacy regression).
- Benchmarking (i) reverts to the gray row above the search.
- Search reverts to being gated on Apply.

No data destruction.

## Manual soak

See [`prod-rel-4.1.35-soak-checks.md`](prod-rel-4.1.35-soak-checks.md) for the phased checklist.

The critical bits:
1. Item 1: log in as a CLIENT_ADMIN / TEAM_MEMBER → open Benchmarking → click (i) on a panel → popover shows question text BUT no "Source:" line. As PLATFORM_ADMIN, the Source line is back.
2. Item 2: open Benchmarking → each colored panel title bar has a visible white info icon next to the title. Click → popover shows the question.
3. Item 3: open Sociometric Summary → type in the search input → results filter ~250ms after you stop typing. Apply button does NOT light up. Other filters (specialty etc.) still gate on Apply.

## See also

- Soak checks: [`prod-rel-4.1.35-soak-checks.md`](prod-rel-4.1.35-soak-checks.md)
- Predecessor: [`prod-rel-4.1.34-handoff.md`](prod-rel-4.1.34-handoff.md)
