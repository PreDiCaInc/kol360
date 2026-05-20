-- Heal pre-existing UUID-shaped Specialty.id + HcpSpecialty.id rows to cuid-shape.
--
-- Background: 20241225_add_specialty_model seeded Specialty + HcpSpecialty with
-- gen_random_uuid()::text despite both columns being declared @default(cuid())
-- in schema.prisma. The shared-package Zod validators use z.string().cuid() at
-- 35 sites for FK references — none today target specialtyId, so this is latent,
-- but the trap is convention-driven: any future schema following the established
-- pattern (e.g. setHcpSpecialties { specialtyIds: z.array(z.string().cuid()) })
-- would 400 on the legacy rows.
--
-- Same class as the 20260519 Medical Oncology DA bug (fixed in v1.15.30 /
-- prod-rel-3.2). Folded into Phase 3 PR A per user direction (no separate
-- hotfix) — Phase 3 is the natural place because we're already touching
-- migrations and the prod team's already in soak mode for this class.
--
-- Idempotent. Re-running is a no-op via `WHERE position('-' IN id) > 0`.
-- HcpSpecialty.specialtyId has ON UPDATE CASCADE in the FK from 20241225, so
-- the parent UPDATE cascades to the join.

CREATE OR REPLACE FUNCTION pg_temp.cuid_like() RETURNS TEXT AS $$
  SELECT 'cm' || substr(md5(random()::text || clock_timestamp()::text), 1, 23);
$$ LANGUAGE SQL VOLATILE;

DO $$
DECLARE
  bad_row RECORD;
BEGIN
  -- Specialty: ~2 real rows on prod from the 20241225 seed (Optometrist,
  -- Ophthalmologist), plus whatever else has been added. The cascade follows
  -- the FK to HcpSpecialty.specialtyId for any links pointing at them.
  FOR bad_row IN
    SELECT id FROM "Specialty" WHERE position('-' IN id) > 0
  LOOP
    UPDATE "Specialty" SET id = pg_temp.cuid_like() WHERE id = bad_row.id;
  END LOOP;

  -- HcpSpecialty.id: defensive. Runtime-created rows are already cuid (Prisma
  -- client respects @default(cuid())), but a prod-side bulk data import could
  -- have inserted UUID-shaped rows. The PK is internal to the join — no
  -- external FK references it — so rewriting in place is safe.
  FOR bad_row IN
    SELECT id FROM "HcpSpecialty" WHERE position('-' IN id) > 0
  LOOP
    UPDATE "HcpSpecialty" SET id = pg_temp.cuid_like() WHERE id = bad_row.id;
  END LOOP;
END $$;
