# prod-rel-4.1.32 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Reversible.
**Tag:** `prod-rel-4.1.32` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.31` (v1.17.51).
**Bundles:** v1.17.52 — Track B backend: two new `match-count` endpoints powering the live "N match" indicator next to the upcoming **Apply Filters** button. Backend-only; no UI changes ship with this release.

## TL;DR

Pteam ticket [`docs/findings/insights-apply-filters-button-2026-06-16.md`](../docs/findings/insights-apply-filters-button-2026-06-16.md) flagged that today every Insights filter change auto-fires the underlying full-aggregation query, which during a customer demo cascaded 4–5 heavy queries back-to-back. The pattern requested:

> Replace auto-fire with a deliberate Apply Filters button. Add a live "N match" count next to the button so users see filter impact before committing.

The live "N match" indicator needs a cheap COUNT endpoint per surface. This release ships the **backend** half — two new endpoints, additive, zero risk to existing surfaces. The frontend rollout (`useFilters` hook + Apply button + live count + tab-by-tab conversion) lands in follow-on PRs.

## What changes for customers

**Nothing user-visible in this release.** Two new endpoints are added; no existing endpoint changes shape; no UI surfaces wire to them yet.

| Surface added | Purpose |
|---|---|
| `GET /api/v1/insights/:diseaseAreaId/match-count?type=kols&<filterParams>` | Returns `{ count }` — distinct HCPs matching the filter set. Powers the live indicator on **Sociometric Summary, KOL Explorer, Benchmarking** tabs (which all share the same KOL-set semantic). Accepts the full `insightsFilterSchema` + respondent-filter params. |
| `GET /api/v1/insights/:diseaseAreaId/match-count?type=respondents&<filterParams>` | Returns `{ count }` — distinct respondents matching the filter set. Powers the indicator on **Demographics**. Accepts respondent-filter params only. Honors the same `excludeInternalEmails` per-campaign + most-recent-per-respondent dedup as `getDemographics.totalRespondents`. |
| `GET /api/v1/insights/:diseaseAreaId/kol-profile/:hcpId/match-count?<filterParams>` | Returns `{ count }` — distinct nominators of the given HCP matching the filter set. Powers the indicator on **KOL Profile drill-down**. |

## Parity contract

Each match-count endpoint MUST return the same number that the corresponding full-aggregation endpoint will return as `total` (or `totalRespondents`) under the SAME filter set. Otherwise the live indicator would lie before the user clicks Apply — the exact "page recomputed mid-thought" footgun the Apply pattern is designed to eliminate.

E2E coverage in [`e2e/api/insights-match-count.test.ts`](../e2e/api/insights-match-count.test.ts) asserts this directly: `match-count?type=kols` equals `sociometric-summary.total`, and `match-count?type=respondents` equals `demographics.totalRespondents`, on the configured test analysis. If parity drifts on any future filter change, those tests fail loudly.

## API changes

**Additive only.** Two new GET endpoints; no existing endpoint contract changes. No schema, no response-shape modifications anywhere.

## Migrations

**None.** Code-only.

## Risk

**Low.** Pure additive endpoint surface. The new code paths reuse the existing service helpers (`resolveAnalysis`, `loadAnalysisScores`, `getFilteredResponseIds`, `computeRespondentFilteredCounts`, `resolveAccessibleCampaignIds`, `loadManualInfluencerTypes`) so semantics stay aligned with the full endpoints by construction.

Worst-case scenario: a new endpoint returns wrong counts. Mitigated by the parity tests + frontend will not wire to them in this release.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green at 1.17.52 |
| API unit tests | unchanged (no service-layer signature shifted) |
| E2E full-workflow + new match-count parity tests | will run post-deploy via `tdct` |
| Manual smoke | see soak doc Phase A |

## Rollback

Redeploy `prod-rel-4.1.31` (v1.17.51). Effects:
- Two new endpoints disappear; any frontend code wiring to them (none in this release) would get 404.
- No existing surface affected.

No data destruction.

## Manual soak

The simplest verification is a direct curl from a console you can paste an auth token into:

```bash
TOKEN="<paste a valid Cognito access token>"
DA="<a configured disease area id, e.g. Dry Eye>"
CLIENT="<a client id with a KolAnalysis on that DA>"

# kols count + parity vs sociometric-summary total
COUNT=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/$DA/match-count?type=kols&clientId=$CLIENT" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['count'])")
TOTAL=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/$DA/sociometric-summary?clientId=$CLIENT&limit=5000" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['total'])")
echo "match-count.kols=$COUNT  vs  sociometric.total=$TOTAL  (expect equal)"

# respondents count + parity vs demographics.totalRespondents
COUNT=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/$DA/match-count?type=respondents&clientId=$CLIENT" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['count'])")
TOTAL=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/$DA/demographics?clientId=$CLIENT" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['totalRespondents'])")
echo "match-count.resp=$COUNT  vs  demographics.totalResp=$TOTAL  (expect equal)"
```

## See also

- Soak checks: [`prod-rel-4.1.32-soak-checks.md`](prod-rel-4.1.32-soak-checks.md)
- Predecessor: [`prod-rel-4.1.31-handoff.md`](prod-rel-4.1.31-handoff.md)
- Source ticket: [`docs/findings/insights-apply-filters-button-2026-06-16.md`](../docs/findings/insights-apply-filters-button-2026-06-16.md)
- Frontend follow-on: a subsequent release will wire the Apply Filters button + dirty-state + live count display + URL state to these endpoints, tab by tab.
