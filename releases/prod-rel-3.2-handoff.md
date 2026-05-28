# prod-rel-3.2 — Handoff to Prod Team

**Status:** Ready for prod deploy + soak.
**Tag:** [`prod-rel-3.2`](https://github.com/PreDiCaInc/kol360/releases/tag/prod-rel-3.2) → commit [`6334d2e`](https://github.com/PreDiCaInc/kol360/commit/6334d2e) on `main`.
**Supersedes:** `prod-rel-3.1` (kept as audit fossil — the "caught in review" snapshot; do **not** deploy 3.1).

## Your finding was right

The UUID-vs-cuid bug you flagged was real and would have bitten the admin form paths exactly where you said:
- `Campaign` create with `diseaseAreaId`
- `Hcp` create with `diseaseAreaIds`
- `KolAnalysis` create with `diseaseAreaId`

All three are validated by `z.string().cuid()` in `packages/shared/src/schemas/`. The seeded Medical Oncology DA (and the ~10K backfilled `HcpDiseaseArea` rows) would have failed Zod parsing — admin form returns 400 with "Invalid: cuid" on the DA id.

Caught **before** prod-rel-3.1 was deployed, so prod never saw the bad IDs. Thank you.

## What changed in prod-rel-3.2

Single-file fix in [`apps/api/prisma/migrations/20260519_add_hcp_disease_area_and_normalize_specialty/migration.sql`](https://github.com/PreDiCaInc/kol360/blob/main/apps/api/prisma/migrations/20260519_add_hcp_disease_area_and_normalize_specialty/migration.sql):

1. **One `pg_temp.cuid_like()` helper** defined at the top — used at all 4 ID-generation sites (Medical Oncology DA INSERT, HcpDiseaseArea backfill INSERT, plus the two heal-loop UPDATEs). `pg_temp` is session-scoped → no schema artifact. Pattern matches the SOT import script's helper.

2. **HEAL block at the bottom** — rewrites any pre-existing UUID-shaped Medical Oncology DA id or `HcpDiseaseArea.id` to cuid-shape, in place. The DA UPDATE cascades to `HcpDiseaseArea.diseaseAreaId` via the existing `ON UPDATE CASCADE` on the FK. Idempotent on re-run via `WHERE position('-' IN id) > 0`. **No-op on a freshly-applied prod DB** (your case — Medical Oncology hasn't been seeded yet there). The HEAL block is defense-in-depth in case anyone ever runs the migration twice or partially.

Functional surface unchanged from what you'd reviewed in prod-rel-3.1:
- HCP × DiseaseArea unify (form + multi-select sub-specialty filter on `/admin/hcps`)
- Nominations workflow: inline accept link per row, bulk-accept with `<90%` confirmation modal, Create-New-HCP inside review dialog
- E2E test-design fix (dynamic DA discovery; sweep for hardcoded prod IDs)

## Test environment verification

- `pnpm test:workflow:test` against test env: **155/155 pass** post-deploy.
- Test DB before fix: Medical Oncology DA = `488d13da-be3c-...` (UUID), 7 UUID-shaped HcpDiseaseArea rows.
- After applying corrected migration via `psql -v ON_ERROR_STOP=1 -f migration.sql`: Medical Oncology DA = `cm075b7d645818ebcf4e56854` (25-char cuid), all 8 HcpDiseaseArea rows cuid-shaped, FK link to Medical Oncology preserved across the cascade rewrite.

## How to deploy

Your existing process. If you apply migrations via raw `psql` (per your usual pattern), the migration's idempotent so it's safe to run more than once if needed. The HEAL block is safe to re-run too — `WHERE position('-' IN id) > 0` keeps it from touching anything cuid-shaped.

## Soak checks

[`prod-rel-3.2-soak-checks.md`](prod-rel-3.2-soak-checks.md) — scoped to **only what's actually new vs. v1.15.28 (prod-rel-3.0)**. Three phases:

- **Phase A** — Migration verification (5 SQL queries + drift check, ~5 min). Includes a new **A1.5 ID-shape sanity** step specifically for this fix — confirms Medical Oncology DA + all HcpDiseaseArea rows are cuid-shaped post-apply. If A1.5 fails, the HEAL block rewrites them on the next re-apply.
- **Phase B** — Steward-driven smoke (HCP form, nominations workflow, KOL Analysis regression).
- **Phase C** — Continuous CloudWatch + survey portal sanity.

Rollback criteria + procedure: in the same doc.

## Related — heads-up (no action needed from you)

While sweeping for the same class of bug in other migrations, found **`20241225_add_specialty_model`** has the same UUID-shaped seed pattern for `Specialty.id` + `HcpSpecialty.id`. **Latent — not biting today** (no Zod validator targets `specialtyId`, swept 35 sites). Captured as a known landmine in [`latent-cuid-bugs-finding.md`](../findings/latent-cuid-bugs-finding.md). The heal will fold into the upcoming **Phase 3 PR A** (`20260520_heal_specialty_cuid_ids/migration.sql`) — same `pg_temp.cuid_like()` HEAL pattern, ~2-5 rows touched on prod. You'll see that come through when we ship Phase 3 (campaign-scoring teardown) — no rush, no separate hotfix, riding on the Phase 3 ship.

## Next on our side (in parallel with your soak)

Starting Phase 3 PR A (campaign-scoring teardown). Code-only, reversible, no destructive schema changes — the only migration is the additive Specialty heal mentioned above. Your soak on prod-rel-3.2 doesn't block our authoring. We'll wait for your soak result before shipping Phase 3.

Reach out if anything in Phase A or B looks off.
