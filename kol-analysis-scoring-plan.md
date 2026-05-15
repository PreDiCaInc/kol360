# KOL Analysis Scoring — Implementation Plan

Move KOL scoring from the **campaign** level to a curated **(client, disease area, campaign set)** analysis level. Fixes the cross-campaign normalization bug, removes hardcoded disease-area weights, and adds platform-curated campaign include/exclude with explicit recalculation.

## Why (the core bug)

Survey score today = `hcp_nom_count / max_nom_count_in_that_campaign × 100`, then `publishScores()` **averages** those per-campaign percentages across all campaigns in the disease area ([score-calculation.service.ts:385-398](apps/api/src/services/score-calculation.service.ts#L385)).

Example: Dr. Eric — **5/100** in Campaign A (5%), **55/90** in Campaign B (61%). Current output ≈ avg(5, 61) = **33%**. Correct output: pool the 60 nominations over the combined respondent base and normalize **once**. Averaging incomparable per-campaign percentages is statistically invalid.

Secondary problems fixed:
- `recalculateDiseaseAreaComposites()` uses **hardcoded** weights `10/15/10/10/10/10/5/5/25` ([score-calculation.service.ts:475-484](apps/api/src/services/score-calculation.service.ts#L475)) — ignores every client/campaign config.
- No way to curate which campaigns feed a customer dashboard (e.g. exclude a stale campaign).
- Client scoping is half-done — nominations are client-scoped but base influence scores are disease-area-wide.

## Locked decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Curation owner | **Platform admin only** (clients see curated result read-only) |
| 2 | Recalc trigger | **Explicit "Recalculate" button + auto on included-campaign publish** |
| 3 | Weights | **Per analysis** (`KolAnalysis.weightsJson`) |
| 4 | Campaign composite | **Dropped** — campaign keeps raw per-type counts only |
| 5 | Objective scores | **Live pull** from current `HcpDiseaseAreaScore` at recalc time (no snapshot) |
| 6 | Sparse HCPs | **Included**, null objective → 0 (survey-only KOLs still rank) |

## Target schema

```prisma
model KolAnalysis {
  id              String   @id @default(cuid())
  clientId        String
  diseaseAreaId   String
  name            String
  weightsJson     Json     // { weightPublications, ...8 objective..., weightSurvey }
  lastCalculatedAt DateTime?
  calcStatus      String   @default("idle") // idle | running | done | error
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  client          Client      @relation(fields: [clientId], references: [id])
  diseaseArea     DiseaseArea @relation(fields: [diseaseAreaId], references: [id])
  campaigns       KolAnalysisCampaign[]
  scores          HcpAnalysisScore[]
  @@unique([clientId, diseaseAreaId])   // one analysis per (client, DA) for v1
  @@index([diseaseAreaId])
}

model KolAnalysisCampaign {
  id          String      @id @default(cuid())
  analysisId  String
  campaignId  String
  included    Boolean     @default(true)
  analysis    KolAnalysis @relation(fields: [analysisId], references: [id], onDelete: Cascade)
  campaign    Campaign    @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  @@unique([analysisId, campaignId])
  @@index([campaignId])
}

model HcpAnalysisScore {
  id              String   @id @default(cuid())
  analysisId      String
  hcpId           String
  // pooled nomination counts + per-type normalized scores (8 types)
  countDiscussionLeaders Int @default(0)
  scoreDiscussionLeaders Decimal? @db.Decimal(5,2)
  // ...repeat for ReferralLeaders, AdviceLeaders, NationalLeader,
  //    RisingStar, SocialLeader, RegionalLeader, BiasedLeader
  scoreSurvey     Decimal? @db.Decimal(5,2)   // mean of present type scores
  compositeScore  Decimal? @db.Decimal(5,2)   // weighted objective(live) + survey
  calculatedAt    DateTime @default(now())
  analysis        KolAnalysis @relation(fields: [analysisId], references: [id], onDelete: Cascade)
  hcp             Hcp         @relation(fields: [hcpId], references: [id], onDelete: Cascade)
  @@unique([analysisId, hcpId])
  @@index([analysisId])
  @@index([hcpId])
}
```

`HcpAnalysisScore` deliberately stores **no** objective columns — objective scores are read live from `HcpDiseaseAreaScore` (decision 5).

---

## Phase 1 — Schema + recompute engine + backfill (no UI)

Independently shippable. Goal: `HcpAnalysisScore` is populated and numerically validated before any consumer is repointed.

### 1.1 Schema + migration
- Add the 3 models above to `apps/api/prisma/schema.prisma`.
- Add inverse relations on `Client`, `DiseaseArea`, `Campaign`, `Hcp`.
- `npx prisma migrate dev --name add_kol_analysis_scoring` → verify migration SQL contains all 3 tables + indexes + FKs.
- `npx prisma generate`.

### 1.2 Shared types
- `packages/shared/src/schemas/kol-analysis.ts`: Zod schema for `weightsJson` (reuse existing `DEFAULT_SCORE_WEIGHTS`), analysis DTOs.
- Export from `packages/shared/src/index.ts`.

### 1.3 Recompute engine — `kol-analysis.service.ts`

`recalculateAnalysis(analysisId)`:

1. Load analysis + `KolAnalysisCampaign` where `included = true` → `includedCampaignIds`.
2. Set `calcStatus = 'running'`.
3. Pull nominations:
   ```ts
   prisma.nomination.findMany({
     where: {
       matchStatus: { in: ['MATCHED', 'NEW_HCP'] },
       matchedHcpId: { not: null },
       response: { campaignId: { in: includedCampaignIds } },
     },
     select: { matchedHcpId: true, question: { select: { nominationType: true } } },
   })
   ```
4. Group by `matchedHcpId × nominationType`; tally pooled counts.
5. Per type: `maxPooled = max(count)` across HCPs → `typeScore = count / maxPooled × 100`. **Normalize once over the pooled set** (the fix).
6. `scoreSurvey` = mean of present type scores for the HCP.
7. Composite: live-pull `HcpDiseaseAreaScore` (`isCurrent: true`, matching `diseaseAreaId`) for each HCP; `composite = Σ(objective_i × weight_i/100) + scoreSurvey × weightSurvey/100`; null objective → 0 (decision 6).
8. Upsert `HcpAnalysisScore` per (analysisId, hcpId); delete rows for HCPs no longer present.
9. `calcStatus='done'`, stamp `lastCalculatedAt`. On throw → `calcStatus='error'`, log, rethrow.

Wrap the write in a transaction. Legacy fallback (campaigns with no `nominationType` set) — port the existing total-nomination fallback from `score-calculation.service.ts:162-221`, applied to the pooled set.

### 1.4 Backfill script — `scripts/backfill-kol-analysis.ts`
- For each distinct `(clientId, diseaseAreaId)` over existing campaigns:
  - Create `KolAnalysis` (name = `"{DiseaseArea} — {Client}"`).
  - `weightsJson` ← most recent `CompositeScoreConfig` for a campaign in that (client, DA); else `DEFAULT_SCORE_WEIGHTS`.
  - Insert `KolAnalysisCampaign` for every campaign in that (client, DA), `included = true`.
  - `recalculateAnalysis()`.
- Idempotent (skip if analysis exists). Run against test DB first.

### 1.5 Validation gate (blocking)
- Pick a real multi-campaign disease area on test. Hand-compute one HCP's pooled survey score; assert engine output matches (not the old average).
- Construct the Eric 5/100 + 55/90 fixture in a unit test; assert pooled result ≠ 33%.
- Spot-check composite vs a known `HcpDiseaseAreaScore` row using the analysis weights.

### 1.6 Tests
- Unit (`kol-analysis.service.test.ts`): pooled normalization, mean-of-types, null-objective→0, survey-only HCP included, excluded campaign drops out, empty included set.
- E2E (`e2e/api/kol-analysis.test.ts`): backfilled analysis exists; recalc endpoint returns status; scores present. (Endpoint added in 1.7.)

### 1.7 Minimal API (engine reachable, no dashboard yet)
- `routes/kol-analysis.ts`, PLATFORM_ADMIN-gated:
  - `GET  /api/v1/admin/kol-analyses` — list
  - `GET  /api/v1/admin/kol-analyses/:id` — detail + campaigns + calcStatus
  - `POST /api/v1/admin/kol-analyses/:id/recalculate` — trigger engine
- Audit-log recalc via `createAuditLog()` (the helper, not raw `prisma.auditLog.create` — see v1.15.15 fix).

### 1.8 Ship
- Version bump, `ucpm`. Migration file included. Post-merge `tdct` applies migration + runs backfill on test.

---

## Phase 2 — Dashboard reads from analysis + curation UI

- Repoint `insights-report.service.ts` reads from `HcpDiseaseAreaScore` → `HcpAnalysisScore` (resolve analysis via the dashboard's client+DA). Objective columns still join live from `HcpDiseaseAreaScore`.
- Platform-admin curation module: include/exclude campaigns on a `KolAnalysis`, per-analysis weights editor (moved from campaign Score Config), **"Recalculate"** button surfacing `calcStatus`.
- Auto-recalc hook: when an included campaign transitions to `PUBLISHED`, enqueue `recalculateAnalysis()`.
- Client dashboard: read-only curated result.
- **Constraint:** must land before Phase 3 (consumer repointed before producers removed).

## Phase 3 — Demote campaign scoring (teardown)

Only after Phase 2 verified.

- Drop `CompositeScoreConfig` model (data already migrated to `weightsJson` in 1.4).
- Strip `scoreSurvey` / `compositeScore` from `HcpCampaignScore` (keep raw per-type counts as ops/QA input).
- Delete: `routes/score-config.ts`, `services/score-config.service.ts`, `score-calculation.ts` calculate-* endpoints, `hooks/use-score-config.ts`, `hooks/use-campaign-scores.ts`, `components/campaigns/score-config-form.tsx`, `admin/campaigns/[id]/scores/page.tsx`.
- `admin/campaigns/[id]/page.tsx`: remove workflow steps `scores` (line 107) and `survey-scores` (line 111) + related handlers.
- `campaigns.ts:330 /:id/publish`: re-semantic — status transition only, no score calc/aggregation.
- Freeze `HcpDiseaseAreaScore` SCD history read-only for audit.
- Release note: campaign setup flow loses "Score Config" + "Survey Scores" steps; weights/scoring now live on the insights dashboard.

---

## Risks & rollback

- **Backfill correctness** — gated by 1.5; backfill is idempotent and additive (new tables only), so Phase 1 is safely revertible (drop new tables, no existing data touched).
- **Weight migration loss** — `CompositeScoreConfig` is *copied* to `weightsJson` in Phase 1 and only *dropped* in Phase 3; long verification window.
- **Dashboard cutover** — Phase 2 is the only behavior-visible change for clients; keep `HcpDiseaseAreaScore` intact through Phase 2 so rollback = repoint reads back.
- **Auto-recalc cost** — single-analysis recompute on publish; if heavy, move to the existing background-job pattern (decision 2 already chose explicit+publish, not on every edit).

## Sequencing constraint (do not reorder)

1. Phase 1 backfill copies weights **before** any `CompositeScoreConfig` drop.
2. Phase 2 repoints dashboard reads **before** Phase 3 removes campaign producers.
3. Phase 3 teardown last.
