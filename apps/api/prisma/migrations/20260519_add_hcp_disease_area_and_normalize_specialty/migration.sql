-- Specialty/sub-specialty rework:
--   * Specialty is binary (Optometrist | Ophthalmologist).
--   * Sub-specialty is multi-select and unified with DiseaseArea (same list
--     that scopes campaigns/analyses) — no parallel taxonomy.
--   * New HcpDiseaseArea join (decision (a) unify).
--   * Hcp.subSpecialty legacy column retained for one release; will drop later.
--
-- Idempotent per convention (may be applied via raw psql, re-runnable).
--
-- NOTE on ID generation (see HEAL block below):
-- Both DiseaseArea.id and HcpDiseaseArea.id are declared @default(cuid()) in
-- schema.prisma. The shared-package Zod validators use z.string().cuid(), which
-- rejects UUID-shaped strings. A prior revision of this migration used
-- gen_random_uuid()::text for the seeded Medical Oncology DA and the backfilled
-- HcpDiseaseArea rows — those IDs would 400 any admin-form path that references
-- them (Campaign create with diseaseAreaId, HCP create with diseaseAreaIds,
-- KOL Analysis create). This revision uses cuid_like() (one helper, defined
-- once below, same shape as the SOT import script) and adds a HEAL block that
-- rewrites any UUID-shaped IDs already in the DB to cuid-shaped ones, so
-- re-running on a previously-(badly-)migrated env is self-correcting.

-- 0. cuid-shaped ID generator. pg_temp is session-scoped — auto-dropped on
--    disconnect, so this leaves no schema artifact. Used by step 2, step 6,
--    and the HEAL block. random() + clock_timestamp() are volatile per call,
--    so this returns a fresh ID per row inside a single SELECT.
CREATE OR REPLACE FUNCTION pg_temp.cuid_like() RETURNS TEXT AS $$
  SELECT 'cm' || substr(md5(random()::text || clock_timestamp()::text), 1, 23);
$$ LANGUAGE SQL VOLATILE;

-- 1. Join table for HCP ↔ DiseaseArea (sub-specialty)
CREATE TABLE IF NOT EXISTS "HcpDiseaseArea" (
    "id" TEXT NOT NULL,
    "hcpId" TEXT NOT NULL,
    "diseaseAreaId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HcpDiseaseArea_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "HcpDiseaseArea_hcpId_diseaseAreaId_key"
  ON "HcpDiseaseArea"("hcpId", "diseaseAreaId");
CREATE INDEX IF NOT EXISTS "HcpDiseaseArea_hcpId_idx"
  ON "HcpDiseaseArea"("hcpId");
CREATE INDEX IF NOT EXISTS "HcpDiseaseArea_diseaseAreaId_idx"
  ON "HcpDiseaseArea"("diseaseAreaId");
DO $$ BEGIN
  ALTER TABLE "HcpDiseaseArea" ADD CONSTRAINT "HcpDiseaseArea_hcpId_fkey"
    FOREIGN KEY ("hcpId") REFERENCES "Hcp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "HcpDiseaseArea" ADD CONSTRAINT "HcpDiseaseArea_diseaseAreaId_fkey"
    FOREIGN KEY ("diseaseAreaId") REFERENCES "DiseaseArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Seed Medical Oncology DiseaseArea (user-requested; lets the
--    Hcp.subSpecialty='Medical Oncology' value map cleanly during backfill).
--    Idempotent via the DiseaseArea_code unique index.
--    ID is cuid-shaped (NOT gen_random_uuid()) — see header note + HEAL below.
INSERT INTO "DiseaseArea" ("id", "therapeuticArea", "name", "code", "isActive", "createdAt", "updatedAt")
SELECT pg_temp.cuid_like(),
       'Oncology', 'Medical Oncology', 'MEDICAL_ONCOLOGY', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "DiseaseArea" WHERE code = 'MEDICAL_ONCOLOGY');

-- 3. Canonicalize Specialty table to the two valid values.
--    The existing rows have inconsistent codes ('OPT', 'ophthalmology');
--    rename + recode to canonical UPPERCASE forms. Idempotent via WHERE.
UPDATE "Specialty"
   SET "name" = 'Optometrist', "code" = 'OPTOMETRIST', "updatedAt" = CURRENT_TIMESTAMP
 WHERE lower("name") IN ('optometry') AND "name" <> 'Optometrist';
UPDATE "Specialty"
   SET "name" = 'Ophthalmologist', "code" = 'OPHTHALMOLOGIST', "updatedAt" = CURRENT_TIMESTAMP
 WHERE lower("name") IN ('ophthalmology') AND "name" <> 'Ophthalmologist';

-- 4. Canonicalize Hcp.specialty values to the two valid forms.
--    Pre-check (test DB, 10,211 HCPs): Optometry × 5,298 → Optometrist;
--    Ophthalmology × 4,872 → Ophthalmologist; 38 Oncology + 3 E2E-test
--    values remain legacy (out-of-domain — left untouched, not force-cast).
UPDATE "Hcp" SET "specialty" = 'Optometrist',     "updatedAt" = CURRENT_TIMESTAMP
 WHERE lower(btrim("specialty")) IN ('optometry','od','o.d.','optometrist') AND "specialty" <> 'Optometrist';
UPDATE "Hcp" SET "specialty" = 'Ophthalmologist', "updatedAt" = CURRENT_TIMESTAMP
 WHERE lower(btrim("specialty")) IN ('ophthalmology','md','do','m.d.','d.o.','ophthalmologist') AND "specialty" <> 'Ophthalmologist';

-- 5. Sub-specialty cleanup (per pre-check).
--    'Interstitial Lung Disease' is a stray non-Ophth value — null it.
UPDATE "Hcp" SET "subSpecialty" = NULL, "updatedAt" = CURRENT_TIMESTAMP
 WHERE lower(btrim("subSpecialty")) = 'interstitial lung disease';

-- 6. Backfill HcpDiseaseArea from Hcp.subSpecialty (case-insensitive name match
--    against DiseaseArea). Only inserts rows that don't already exist
--    (idempotent via the unique index).
--    ID is cuid-shaped (NOT gen_random_uuid()) — see header note + HEAL below.
INSERT INTO "HcpDiseaseArea" ("id", "hcpId", "diseaseAreaId", "isPrimary", "createdAt")
SELECT pg_temp.cuid_like(),
       h."id", da."id", true, CURRENT_TIMESTAMP
  FROM "Hcp" h
  JOIN "DiseaseArea" da
    ON lower(btrim(da."name")) = lower(btrim(h."subSpecialty"))
   AND da."isActive" = true
 WHERE h."subSpecialty" IS NOT NULL
   AND btrim(h."subSpecialty") <> ''
   AND NOT EXISTS (
     SELECT 1 FROM "HcpDiseaseArea" x
      WHERE x."hcpId" = h."id" AND x."diseaseAreaId" = da."id"
   );

-- 7. HEAL: rewrite any UUID-shaped IDs that an earlier (buggy) revision of
--    this migration left behind. CUID format has no hyphens; UUID has 4.
--    DiseaseArea.id is updated first so HcpDiseaseArea.diseaseAreaId follows
--    via the ON UPDATE CASCADE on the FK. Then HcpDiseaseArea.id (PK) is
--    rewritten in place. No-op on a freshly-applied DB.
DO $$
DECLARE
  bad_row RECORD;
BEGIN
  -- DiseaseArea: only the row this migration ever seeded (Medical Oncology).
  -- Scoped by code so we never touch other rows even if they were stamped
  -- with a UUID for unrelated reasons.
  FOR bad_row IN
    SELECT id FROM "DiseaseArea"
     WHERE code = 'MEDICAL_ONCOLOGY' AND position('-' IN id) > 0
  LOOP
    UPDATE "DiseaseArea" SET id = pg_temp.cuid_like() WHERE id = bad_row.id;
  END LOOP;

  -- HcpDiseaseArea: any UUID-shaped row (the bad migration produced these
  -- en masse during backfill). The PK is internal to the join — no external
  -- FK references it — so rewriting in place is safe.
  FOR bad_row IN
    SELECT id FROM "HcpDiseaseArea" WHERE position('-' IN id) > 0
  LOOP
    UPDATE "HcpDiseaseArea" SET id = pg_temp.cuid_like() WHERE id = bad_row.id;
  END LOOP;
END $$;

-- Hcp.subSpecialty column intentionally kept as legacy for one release
-- (admin can re-curate via the new multi-select); will drop in a follow-up.
