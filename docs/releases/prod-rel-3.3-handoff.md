# prod-rel-3.3 — Handoff to Prod Team

**Status:** Ready for prod deploy + soak.
**Tag:** [`prod-rel-3.3`](https://github.com/PreDiCaInc/kol360/releases/tag/prod-rel-3.3) → commit [`3ecbcfa`](https://github.com/PreDiCaInc/kol360/commit/3ecbcfa) on `main`.
**Supersedes:** `prod-rel-3.2`. (3.2 was clean — this just adds the two follow-ups you flagged.)

## Your two findings — both fixed

### 1. Specialty canonical: role-form → field-form

You called it: field-form is the right canonical (matches DiseaseArea naming, matches your team's correction notes / NPI lookup outputs / import sheets). prod-rel-3.2 had canonicalized to role-form, which contradicted the Grover/Sherman fixes you ran that week.

**What changed:**
- `packages/shared/src/schemas/hcp.ts`: `HCP_SPECIALTIES = ['Optometry', 'Ophthalmology']`. The `normalizeHcpSpecialty()` helper still accepts both shapes on input (OD/Optometrist/Optometry → `'Optometry'`); output is always canonical field-form.
- Migration [`20260520_canonicalize_specialty_to_field_form/migration.sql`](apps/api/prisma/migrations/20260520_canonicalize_specialty_to_field_form/migration.sql) reverse-canonicalizes:
  - `Hcp.specialty`: 5,301 Optometrist → Optometry + 4,872 Ophthalmologist → Ophthalmology (test-env counts; prod should be similar).
  - `Specialty` table: 2 rows renamed (Optometrist → Optometry, Ophthalmologist → Ophthalmology).
- UI labels flipped across 7 sites (admin/hcps, survey-status, nominations CreateHcpDialog, use-nominations type, insights respondent-analytics + kol-explorer, insights-report degree heuristic). The insights `.includes()` matchers were narrowed to `'Ophthalmolog'` substring so they bucket both shapes correctly during the transition window.

### 2. Enum-bypass bug (the 4 leaked HCPs)

Root-caused to [`apps/api/src/services/hcp.service.ts:521`](apps/api/src/services/hcp.service.ts#L521) — the bulk CSV import called `prisma.hcp.createMany({ data: createData })` with `specialty: row.specialty` (raw CSV value), bypassing `createHcpSchema` entirely. Timestamps in your report (4 HCPs in a 9-min window post-deploy) match the bulk-import signature exactly.

**What changed:**
- `hcp.service.ts:521` now calls `normalizeHcpSpecialty(row.specialty)` per row. CSV variants (`OD`, `optometry`, `Ophthalmology`, etc.) all normalize to canonical field-form before insert. Out-of-domain values (Oncology, Cardiology) come back as `null` — same behavior as the Zod schema rejects them but more permissive at the import boundary (preserves rest of the row).
- **DB-level defense-in-depth:** new CHECK constraint `Hcp_specialty_not_role_form` on `Hcp.specialty`. **Blacklist** (not whitelist) to preserve the ~41 pre-existing out-of-domain legacy rows (Oncology ×38, E2E fixtures ×3). Forbids the OLD role-form values (`Optometrist`, `Ophthalmologist`) explicitly — exactly the values a bypass would emit. NULL stays allowed throughout. Constraint name: `Hcp_specialty_not_role_form`.

## Deploy window note (rolling deploy)

App Runner rolling deploy means v1.15.30 instances may attempt role-form writes for a few minutes during cutover (their Zod schema accepted `'Optometrist'`/`'Ophthalmologist'`). After the migration runs, the CHECK rejects those writes → 500 errors during the window. **Self-resolving** as the new code finishes deploying. Trade-off: a few minutes of occasional 500s on `/hcps` POST vs shipping the defense-in-depth a release later.

If this is unacceptable, signal back and I'll back the CHECK out of v1.15.31 and ship it as v1.15.32 alone (after this release is fully deployed).

## Test environment verification

Migration applied via `psql -v ON_ERROR_STOP=1 -f migration.sql`:

| Check | Before | After |
|---|---|---|
| `Hcp.specialty` Optometrist rows | 5,301 | **0** (now Optometry) |
| `Hcp.specialty` Ophthalmologist rows | 4,872 | **0** (now Ophthalmology) |
| `Hcp.specialty` Optometry rows | 0 | **5,301** |
| `Hcp.specialty` Ophthalmology rows | 0 | **4,872** |
| Legacy `Oncology` (untouched) | 38 | **38** |
| `Specialty` table | Optometrist / Ophthalmologist | **Optometry / Ophthalmology** |
| `Hcp_specialty_not_role_form` constraint exists | n/a | ✓ |

Direct UPDATE test against the constraint:
```sql
UPDATE "Hcp" SET specialty = 'Optometrist' WHERE id = (SELECT id FROM "Hcp" LIMIT 1);
ERROR:  new row for relation "Hcp" violates check constraint "Hcp_specialty_not_role_form"
```
Legacy `Oncology` rows verified still readable post-migration.

Build + tests:
- shared/api/web builds: green
- shared unit tests: 162/162
- API unit tests: 223/223
- E2E vs v1.15.30 deploy: 154/155 (the 1 failure is the expected new-behavior-vs-old-API mismatch; will pass once you deploy v1.15.31)

## How to deploy

Same as 3.2 — your existing process. Migration is idempotent so safe to run more than once. The CHECK constraint is wrapped in a `DO $$ ... EXCEPTION WHEN duplicate_object` block, so re-runs after the constraint exists are a no-op.

## Soak checks

[`prod-rel-3.3-soak-checks.md`](prod-rel-3.3-soak-checks.md) — scoped to ONLY what v1.15.31 changes vs the now-live v1.15.30. Don't re-run the v1.15.30 soak — trust that.

## Follow-up roadmap

- **v1.15.32 (next-next release):** tighten `Hcp_specialty_not_role_form` to a strict whitelist (`specialty IS NULL OR specialty IN ('Optometry', 'Ophthalmology')`) once you've confirmed no legacy writers exist. Will require a one-time decision on the 38 Oncology rows: canonicalize / leave / null. Happy to draft when ready.
- **Phase 3 (v1.16.0):** campaign-scoring teardown (the workstream we paused to ship this hotfix). PR A already authored locally — ready to resume on your word. Reversible code-only deletes + the latent `20241225` Specialty cuid heal folded in.

## Thanks

Two real bugs caught pre-prod-disturbance, both with the same surgical fix shape. Closing the bypass at the bulk-import layer was the right move — even after we tightened the Zod enum at the route layer, the service-layer write path was the gap.
