# prod-rel-4.0 — Handoff to Prod Team

**Status:** Ready for prod deploy + soak.
**Tag:** [`prod-rel-4.0`](https://github.com/PreDiCaInc/kol360/releases/tag/prod-rel-4.0) → commit [`4dc3ce4`](https://github.com/PreDiCaInc/kol360/commit/4dc3ce4) on `main`.
**Supersedes:** `prod-rel-3.3` (v1.15.31). This is **Phase 3 PR A — campaign-scoring teardown** — the workstream we've been holding for the past 2 weeks while you soaked the KOL Analysis cutover.

## Why "4.0"

Bumping the prod-rel ladder to 4.x because **public API surface disappears** (`/score-config`, `/scores/calculate-*`, `/hcps/recalculate-composites`) and the campaign-setup workflow loses two steps (`Score Config` + `Survey Scores`). SemVer-honest signal that this release removes things customers/stewards might have depended on. Not a breaking schema change yet — that's PR B.

## What's gone

| Category | Removed |
|---|---|
| Backend producers | `calculateSurveyScores`, `calculateCompositeScores`, `publishScores` (the averaging bug that motivated KOL Analysis), `recalculateDiseaseAreaComposites` (the hardcoded-weights bug — plan's motivation #2) |
| Backend routes | All endpoints under `/api/v1/campaigns/:id/scores/*` (5 endpoints) + `/api/v1/hcps/recalculate-composites` |
| Backend service | `CampaignService.publish()` no longer calls the scoring methods — pure status transition now. Campaign create no longer auto-inserts a `CompositeScoreConfig` row. |
| Frontend hooks | `useScoreConfig`, `useUpdateScoreConfig`, `useResetScoreConfig`, `useCampaignScores`, `useRecalculateDiseaseAreaComposites` |
| Frontend components | `ScoreConfigForm`, the `activeStep === 'scores'` tab body on the campaign page |
| Frontend workflow | `Score Config` + `Survey Scores` steps in the campaign sidebar; `scoreConfigConfirmedAt` activate-gate; `Calculate Scores` button on the CLOSED state; `Recalculate Composites` button on `/admin/hcps/scores` |
| Shared schemas | `score-config.ts` (entire file). `DEFAULT_SCORE_WEIGHTS` + the 9-component weight schema **moved** to `kol-analysis.ts` as `DEFAULT_ANALYSIS_WEIGHTS` + `analysisWeightsSchema`. |

## What replaces it

KOL Analysis dashboard at `/admin/kol-analysis` — live since prod-rel-3.0 (v1.15.28). Per-`(client, DA)` analysis with per-analysis weights (`KolAnalysis.weightsJson`). Pooled normalization across included campaigns (the statistical fix). Auto-recalc when an included campaign transitions to `PUBLISHED`; explicit Recalculate button on the analysis page.

## What's preserved (Phase 3 PR A is code-only, reversible)

| Asset | State in PR A | Fate in PR B |
|---|---|---|
| `CompositeScoreConfig` table | Rows still readable; no new rows created post-deploy | DROP TABLE |
| `HcpCampaignScore.scoreSurvey` + `.compositeScore` | Columns exist; no writes from the deleted code path | DROP COLUMN |
| `HcpDiseaseAreaScore` (8 objective columns) | **Stays writable** — canonical objective-score store for the analysis composite live-pull | Unchanged |
| `HcpDiseaseAreaScore.scoreSurvey` + `.compositeScore` (2 vestigial computed columns) | Stay | DROP COLUMN |
| `dashboard.service.ts` `compositeScoreConfig` read | Functional (TODO comment in code) | Repointed to `KolAnalysis.weightsJson` |

PR B is **irreversible** (DROP COLUMN, DROP TABLE) and intentionally held until you confirm prod-rel-4.0 has soaked cleanly. No surprises — same arc you've seen on the previous releases.

## Folded-in: Specialty cuid heal

Per our 2026-05-20 decision (option 1), the latent `20241225_add_specialty_model` UUID-vs-cuid bug rides along in this release as migration [`20260520_heal_specialty_cuid_ids/migration.sql`](apps/api/prisma/migrations/20260520_heal_specialty_cuid_ids/migration.sql). Rewrites any UUID-shaped `Specialty.id` + `HcpSpecialty.id` rows to cuid-shape. **Verified on test:** 2 UUID-shaped Specialty rows healed in place. Same class as the 20260519 Medical Oncology DA bug fixed in v1.15.30 / prod-rel-3.2. Not biting today (no `z.string().cuid()` validator targets `specialtyId`), but closes the landmine before someone adds a validator that follows the established FK convention.

## UI changes that may surprise stewards

These are the customer-visible deltas — release-note material:

- `/admin/campaigns/[id]/scores` now **redirects** to `/admin/kol-analysis`. Bookmarks land at the new home in one hop (chose the polite redirect over a 404 per execution-day decision).
- `/admin/campaigns/[id]` sidebar loses `Score Config` (DRAFT phase) and `Survey Scores` (CLOSED phase) steps. Workflow numbering shifts up.
- `/admin/hcps/scores` loses the `Recalculate Composites` button. Per-`(client, DA)` recompute lives on the analysis page instead.
- Per-campaign Score export CSV (`POST /api/v1/campaigns/:id/export/scores`) loses `Survey Score` + `Composite Score` columns and the leading `Rank` column. Ordering switched from composite-desc to lastName-asc.

## Verification on test environment

| Check | Result |
|---|---|
| Backend builds | ✓ green |
| Shared package + types | ✓ green |
| Web build | ✓ green |
| Shared unit tests | 162/162 |
| API unit tests | 210/210 |
| E2E vs prior deploy (v1.15.31) | **150/150** — 5 removed tests match the 5 deleted endpoints (4 from Phase 6 "Score Calculation" + 1 from Phase 9 "should have scores after publication"). No regressions. |
| Specialty cuid heal migration | Idempotent re-run = exit 0, 0-row updates. Test DB Specialty rows already cuid-shape from heal. |

## How to deploy

Same as 3.3 — your existing process. Two migrations to apply in this release:
1. `20260520_canonicalize_specialty_to_field_form` — **already applied with prod-rel-3.3**, skip if already in prod.
2. `20260520_heal_specialty_cuid_ids` — new. Idempotent. Apply via `psql -v ON_ERROR_STOP=1 -f migration.sql`.

App Runner doesn't auto-run migrations — manual `psql` per the established pattern.

## Soak checks

[`prod-rel-4.0-soak-checks.md`](prod-rel-4.0-soak-checks.md) — scoped to ONLY what v1.16.0 changes vs the now-live v1.15.31 prod. Phase A covers the cuid heal verification + the migration drift check; Phase B walks through the gone-but-not-broken UI surfaces; Phase C watches CloudWatch for any 404s on the deleted endpoints (signals an external integration we didn't know about).

## What's next on our side

1. v1.16.0 soaks on your prod.
2. Once you give the go-ahead, **Phase 3 PR B**: DROP `CompositeScoreConfig`, DROP `HcpCampaignScore.scoreSurvey/compositeScore`, DROP `HcpDiseaseAreaScore.scoreSurvey/compositeScore`, repoint `dashboard.service.ts` to `KolAnalysis.weightsJson`. **Irreversible** — that's why it's its own release.
3. v1.15.32 (separate, smaller): tighten the `Hcp_specialty_not_role_form` CHECK to a strict whitelist after we're confident no legacy writers exist.

## Thanks

The whole arc — averaging-publishScores bug discovered → KOL Analysis Phases 1-2-2b shipped → campaign cutover → soak (3 releases over the last 2 weeks) → teardown — landed within ~3 weeks of total wall-clock. Your soak discipline (catching the cuid bug pre-deploy, catching the role-form/field-form mismatch, catching the bulk-import bypass) is what kept the arc clean. Every prod-team-flagged issue closed inside one release cycle.
