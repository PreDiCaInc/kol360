# prod-rel-4.1.30 — Handoff to Prod Team

**Status:** P1 hotfix on 4.1.29. **No migrations.** Reversible.
**Tag:** `prod-rel-4.1.30` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.29` (v1.17.49).
**Bundles:** v1.17.50 — one paired follow-on fix to complete the lite-client journey.

## TL;DR

Pteam, immediately after the 4.1.29 deploy completed end-to-end testing of the lite-client flow on prod:

> *"the lite client fix takes me to the dry-eye tile and the insights dash but everything is 0 :("*
> *"in prod I added all six campaigns to the insights dash config — but shows 0 everywhere. Either 'error loading data' (one screen) or 'no data available' in most other places."*

4.1.29 made the lite-client TEAM_MEMBER / CLIENT_ADMIN land on the right URL and surfaced the Dry Eye tile, but the Insights dashboards themselves still 403'd or returned empty. Root cause: the **same class** of "scope by client→OWNED campaigns" assumption that 4.1.29 fixed for the DA-list endpoint also lived in the per-endpoint access gate and in three campaign-aggregating service methods. All three locations have been broadened with the same OR / UNION pattern as 4.1.29.

## What changes for customers

| Surface | Before (4.1.29) | After (4.1.30) |
|---|---|---|
| `verifyDiseaseAreaAccess` (the access gate on every Insights endpoint: summary, kol-explorer, demographics, leader-rankings, sociometric, kol-profile, kol-profile-nominators, etc.) | Required `≥1 campaign owned by user's client in this DA` → returned 403 for lite clients (own 0 campaigns by design) → frontend rendered "error loading data" / silent empty states. | Accepts EITHER a campaign-owner anchor OR an analysis-owner anchor: `campaignCount + analysisCount > 0`. Same shape as the 4.1.29 `/disease-areas` fix; PLATFORM_ADMIN path unchanged. |
| `getSummary` totalCampaigns / totalNominations / totalRespondents | Counted only campaigns owned by `clientId` in this DA → 0 for lite clients. | Counts the **UNION of (a) owned + (b) campaigns INCLUDED in the (client, DA) KolAnalysis via KolAnalysisCampaign**. Lite client sees all 6+ included campaigns; regular client with no cross-tenant inclusions sees the same number as before (their owned set IS their analysis set). |
| `getDemographics` | Required a Campaign owned by `clientId` in this DA → returned `emptyDemographics()` for lite clients (charts all 0). | Same UNION via the new `resolveAccessibleCampaignIds` helper. Each campaign's own `excludeInternalEmails` + `showTopicsDiscussed` flags are honored across the union. |
| `getKolNominationMetadata` (drives the KOL Profile's bottom Nominations Metadata section) | Same campaigns-owned-only filter → empty for lite clients. | Same UNION fix. |

## API changes

None to the contract — same response shapes. The aggregation SOURCE broadens, the field names/types are identical.

## Migrations

**None.** Code-only.

## Risk

**Low-medium.** The semantic shift is:

- **Lite clients**: 0 → real data (the intended fix).
- **Regular clients with NO cross-tenant inclusions**: zero behavior change (owned set ⊇ analysis-included set; UNION = owned set).
- **Regular clients WHO HAVE cross-tenant analysis inclusions** (rare; would require platform-admin to have explicitly added another client's campaign to their analysis): would now see those included-from-other-client campaigns reflected in summary stats. Architecturally correct, but a behavior change worth a visual check on the Sun Pharma + B+L dashboards during soak.

What stays unchanged:
- PLATFORM_ADMIN (no clientId) path: still scopes "all campaigns in DA" cross-tenant — same as before.
- `getKolExplorer` / `getLeaderRankings` / `getSociometricSummary` / `getKolProfile`: these route data through `loadAnalysisScores(analysis.id)` (the analysis HCP set), which was already correctly cross-tenant-tolerant. Untouched.
- `getFilterOptions`: scoped to `HcpDiseaseAreaScore` — cross-tenant by design. Untouched.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green (1.17.50 across all three) |
| API unit tests | unchanged (no service-layer signature shifted) |
| E2E full-workflow | will run post-deploy via `tdct` |
| Manual smoke | the existing 4.1.29 Bio-Exec test setup (sam@bio-exec.com, isLite=true, Dry Eye KolAnalysis) — see "Manual soak" below |

## Rollback

Redeploy `prod-rel-4.1.29` (v1.17.49). Effects:
- Lite-client TEAM_MEMBER reverts to landing on `/admin/dashboards` (4.1.29 still works) → DA tile shows → click into Insights → 403 / empty (the 4.1.30 fix is undone).
- Regular clients with no cross-tenant analysis inclusions: no observable change.
- Regular clients with cross-tenant inclusions (if any): aggregations contract back to owned-only counts.

No migrations, no data destruction.

## Manual soak

Set up (already exists in prod from pteam's earlier 4.1.29 test session):
- Bio-Exec lite client (isLite=true)
- KolAnalysis on Dry Eye
- 6 included campaigns in the analysis (from other clients)

Repro:
1. Log in as sam@bio-exec.com (TEAM_MEMBER).
2. Land on `/admin/dashboards`. Click Dry Eye tile.
3. **Expected**: summary tile no longer says 0 (totalCampaigns = 6, totalRespondents > 0 if any of the 6 campaigns has completed responses, totalNominations > 0 likewise, totalKols = HcpAnalysisScore count for the analysis).
4. Click into each Insights tab (Sociometric Summary, KOL Explorer, Demographics, KOL Profile drill-down, Benchmarking). No "error loading data". Charts render with real data.

If the analysis hasn't been scored yet (no `HcpAnalysisScore` rows for the analysis), totalKols will be 0 but the campaign-source stats should now be non-zero. That's the score-pipeline's responsibility, not this fix.

PLATFORM_ADMIN smoke: log in as PLATFORM_ADMIN → all Insights tabs render with full data — no behavior change from 4.1.29.

Sun Pharma + B+L smoke (regular clients): confirm their dashboards still render with the same numbers as 4.1.29.

## See also

- Soak checks: [`prod-rel-4.1.30-soak-checks.md`](prod-rel-4.1.30-soak-checks.md)
- Predecessor: [`prod-rel-4.1.29-handoff.md`](prod-rel-4.1.29-handoff.md)
- Source thread: pteam reports immediately following 4.1.29 deploy (2026-06-16):
  > *"the lite client fix... but everything is 0 :("*
  > *"in prod I added all six campaigns... shows 0 everywhere."*
