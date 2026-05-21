# Prod team deploy guidance — prod-rel-4.0 + prod-rel-4.1

**Two tags queued for prod. Deploy in this order.** Both complete the Phase 3 arc (campaign-scoring teardown → KOL Analysis as the singular scoring surface). After both ship + soak, no further releases queued.

---

## Deploy sequence

### Step 1 — prod-rel-4.0 (v1.16.0) — Phase 3 PR A, code-only, reversible

- **Tag:** [`prod-rel-4.0`](https://github.com/PreDiCaInc/kol360/releases/tag/prod-rel-4.0) → commit [`4dc3ce4`](https://github.com/PreDiCaInc/kol360/commit/4dc3ce4)
- **Migrations:** None. Code-only release.
- **What's removed:** Campaign-level scoring endpoints (`/score-config`, `/scores/calculate-*`, `/hcps/recalculate-composites`), the per-campaign Score Config + Survey Scores workflow steps, the `Recalculate Composites` button on `/admin/hcps/scores`.
- **What's preserved:** `CompositeScoreConfig` table + the 4 vestigial computed columns on `HcpCampaignScore` / `HcpDiseaseAreaScore` still exist in PR A — that's intentional. Code-only PR is reversible (redeploy v1.15.31 and everything works). The schema drops come in PR B.
- **Customer-facing change:** `/admin/campaigns/[id]/scores` returns a redirect to `/admin/kol-analysis` (polite, lossless).
- **Soak guidance:** [prod-rel-4.0-soak-checks.md](prod-rel-4.0-soak-checks.md) — 3-phase checklist. Recommend a brief soak (1-2 days) before moving to 4.1.

### Step 2 — prod-rel-4.1 (v1.17.0) — Phase 3 PR B + v1.15.32, schema drops, IRREVERSIBLE

- **Tag:** [`prod-rel-4.1`](https://github.com/PreDiCaInc/kol360/releases/tag/prod-rel-4.1) → commit [`0aa82cb`](https://github.com/PreDiCaInc/kol360/commit/0aa82cb)
- **Pre-cutover snapshot required.** The schema drops are irreversible — data in the dropped columns is gone for good.
- **Migrations:** 2 files, **apply in chronological order**:
  ```bash
  psql -v ON_ERROR_STOP=1 -f apps/api/prisma/migrations/20260521_phase3_pr_b_drop_legacy_scoring/migration.sql
  psql -v ON_ERROR_STOP=1 -f apps/api/prisma/migrations/20260521_cleanup_test_pollution_tighten_specialty_check/migration.sql
  ```
  Both idempotent (re-runnable safely).
- **What changes:**
  - DROP TABLE `CompositeScoreConfig` (replaced by `KolAnalysis.weightsJson`)
  - DROP 4 vestigial computed columns (`scoreSurvey`, `compositeScore`) from `HcpCampaignScore` + `HcpDiseaseAreaScore`
  - DELETE ~22 'Import TestHCP' pollution rows on prod (test-env E2E pollution — verified, all orphaned, zero FK refs)
  - UPDATE 3 seeded test fixtures: specialty → 'Optometry' (kept, not deleted)
  - Replace `Hcp_specialty_not_role_form` blacklist CHECK with strict `Hcp_specialty_check` whitelist (`Optometry` / `Ophthalmology` / NULL only)
- **What's preserved:** The 8 objective columns on `HcpDiseaseAreaScore` (`scorePublications` etc.) stay — they're canonical objective-score storage still actively populated by segment CSV import.
- **Customer-facing change worth signaling to the customer team in advance:** lite-client portal repointed from disease-area-wide averages (old `publishScores()` averaging) to per-`(client, DA)` KOL Analysis scores (pooled normalization + per-analysis weights). **Composite + survey numbers will shift.** This is the more accurate value — customers see their analysis with their weights — but it's a visible behavior change.
- **Soak guidance:** [prod-rel-4.1-soak-checks.md](prod-rel-4.1-soak-checks.md) — 3-phase checklist. Recommend 5-7 business days for the irreversible release.

---

## Migration baseline reconciliation (after both deploys)

The `_prisma_migrations` table on prod is out of date (probably missing entries from migrations applied via raw psql over the past months). On test we just reconciled 9 missing entries with no drift surprises. To do the same on prod **after both prod deploys are done**:

```bash
# From apps/api directory, with DATABASE_URL pointed at prod
cd apps/api
for mig in \
  20260514_add_pg_trgm_for_fuzzy_match \
  20260515_add_kol_analysis_scoring \
  20260518_add_optout_hcpid_index_fk \
  20260518_add_regional_leader_nomination_type \
  20260519_add_hcp_disease_area_and_normalize_specialty \
  20260520_canonicalize_specialty_to_field_form \
  20260520_heal_specialty_cuid_ids \
  20260521_phase3_pr_b_drop_legacy_scoring \
  20260521_cleanup_test_pollution_tighten_specialty_check; do
  echo "--- resolving: $mig ---"
  npx prisma migrate resolve --applied "$mig" 2>&1 | tail -3
done
```

What this does: marks each migration as "applied" in the `_prisma_migrations` table **without re-running the SQL**. (The SQL has already been applied via your raw psql runs over the past months.) This brings the Prisma bookkeeping in sync with reality.

Then verify drift:

```bash
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
```

Expected output on a clean reconciliation: a handful of `trgm` GIN indexes on the `Hcp` table + 1 on `HcpAlias` — these are the **known benign deltas** from `20260514_add_pg_trgm_for_fuzzy_match` (Prisma schema can't represent GIN indexes natively, so they look like drift but aren't). Same diff we've been documenting since prod-rel-3.0.

Anything beyond those 4 indexes = real drift, worth investigating.

---

## What's NOT changing in either release

- Customer survey portal — unchanged
- KOL Analysis dashboard — unchanged (it was the *destination* of all this teardown work; same code path it's been since prod-rel-3.0)
- Segment CSV import — unchanged (still writes the 8 objective columns to `HcpDiseaseAreaScore`)
- HCP detail page surface — minor: the `scoreSurvey` + `compositeScore` columns disappear from the per-disease-area-scores list (those columns are dropped). Per-analysis scores live on `/admin/kol-analysis` now.
- Nominations workflow — unchanged

---

## Heads-up: process note from your 2026-05-21 bug report

For future CHECK-constraint migrations: deploy code first, then run migration (reverses the default order). The new code only produces canonical values; the constraint can go live without a window where stale-tab users hit it with values the old code still emits. The Jen Pikor incident showed why.

For prod-rel-4.1 specifically: rollout-window risk is **lower than 3.3** because no code path in 4.0 emits non-canonical specialty values anymore. The v1.15.31 normalizer fix has been live since prod-rel-3.3, so all write paths are canonical. Default "migrate-first" order is fine here.

---

## Quick reference

| Tag | Version | Risk | Migrations | Soak doc |
|---|---|---|---|---|
| `prod-rel-4.0` | v1.16.0 | Code-only, reversible | None | [prod-rel-4.0-soak-checks.md](prod-rel-4.0-soak-checks.md) |
| `prod-rel-4.1` | v1.17.0 | **Irreversible** schema drops | 2 in chronological order | [prod-rel-4.1-soak-checks.md](prod-rel-4.1-soak-checks.md) |

Handoff docs with more detail:
- [prod-rel-4.0-handoff.md](prod-rel-4.0-handoff.md)
- [prod-rel-4.1-handoff.md](prod-rel-4.1-handoff.md)

After 4.1 soaks: Phase 3 arc is done. Nothing else queued.
