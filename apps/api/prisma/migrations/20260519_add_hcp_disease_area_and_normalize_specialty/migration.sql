-- Specialty/sub-specialty rework:
--   * Specialty is binary (Optometrist | Ophthalmologist).
--   * Sub-specialty is multi-select and unified with DiseaseArea (same list
--     that scopes campaigns/analyses) — no parallel taxonomy.
--   * New HcpDiseaseArea join (decision (a) unify).
--   * Hcp.subSpecialty legacy column retained for one release; will drop later.
--
-- Idempotent per convention (may be applied via raw psql, re-runnable).

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
INSERT INTO "DiseaseArea" ("id", "therapeuticArea", "name", "code", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'Oncology', 'Medical Oncology', 'MEDICAL_ONCOLOGY', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
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
INSERT INTO "HcpDiseaseArea" ("id", "hcpId", "diseaseAreaId", "isPrimary", "createdAt")
SELECT gen_random_uuid()::text, h."id", da."id", true, CURRENT_TIMESTAMP
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

-- Hcp.subSpecialty column intentionally kept as legacy for one release
-- (admin can re-curate via the new multi-select); will drop in a follow-up.
