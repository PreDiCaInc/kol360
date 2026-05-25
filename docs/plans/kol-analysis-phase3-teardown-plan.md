# KOL Analysis — Phase 3 Teardown Plan

Remove the now-dead **campaign-level scoring** path, leaving the analysis as the
single source of truth. Destructive and prod-ordering-gated — **do not execute
until `prod-rel-2.16` has cut over and soaked in production.**

> Status: PLAN ONLY. No code/schema changes made. Execution needs explicit
> go-ahead + the prod gate below satisfied.

---

## Hard execution gate (read first)

Phase 3 drops `CompositeScoreConfig`. Its weight data is preserved **only**
because Phase 1's backfill copies each campaign's `CompositeScoreConfig` →
`KolAnalysis.weightsJson`. That copy happens **during the `prod-rel-2.16`
cutover backfill**. Therefore:

**Phase 3 must not reach prod until `prod-rel-2.16` has been deployed to prod,
its backfill executed, and analyses verified.** Dropping `CompositeScoreConfig`
on a prod DB that hasn't run the backfill = permanent loss of every client's
weight configuration.

Additional reason to hold even on dev/main: while `prod-rel-2.16` is unreleased,
`main` must remain a viable hotfix base for it. Tearing out the old scoring path
on `main` now would mean a `prod-rel-2.16` hotfix can't touch the old code path.

**Sequence:** `prod-rel-2.16` to prod → soak (≥ the agreed window) → Phase 3 on
dev → test/E2E → its own `prod-rel-2.17` → prod (with the column/table-drop
migration ordered correctly).

---

## What is dead vs what stays (important nuance)

**Stays — do NOT touch:**
- `HcpDiseaseAreaScore` — its 8 objective columns are the **live source** for
  the analysis composite (`insights-report.service.loadObjectiveScores`,
  `kol-analysis.service.computePooled`). Leave the model entirely intact. Its
  `scoreSurvey`/`compositeScore`/SCD-publish columns merely go unused —
  harmless; not worth a risky column drop.
- `HcpCampaignScore` raw per-type **count** columns — kept as a per-campaign
  ops/QA view + raw input.
- The Phase 2a auto-recalc hook in `publish()` (campaign publish →
  `recalculateAnalysis`). Keep.

**Dead — remove:**
1. `CompositeScoreConfig` model + `Campaign.compositeScoreConfig` relation
   (schema:471, 533) → DROP TABLE migration. (Weights already in
   `KolAnalysis.weightsJson`.)
2. `HcpCampaignScore.scoreSurvey` + `HcpCampaignScore.compositeScore`
   (schema:253,255) → DROP COLUMN migration. Keep all `count*` columns.
3. `apps/api/src/routes/score-config.ts` + `services/score-config.service.ts` —
   delete; remove `scoreConfigRoutes` reg (app.ts:16,83).
4. `apps/api/src/routes/score-calculation.ts` — delete the campaign-level
   `calculate-survey` / `calculate-composite` / `calculate-all` + status
   endpoints; remove `scoreCalculationRoutes` reg (app.ts:25,90). (Survey-status
   has its own route — confirm nothing else lives in this file before deleting
   wholesale vs trimming.)
5. `score-calculation.service.ts` — remove `calculateSurveyScores`,
   `calculateCompositeScores`, `publishScores`, `recalculateDiseaseAreaComposites`.
   Pooled logic already superseded by `kol-analysis.service.computePooled`.
6. `campaign.service.publish()` (lines 292–296) — remove the
   `calculateSurveyScores` / `calculateCompositeScores` / `publishScores`
   calls. `publish()` becomes: status → PUBLISHED, then the existing analysis
   auto-recalc hook (already there, keep). No cross-campaign averaging.
7. Web: delete `admin/campaigns/[id]/scores/page.tsx`,
   `components/campaigns/score-config-form.tsx`, `hooks/use-score-config.ts`,
   `hooks/use-campaign-scores.ts`; in `admin/campaigns/[id]/page.tsx` remove the
   two workflow steps (`scores` "Score Config", `survey-scores` "Survey
   Scores") + their imports/handlers.
8. Shared: `packages/shared/src/schemas/score-config.ts` — `DEFAULT_SCORE_WEIGHTS`
   is reused by `kol-analysis.ts` (`DEFAULT_ANALYSIS_WEIGHTS = DEFAULT_SCORE_WEIGHTS`)
   and the backfill. **Keep the file** (or relocate the constant into
   `kol-analysis.ts`); only remove the now-unused per-campaign Zod
   request schemas. Verify no other importers before trimming.

---

## Migration (Phase 3's own)

Single migration, additive-safe ordering:
```sql
ALTER TABLE "HcpCampaignScore" DROP COLUMN "scoreSurvey";
ALTER TABLE "HcpCampaignScore" DROP COLUMN "compositeScore";
DROP TABLE "CompositeScoreConfig";
```
- Irreversible. The RDS snapshot in the Phase 3 prod runbook is the safety net.
- `prisma migrate dev --name phase3_drop_campaign_scoring`; verify the generated
  SQL matches the above exactly before commit (no unintended drops).
- Prod apply only after the gate above; `prisma migrate deploy` + drift check.

---

## Test / E2E impact (must update with the code)

- `full-workflow.test.ts`: Phase 6 "calculate survey/composite scores" and the
  score-config assertions will 404 — rework to assert the campaign flow no
  longer exposes scoring, and that analysis recalc is the path. Phase 9 publish:
  assert status transition + analysis auto-recalc, not campaign composite.
- Remove/great e2e api-client methods for the deleted endpoints.
- Unit: drop `score-config.service` tests; `score-calculation.service` tests
  trimmed to whatever (if anything) remains.
- `nomination.service` / `kol-analysis.service` tests unaffected.

## Build/verify checklist (at execution time)

- [ ] Prod gate satisfied (`prod-rel-2.16` live + backfilled + soaked)
- [ ] Grep for stragglers: `score-config`, `useScoreConfig`, `useCampaignScores`,
      `calculate-survey|composite|all`, `compositeScoreConfig`,
      `calculateSurveyScores|calculateCompositeScores|publishScores`
- [ ] `DEFAULT_SCORE_WEIGHTS` importers still resolve
- [ ] shared/api/web builds clean; API unit tests green; E2E updated & green
- [ ] Migration SQL reviewed = exactly the 3 statements
- [ ] Version bump; ucpm; **separate** `prod-rel-2.17`
- [ ] Phase 3 prod runbook (mirror the cutover runbook: snapshot → migrate
      deploy → drift check → deploy code → verify campaign UI gone, dashboards
      unaffected)

## Rollback

Code: redeploy `prod-rel-2.16`. **Schema is the catch** — `DROP TABLE`/`DROP
COLUMN` are irreversible; restore requires the pre-Phase-3 RDS snapshot. This is
why the prod gate + snapshot are mandatory and Phase 3 ships on its own release,
never bundled.

## User-facing change (release note)

Campaign setup loses the "Score Config" and "Survey Scores" steps. Weights +
scoring now live entirely on the KOL Analysis (insights) side. Flag in the
`prod-rel-2.17` notes.
