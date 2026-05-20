-- Reverse-canonicalize Hcp.specialty + Specialty to FIELD-form
-- (Optometry / Ophthalmology — matches DiseaseArea naming + data-team
-- source-of-truth notation).
--
-- v1.15.30 (prod-rel-3.2) had canonicalized to role-form (Optometrist /
-- Ophthalmologist). After prod-team review with the data team, the consensus
-- is that field-form is the correct canonical: it matches the DiseaseArea
-- naming convention (Dry Eye, Glaucoma, Cornea, Retina, Medical Oncology —
-- all field-form, not -ist forms), and the data team's correction notes /
-- NPI lookup outputs / import sheets all use field-form. This migration
-- ships in v1.15.31 (prod-rel-3.3) alongside the schema/code flip in
-- packages/shared/src/schemas/hcp.ts (HCP_SPECIALTIES → ['Optometry',
-- 'Ophthalmology']).
--
-- Idempotent per convention. Re-run is a no-op.
--
-- Combined with the Specialty rename (step 2) and the transitional CHECK
-- constraint (step 3) so the entire flip lands atomically.

-- 1. Reverse Hcp.specialty values: role-form → field-form.
--    Pre-check on prod (per the team report): 11,194 rows in role-form,
--    population dominated by Optometrist (~5,300) and Ophthalmologist
--    (~5,000). Trivial UPDATE — single-pass, sub-second.
--    Idempotent via `<> 'Optometry'` / `<> 'Ophthalmology'` guards.
UPDATE "Hcp" SET "specialty" = 'Optometry',     "updatedAt" = CURRENT_TIMESTAMP
 WHERE "specialty" = 'Optometrist';
UPDATE "Hcp" SET "specialty" = 'Ophthalmology', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "specialty" = 'Ophthalmologist';

-- 2. Reverse the Specialty row renames from 20260519.
--    Per the prod team's analysis there were 2 real rows renamed (Optometrist,
--    Ophthalmologist); flip them back. Idempotent via `<>` guards.
UPDATE "Specialty"
   SET "name" = 'Optometry', "code" = 'OPTOMETRY', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "name" = 'Optometrist';
UPDATE "Specialty"
   SET "name" = 'Ophthalmology', "code" = 'OPHTHALMOLOGY', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "name" = 'Ophthalmologist';

-- 3. Defense-in-depth: CHECK constraint on Hcp.specialty.
--    Independent of the canonical flip, the prod team flagged that 4 HCPs
--    were created post-3.2 with non-canonical values via a write path that
--    bypassed createHcpSchema (the bulk-CSV-import path at hcp.service.ts:521
--    — fixed in this same release to call normalizeHcpSpecialty per row).
--    The CHECK is belt-and-suspenders so even a future direct Prisma write
--    or script can't slip an invalid value in.
--
--    BLACKLIST shape (not whitelist) because the column has pre-existing
--    legitimate out-of-domain values: ~38 'Oncology' rows + a few E2E
--    fixtures, all intentionally left as legacy in 20260519 (per the
--    "values like Oncology come back as null on the form, kept on the
--    legacy DB column" decision). A whitelist would either drop those
--    rows or hard-code an ad-hoc legacy list that grows over time.
--    Instead we forbid the SPECIFIC bad values: the old role-form
--    (Optometrist/Ophthalmologist) which is what the bypass code path
--    actually emits. NULL stays allowed throughout.
--
--    Deploy-window note: App Runner does rolling deploys, so v1.15.30
--    instances (old code, old enum 'Optometrist'/'Ophthalmologist') may
--    try to write role-form for a few minutes while v1.15.31 rolls out.
--    Those writes will 500 here — small, retry-able, self-resolving as
--    the new code finishes deploying. Trade-off: a few minutes of
--    occasional 500s vs shipping the defense-in-depth a release later.
--
--    Idempotent via DO block (no `ADD CONSTRAINT IF NOT EXISTS` in
--    Postgres — convention from CLAUDE.md).
DO $$ BEGIN
  ALTER TABLE "Hcp" ADD CONSTRAINT "Hcp_specialty_not_role_form"
    CHECK ("specialty" IS NULL OR "specialty" NOT IN ('Optometrist', 'Ophthalmologist'));
EXCEPTION WHEN duplicate_object THEN null; END $$;
