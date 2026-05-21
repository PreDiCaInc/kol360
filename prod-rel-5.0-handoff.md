# prod-rel-5.0 — Handoff to Prod Team

**Status:** Ready for prod deploy + soak.
**Tag:** [`prod-rel-5.0`](https://github.com/PreDiCaInc/kol360/releases/tag/prod-rel-5.0) → commit [`0aa82cb`](https://github.com/PreDiCaInc/kol360/commit/0aa82cb) on `main`.
**Supersedes:** `prod-rel-4.0` (v1.16.0) — Phase 3 PR A. This release completes the Phase 3 arc.

## What this is

**Two-part release in one tag:** Phase 3 PR B (the irreversible campaign-scoring schema teardown) **plus** v1.15.32 (Specialty enforcement hardening). Five commits, four concerns:

1. **Schema drops** — DROP TABLE `CompositeScoreConfig` + 4 vestigial computed columns
2. **Service repoints** — `lite-client`, `dashboard`, `hcp`, `campaign` services now read from `HcpAnalysisScore` (not the dropped columns)
3. **Specialty enforcement** — strict whitelist CHECK constraint + Zod-bypass fixes + cleanup of historical test pollution
4. **E2E cleanup-script leak plugged** — the script bug that accumulated 20 'Import TestHCP' pollution rows on prod over ~2 months

This was the workstream we held for prod-rel-4.0 (v1.16.0) to deploy + soak first. **prod-rel-4.0 may or may not have actually deployed yet to your prod** — that's worth confirming before deploying 5.0. If 4.0 isn't live, deploy 4.0 first (the code-only campaign-scoring removal), let it soak briefly, *then* 5.0 (the schema drops + lite-client repoint).

## Migrations to apply (in order)

```bash
psql -v ON_ERROR_STOP=1 -f apps/api/prisma/migrations/20260521_phase3_pr_b_drop_legacy_scoring/migration.sql
psql -v ON_ERROR_STOP=1 -f apps/api/prisma/migrations/20260521_cleanup_test_pollution_tighten_specialty_check/migration.sql
```

Both idempotent. Pre-cutover snapshot strongly recommended — the first migration is **irreversible** (DROP TABLE + DROP COLUMN; data in those columns is gone).

### Migration 1: `20260521_phase3_pr_b_drop_legacy_scoring`

```sql
DROP TABLE IF EXISTS "CompositeScoreConfig" CASCADE;
ALTER TABLE "HcpCampaignScore" DROP COLUMN IF EXISTS "scoreSurvey";
ALTER TABLE "HcpCampaignScore" DROP COLUMN IF EXISTS "compositeScore";
ALTER TABLE "HcpDiseaseAreaScore" DROP COLUMN IF EXISTS "scoreSurvey";
ALTER TABLE "HcpDiseaseAreaScore" DROP COLUMN IF EXISTS "compositeScore";
```

**Preserved:** the 8 objective columns on `HcpDiseaseAreaScore` (`scorePublications`, `scoreClinicalTrials`, `scoreTradePubs`, `scoreOrgLeadership`, `scoreOrgAwards`, `scoreConference`, `scoreSocialMedia`, `scoreMediaPodcasts`) + `totalNominationCount` + SCD bookkeeping. These are the canonical objective-score store, still actively populated by segment CSV import and live-pulled by the KOL Analysis composite recompute.

### Migration 2: `20260521_cleanup_test_pollution_tighten_specialty_check`

Three steps:

1. **UPDATE** the 3 seeded E2E HCPs (Alice/E2E/Carol) — `specialty='E2E Test Oncology Specialist'` → `'Optometry'`. Baseline fixtures, kept (not deleted).
2. **DELETE** pollution rows by `email LIKE 'import.test%@e2etest.example.com' OR (firstName='Import' AND lastName='TestHCP')`. **Verified on prod: 22 rows** (20 'Oncology' + 2 NULL). All zero active FK refs — orphans from the cleanup-script leak.
3. **DROP** `Hcp_specialty_not_role_form` (blacklist), **ADD** `Hcp_specialty_check` (whitelist: `specialty IS NULL OR IN ('Optometry', 'Ophthalmology')`).

After step 3, ANY future write of a non-canonical specialty fails at the DB. Defense-in-depth — closes the bypass class permanently.

## Customer-facing changes you should know

### 1. lite-client portal — semantic shift (the big one)

**Before:** lite client showed disease-area-wide composite + survey scores (the old `publishScores()` averaging that motivated KOL Analysis in the first place).

**After:** lite client shows per-`(client, DA)` analysis scores — pooled normalization across the included campaigns, per-analysis weights. Same data the `/admin/kol-analysis` dashboard shows; same calculation.

**For a customer like Sun Pharma viewing their Dry Eye lite portal**, this is more accurate (their analysis, their weights, their campaigns). But the actual numbers will shift relative to what they saw on `prod-rel-4.0`-and-earlier (which read the averaged values). Worth a heads-up to anyone monitoring those dashboards day-to-day.

**Failsafe:** if a `(client, DA)` pair doesn't have a KolAnalysis configured, the lite-client API returns `{ ..., notConfigured: true, data: [] }` instead of erroring. The frontend can show "Contact admin to configure" — same pattern as the insights dashboard.

### 2. Specialty enforcement is now stricter

- Old role-form values (`'Optometrist'`, `'Ophthalmologist'`) — rejected at the DB layer with `Hcp_specialty_check`.
- Out-of-domain values (`'Cardiology'`, `'Oncology'`) — also rejected.
- Only `'Optometry'`, `'Ophthalmology'`, or `NULL` accepted on `Hcp.specialty`.
- Bulk CSV import normalizes whatever the CSV has via the shared `normalizeHcpSpecialty()` helper — OD/MD/DO/Optometrist/Ophthalmologist/Optometry/Ophthalmology all map to canonical; anything else becomes NULL (with a clearer error message than before).
- Nomination create-HCP path now uses the strict Zod enum — old-form values return clean 400 instead of raw Prisma errors.

### 3. HCP detail page (`/admin/hcps/<id>`)

Per-disease-area `scoreSurvey` and `compositeScore` columns drop from the display (the underlying columns are gone). Per-analysis scores live on `/admin/kol-analysis/<id>` — the canonical place to see them.

### 4. Campaign workflow (already changed in prod-rel-4.0)

`/admin/campaigns/[id]/scores` redirects to `/admin/kol-analysis` (no change vs 4.0).

## Test environment verification

| Check | Result |
|---|---|
| Migration 1 applied | DROP TABLE + 4 ALTER TABLE DROP COLUMN, exit 0 |
| Migration 2 applied | UPDATE 3, DELETE 46, CHECK swap clean |
| Test DB post-state | 5,307 Optometry + 4,872 Ophthalmology. **Zero non-canonical.** 3/3 seeded HCPs intact. |
| Enforcement test (write `'Optometrist'`) | ✓ ERROR violates `Hcp_specialty_check` |
| Enforcement test (write `'Cardiology'`) | ✓ ERROR violates `Hcp_specialty_check` |
| Both migrations idempotent (re-run) | ✓ all NOTICEs, exit 0 |
| Shared unit tests | 162/162 |
| API unit tests | 210/210 |
| Web build | green |
| E2E full workflow vs test env (v1.17.0) | (running now — will update before deploy) |

## Process note from your 2026-05-21 bug report

For future CHECK-constraint migrations: **deploy code first, then run migration.** Reverses the default "migrate first" order. The new code only produces canonical values, so the constraint can go live without a window where stale-tab users hit it with values the old code still emits. The Jen Pikor incident is documented + captured to memory.

For this release (5.0): rollout-window risk is lower than 3.3 because **no code path in v1.16.0/4.0 emits non-canonical specialty values anymore** (the v1.15.31 normalizer fix + 4.0 hasn't added any new bypass). So the default migrate-first order is fine here.

## Soak checks

[`prod-rel-5.0-soak-checks.md`](prod-rel-5.0-soak-checks.md) — 3-phase checklist scoped to what 5.0 changes vs `prod-rel-4.0`. Phase A covers migration verification, Phase B covers the customer-visible surfaces (lite client semantic shift, HCP detail page, specialty enforcement), Phase C is continuous CloudWatch watch.

## What's next on our side

After 5.0 soaks cleanly: **Phase 3 is done.** No queued workstream behind it. Outstanding minor items:

- Migration baseline reconciliation (`_prisma_migrations` table is stale on both envs — not blocking anything, housekeeping for whenever).
- (Optional) UX bonus from your 5.21 report: wrap remaining raw Prisma errors as friendly 400s. Lower priority now since the CHECK-constraint paths can't be reached via the fixed write paths.

## The arc, summarized

| Release | Tag | What |
|---|---|---|
| v1.15.28 | prod-rel-3.0 | KOL Analysis Phases 1+2 LIVE |
| v1.15.29 | prod-rel-3.1 (fossil) | Caught pre-deploy: cuid generator bug |
| v1.15.30 | prod-rel-3.2 | Same scope + cuid fix |
| v1.15.31 | prod-rel-3.3 | Specialty canonical flip + bulk-import bypass + blacklist CHECK |
| v1.16.0 | prod-rel-4.0 | Phase 3 PR A — campaign-scoring code teardown (-2,503 lines) |
| **v1.17.0** | **prod-rel-5.0** | **Phase 3 PR B — schema drops + lite-client repoint + Specialty whitelist + cleanup** |

Three weeks of wall-clock, six prod releases, one P2 bug caught + fixed within a release cycle. Your soak discipline drove every catch.
