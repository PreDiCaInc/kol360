# prod-rel-4.1.34 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Reversible.
**Tag:** `prod-rel-4.1.34` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.33` (v1.17.53).
**Bundles:** v1.17.54 — three pteam-flagged Insights polish items that came in immediately after the 4.1.33 PR merged. Not big enough individually for separate releases; bundled here under one tag.

## TL;DR

Three small polish items, all in the Insights tab cluster:

1. **Sociometric Leaders tab — duplicate per-category leader tables removed.** The 7 SociometricPanel children that used to render below the matrix were feature-equivalent to the Benchmarking tab (same `useLeaderRankings` hook, same component shape). Benchmarking is the canonical surface; customers had two routes to the same data. Removes `sociometric-tables-tab.tsx` + its import + its barrel re-export.

2. **Influencer Type filter dropdown — drift fix.** The dropdown was hardcoded to a stale 3-value list (`['National Leaders', 'Rising Stars', 'Regional Influencers']`) that hasn't matched prod data since v1.17.44 / prod-rel-4.1.24 — when the canonical `INFLUENCER_TYPES` list grew to include `'Regional Leaders'` and `'Pre-Emergent'`, and the data team uploaded those values onto prod HCPs. Customers picking 'Regional Influencers' got 0 results because no HCP was classified that way; 'Pre-Emergent' wasn't selectable at all. Now DB-driven via `SELECT DISTINCT "influencerType" FROM "HcpDiseaseArea"`, same pattern as `specialty`/`state`/`coreFocus`.

3. **Survey-question (i) info popovers on Benchmarking + Demographics.** New affordance next to each LeaderRankingPanel header (Benchmarking) and each main chart card title (Demographics). Click → popover with the actual question text + the campaign it was sourced from. Lets users see WHAT was asked when these KOLs were nominated / when respondents answered. Two new additive endpoints (`/insights/:da/nomination-questions`, `/insights/:da/demographic-questions`); most-recent-campaign tie-break when multiple included campaigns have slightly different text for the same dimension.

## What changes for customers

### Item 1: Sociometric Leaders tab — duplicate block gone

Before: open Sociometric Leaders → see the master matrix + a "Per-Category Leader Tables" section below with 7 leader-ranking panels.

After: open Sociometric Leaders → see the master matrix. Nothing below it. Customers who want the per-category leader tables go to the **Benchmarking** tab, which has the same 7 tables PLUS the filter bar.

### Item 2: Influencer Type filter dropdown reflects actual data

Affects: KOL Explorer (Total Weighted Score tab), Sociometric Summary, Benchmarking — every surface that exposes the Influencer Type filter dropdown via `useInsightsFilterOptions`.

On prod Dry Eye specifically, the dropdown now shows: **National Leaders** (87 HCPs), **Pre-Emergent** (2,261), **Regional Leaders** (1,291), **Rising Stars** (319) — sorted alpha. 'Regional Influencers' disappears (no prod HCP was ever classified that way). Other DAs reflect whatever the data team has uploaded.

User-visible bug fix: picking 'Regional Leaders' now returns ~1,291 results on the WTD tab instead of 0 (when 'Regional Influencers' was the closest stale dropdown option).

### Item 3: Survey-question (i) info popovers

Two new endpoints, both additive, both gated by `requireClientId` like the rest of the analysis-backed surfaces:

- `GET /insights/:da/nomination-questions?clientId=X` → `{ items: [{ nominationType, text, campaignName }] }`
- `GET /insights/:da/demographic-questions?clientId=X` → `{ items: [{ dimension, text, campaignName }] }`

Frontend:
- **Benchmarking**: each of the 7 LeaderRankingPanel components shows a small "(i) Survey question" badge above its per-panel search. Click → popover with the question text + source campaign.
- **Demographics**: 6 main chart card titles (Respondent Role, Total Monthly Patients, Monthly DED Patients, Years in Practice, Practice Setting, Core Focus by Avg Monthly Patients) gain an info icon button next to the title.

Cross-campaign tie-break per pteam ticket: when an analysis pools campaigns whose `questionTextSnapshot` differs slightly for the same dimension (rare — prod data on Dry Eye showed identical text across all included campaigns), the popover shows the text from the **most recent campaign** (`ORDER BY Campaign.createdAt DESC, SurveyQuestion.createdAt DESC`). Dimensions with no matching question in the analysis's included campaigns simply don't render the (i) — no broken/empty popover.

## API changes

Additive only — two new GET endpoints. No existing endpoint contracts changed.

## Migrations

**None.** Code-only.

## Risk

**Low.** Three small, scoped, additive changes. The riskiest piece is Item 1 — deleting a UI block customers may have been using; mitigated by Benchmarking being a one-tab-away replacement with full feature parity + more.

Items 2 and 3 are bug fixes (data drift) and additive UX (info popovers) respectively; neither changes existing behavior beyond the documented surface.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green at 1.17.54 |
| API unit tests | unchanged (no service signature shifted) |
| E2E new endpoint smoke (`insights-survey-questions.test.ts`) | added; verifies 200 + `{ items }` shape on both endpoints + 400 without clientId |
| Manual smoke | see soak doc Phase A |

## Rollback

Redeploy `prod-rel-4.1.33` (v1.17.53). Effects:
- Sociometric Tables block re-appears below the matrix.
- Influencer Type dropdown reverts to the 3 hardcoded values.
- Two new endpoints disappear; (i) popovers disappear.

No data destruction.

## Manual soak

See [`prod-rel-4.1.34-soak-checks.md`](prod-rel-4.1.34-soak-checks.md) for the phased checklist.

The critical bits:
1. **Item 1**: open Sociometric Leaders → confirm no leader tables below the matrix.
2. **Item 2**: open KOL Explorer / Sociometric / Benchmarking → confirm Influencer Type dropdown shows 4 real values (no 'Regional Influencers'). Pick 'Regional Leaders' → live count shows ~1,291 (not 0).
3. **Item 3**: open Benchmarking → each panel has an (i) badge → popover shows the actual nomination question. Open Demographics → 6 chart cards have (i) icons → popover shows the actual question text.

## See also

- Soak checks: [`prod-rel-4.1.34-soak-checks.md`](prod-rel-4.1.34-soak-checks.md)
- Predecessor: [`prod-rel-4.1.33-handoff.md`](prod-rel-4.1.33-handoff.md)
