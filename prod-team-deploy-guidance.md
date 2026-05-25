# Prod team deploy guidance — prod-rel-4.0 + prod-rel-4.1.1 + prod-rel-4.1.2

> **2026-05-25 update — `prod-rel-4.1.4` (v1.17.3) ready:** UI-only patch on the Insights surface — Clear filters reworked + applied to all 5 filter bars (2 of which had no Clear button at all), sidebar nav reorganized so the previously-disabled Insights link is now live under a "KOL Insights" collapsible parent. No backend changes, no migrations, low-risk 1-2 day soak. See the "prod-rel-4.1.4 patch release" section at the bottom. **Bundles 4.1.3 + 4.1.2 forward** — deploying 4.1.4 deploys the full ladder.
>
> _Earlier 2026-05-25: P1 hotfix `prod-rel-4.1.3` (v1.17.2) shipped — HCP CSV upload had been 503-ing every upload since 4.1.1. Section retained below._
>
> _2026-05-22: prod-rel-4.0 + prod-rel-4.1.1 LIVE + soaking; 4.1.2 (v1.17.1) tagged with 3 small fixes; supersession history kept in sections below._

**Two tags queued for prod. Deploy in this order.** Both complete the Phase 3 arc (campaign-scoring teardown → KOL Analysis as the singular scoring surface). After both ship + soak, no further releases queued.

---

## Deploy sequence

### Step 1 — prod-rel-4.0 (v1.16.0) — Phase 3 PR A, code-only, reversible

- **Tag:** [`prod-rel-4.0`](https://github.com/PreDiCaInc/kol360/releases/tag/prod-rel-4.0) → commit [`4dc3ce4`](https://github.com/PreDiCaInc/kol360/commit/4dc3ce4)
- **Migrations:** None. Code-only release.
- **What's removed:** Campaign-level scoring endpoints (`/score-config`, `/scores/calculate-*`, `/hcps/recalculate-composites`), the per-campaign Score Config + Survey Scores workflow steps, the `Recalculate Composites` button on `/admin/hcps/scores`.
- **What's preserved:** `CompositeScoreConfig` table + the 4 vestigial computed columns on `HcpCampaignScore` / `HcpDiseaseAreaScore` still exist in PR A — that's intentional. Code-only PR is reversible (redeploy v1.15.31 and everything works). The schema drops come in PR B.
- **Customer-facing change:** `/admin/campaigns/[id]/scores` returns a redirect to `/admin/kol-analysis` (polite, lossless).
- **Soak guidance:** [prod-rel-4.0-soak-checks.md](docs/releases/prod-rel-4.0-soak-checks.md) — 3-phase checklist. Recommend a brief soak (1-2 days) before moving to 4.1.1.

### Step 2 — prod-rel-4.1.1 (v1.17.0) — Phase 3 PR B + v1.15.32, schema drops, IRREVERSIBLE

- **Tag:** [`prod-rel-4.1.1`](https://github.com/PreDiCaInc/kol360/releases/tag/prod-rel-4.1.1) → commit [`4a0b5d0`](https://github.com/PreDiCaInc/kol360/commit/4a0b5d0)
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
- **Soak guidance:** [prod-rel-4.1.1-soak-checks.md](docs/releases/prod-rel-4.1.1-soak-checks.md) — 3-phase checklist. Recommend 5-7 business days for the irreversible release.

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

For prod-rel-4.1.1 specifically: rollout-window risk is **lower than 3.3** because no code path in 4.0 emits non-canonical specialty values anymore. The v1.15.31 normalizer fix has been live since prod-rel-3.3, so all write paths are canonical. Default "migrate-first" order is fine here.

---

## Quick reference

| Tag | Version | Risk | Migrations | Soak doc |
|---|---|---|---|---|
| `prod-rel-4.0` | v1.16.0 | Code-only, reversible | None | [prod-rel-4.0-soak-checks.md](docs/releases/prod-rel-4.0-soak-checks.md) |
| `prod-rel-4.1.1` | v1.17.0 | **Irreversible** schema drops | 2 in chronological order | [prod-rel-4.1.1-soak-checks.md](docs/releases/prod-rel-4.1.1-soak-checks.md) |

Handoff docs with more detail:
- [prod-rel-4.0-handoff.md](docs/releases/prod-rel-4.0-handoff.md)
- [prod-rel-4.1.1-handoff.md](docs/releases/prod-rel-4.1.1-handoff.md)

After 4.1.1 soaks: Phase 3 arc is done. Then deploy `prod-rel-4.1.2` for the 4 patch fixes (see below).

---

## prod-rel-4.1.2 (v1.17.1) — patch release for items flagged during 4.1.1 soak

**Status:** Tagged + verified on test 2026-05-22. Ready for prod deploy.
- **Tag:** [`prod-rel-4.1.2`](https://github.com/PreDiCaInc/kol360/releases/tag/prod-rel-4.1.2) → commit [`f2922d8`](https://github.com/PreDiCaInc/kol360/commit/f2922d8)
- **Handoff doc:** [prod-rel-4.1.2-handoff.md](prod-rel-4.1.2-handoff.md)
- **Soak doc:** [prod-rel-4.1.2-soak-checks.md](prod-rel-4.1.2-soak-checks.md) — 3-phase checklist, recommend 2-3 day soak

Standalone patch — no migrations.

### What's in it

1. **Segment-score importer dedup** (P2 — your 2026-05-22 report)
   - `apps/api/src/services/hcp.service.ts`: dedupe `(npi, diseaseAreaId)` rows before phase 3 categorization. Last row wins. New `deduped` count in the response so customers see what collapsed.
   - E2E regression: `e2e/api/segment-import-dedup.test.ts` — CSV with Alice twice → expect `deduped=1`, `created+updated=2`, no errors.

2. **Admin `/health/status` widget** (P3 — your 2026-05-22 report — 2-bug compound)
   - `apps/web/src/app/api/health/status/route.ts`: forward `HEALTH_CHECK_TOKEN` as `Authorization: Bearer ${token}` to backend's `/health/full`.
   - `apps/api/src/routes/health.ts`: flip the strict-equality gate (`NODE_ENV === 'production'`) to a dev allowlist (`!['development', 'test'].includes(NODE_ENV)`). Means staging now enforces the token check too — surfaces this class of bug in test before prod.

3. **Insights "Clear filters" button** (UX — customer feedback via your 2026-05-22 report)
   - `apps/web/src/components/insights/global-filters.tsx`: outline variant + `"Clear filters"` full label + drop muted-foreground class. Now visible.

### Migrations: **none**

Code-only patch. Reversible (redeploy 4.1.1 if anything regresses).

### AWS env var change (you own)

After/during 4.1.2 deploy, set `HEALTH_CHECK_TOKEN` on the **test** App Runner service (`kol360-api-test`) so the proxy works end-to-end on staging. Same value as prod's (or rotate both — see the rotation note below). Without this, the staging admin status widget will go red after fix-2 lands.

### Token rotation note

If you ever rotate `HEALTH_CHECK_TOKEN`, both places must update in lockstep:
- App Runner backend env var (prod: kol360-api; test: kol360-api-test)
- `apps/web/.env.production`

Worth a check at the cutover review gate per release.

### Quick reference (updated)

| Tag | Version | Risk | Migrations | Soak doc |
|---|---|---|---|---|
| `prod-rel-4.0` | v1.16.0 | Code-only, reversible | None | [prod-rel-4.0-soak-checks.md](docs/releases/prod-rel-4.0-soak-checks.md) |
| `prod-rel-4.1` | (fossil) | — | — | (do not deploy) |
| `prod-rel-4.1.1` | v1.17.0 | Irreversible schema drops | 2 in chronological order | [prod-rel-4.1.1-soak-checks.md](docs/releases/prod-rel-4.1.1-soak-checks.md) |
| `prod-rel-4.1.2` | v1.17.1 | Code-only, reversible | None | [prod-rel-4.1.2-soak-checks.md](prod-rel-4.1.2-soak-checks.md) |
| `prod-rel-4.1.3` | v1.17.2 | Code-only, reversible — P1 hotfix | None | [prod-rel-4.1.3-soak-checks.md](prod-rel-4.1.3-soak-checks.md) |
| **`prod-rel-4.1.4`** | **v1.17.3** | **UI-only, reversible** | **None** | [prod-rel-4.1.4-soak-checks.md](prod-rel-4.1.4-soak-checks.md) |

---

## prod-rel-4.1.4 (v1.17.3) — Insights UI rework: Clear filters consistency + KOL Insights nav grouping

**Status:** Ready for prod deploy. UI-only, low risk.
- **Tag:** `prod-rel-4.1.4` → commit on `main` (cut after the docs PR merges)
- **Handoff doc:** [prod-rel-4.1.4-handoff.md](prod-rel-4.1.4-handoff.md)
- **Soak doc:** [prod-rel-4.1.4-soak-checks.md](prod-rel-4.1.4-soak-checks.md) — 2-phase checklist, recommend **1-2 day soak**
- **Bundles forward:** all of 4.1.3 + 4.1.2 (deploy 4.1.4 directly — no need to step through)

No migrations. No backend changes. Reversible (redeploy 4.1.3 if anything regresses).

### What's in it

1. **Insights "Clear filters" rework** (customer feedback — second recurrence)
   - New shared `FilterClearControls` component (`apps/web/src/components/insights/shared/filter-clear-controls.tsx`): prominent right-anchored Clear button with count badge + removable chip row below the filter inputs.
   - Applied consistently to all 5 insights filter bars: global filters, Demographics, Dynamic Benchmarking, Total Weighted Score (KOL Explorer), Sociometric Leaders. The last two had **no Clear button at all** before 4.1.4.

2. **Sidebar nav — KOL Insights grouping**
   - Disabled "Insights" link now enabled.
   - "Insights" + "KOL Analyses" grouped under a new collapsible "KOL Insights" parent with verb-pair children ("View" → `/admin/dashboards`, "Configure" → `/admin/kol-analysis`). Resolves the long-standing naming clash with the top-level "Dashboard" (program overview).
   - CLIENT_ADMIN sees View only — Configure is platform-admin territory.

### Migrations: **none**

Code-only patch. Reversible (redeploy 4.1.3).

---

## prod-rel-4.1.3 (v1.17.2) — P1 hotfix for HCP CSV import 503 + Insights Dashboard silent-zero class

**Status:** Tagged + verified on test 2026-05-25. **Deploy ahead of 4.1.2 soak schedule.**
- **Tag:** [`prod-rel-4.1.3`](https://github.com/PreDiCaInc/kol360/releases/tag/prod-rel-4.1.3) → commit [`3516fe7`](https://github.com/PreDiCaInc/kol360/commit/3516fe7)
- **Handoff doc:** [prod-rel-4.1.3-handoff.md](prod-rel-4.1.3-handoff.md)
- **Soak doc:** [prod-rel-4.1.3-soak-checks.md](prod-rel-4.1.3-soak-checks.md) — 3-phase checklist, recommend 2-3 day soak
- **Bundles forward:** all of 4.1.2 (no need to deploy 4.1.2 separately)

Code-only patch. No migrations.

### What's in it

1. **HCP CSV import P1 hotfix** (your 2026-05-25 report — multiple admins blocked)
   - `apps/api/src/services/hcp.service.ts`: deleted the local credential-form normalizer (`normalizeSpecialty` → MD/DO/OD output). All 3 write paths (CREATE/UPDATE/MERGE) now normalize via the canonical `normalizeHcpSpecialty` at the validation phase. Unrecognized inputs land as per-row errors instead of crashing the batch with 503.
   - E2E regression: `e2e/api/hcp-import-update-specialty.test.ts` — parameterized over 10 recognized input forms + 4 unrecognized.

2. **Insights Dashboard silent-zero class (P2 — latent ~2 months)**
   - Backend: 5 analysis-backed endpoints (`summary`, `kol-explorer`, `leader-rankings`, `kol-profile`, `sociometric-summary`) return **400** when `clientId` is missing (was: silent `{0,0,0, notConfigured:true}` shape that hid 5 frontend prop-forwarding bugs).
   - Frontend: `useKolExplorer` signature standardized; all 5 analysis-backed hooks gated on `enabled: !!clientId`; `ScoreTableView` / `ProfileView` / `KolExplorerTab` forward `clientId` end-to-end.
   - UI cleanup: duplicate "Demographics At A Glance" tiles removed from IntroductionTab (already render in the dashboard header).

3. **"Clear filters" button consistency (UX)**
   - Demographics + Leader Rankings filter bars match the v1.17.1 global-filters fix (outline variant + explicit "Clear filters" label).

### Migrations: **none**

Code-only patch. Reversible (redeploy 4.1.2 if anything regresses — but rollback returns the P1).

### What changed in our dev process as a result

The HCP P1 went undetected for ~2 months because the E2E suite tested only the CREATE write path with canonical inputs — no test exercised the UPDATE/MERGE paths or the role-form/credential-form inputs. We've added a process gate in [`CONTRIBUTING.md`](CONTRIBUTING.md): **any migration that adds a CHECK / UNIQUE / FK constraint now requires paired compatibility + rejection tests** before the PR is merged. Reference implementation: `e2e/api/hcp-import-update-specialty.test.ts`.

After all four (4.0 → 4.1.1 → 4.1.2) soak: campaign-scoring teardown + specialty enforcement + the 4.1.1 soak follow-ups all done. Nothing else queued.
