-- v1.15.32 work folded into v1.17.0 (PR #119): heal E2E-fixture specialty
-- values + clean up the test-pollution rows + tighten Hcp_specialty CHECK
-- from blacklist to strict whitelist.
--
-- == Background ==
-- 1. Test pollution: 'pnpm test:workflow:prod' runs over ~2 months leaked HCPs
--    onto prod via the bulk-import test fixture (firstName='Import',
--    lastName='TestHCP', email 'import.test.<unique-npi>@e2etest.example.com').
--    Pre-v1.15.31 the fixture wrote specialty='Oncology' directly. Post-v1.15.31
--    the normalizer mapped 'Oncology' → NULL. Same root cause; the cleanup-
--    script targeting only the static NPI '9990000004' left them all orphaned.
--    Verified on prod (2026-05-21): 20 'Oncology' + 2 NULL rows, all
--    'Import TestHCP', all created by the E2E test user UUID. Zero active
--    FK refs — campaigns they were attached to got cleaned previously.
-- 2. Seeded fixtures: 3 baseline E2E HCPs (Alice/E2E/Carol) have specialty
--    'E2E Test Oncology Specialist' from the seed script. The fixture string
--    won't pass the new whitelist. UPDATE the column to canonical 'Optometry'
--    (the Specialty TABLE row with that name stays — it's linked via
--    HcpSpecialty for the multi-specialty system, separate from Hcp.specialty
--    the string column). Seed script also updated in the same commit so
--    future re-seeds set the canonical value.
-- 3. CHECK tightening: v1.15.31 added 'Hcp_specialty_not_role_form' as a
--    BLACKLIST (forbid 'Optometrist', 'Ophthalmologist') because the column
--    held legacy out-of-domain rows. With cleanup + UPDATE done, we flip to
--    a strict WHITELIST: only 'Optometry', 'Ophthalmology', or NULL.
--    Defense-in-depth against ANY future bypass class (not just role-form).
--
-- == Pre-verification (2026-05-21, test DB) ==
-- - Email+name WHERE matches 46 pollution rows (38 Oncology + 8 NULL)
-- - 3 seeded fixtures (Alice/E2E/Carol) have specialty='E2E Test Oncology Specialist'
-- - After UPDATE + DELETE: zero non-canonical Hcp.specialty rows on both envs
-- - Pollution HCPs have zero CampaignHcp/Nomination/SurveyResponse refs
--   (verified — orphans only), so DELETE FROM Hcp succeeds without
--   FK-cascade complications. The seeded fixtures DO have refs and would
--   block delete (CampaignHcp_hcpId_fkey is ON DELETE RESTRICT) — that's
--   why we UPDATE the 3 fixtures rather than delete them.
--
-- == Idempotent ==
-- DELETE/UPDATE with explicit WHERE are naturally idempotent on re-run
-- (find nothing matching). CHECK swap uses DROP IF EXISTS + DO/EXCEPT.

-- 1. UPDATE the 3 seeded E2E HCPs (Alice/E2E/Carol) to canonical specialty.
--    These are baseline fixtures used across the E2E suite — never delete.
--    Idempotent via `<>` guard.
UPDATE "Hcp"
   SET specialty = 'Optometry', "updatedAt" = CURRENT_TIMESTAMP
 WHERE specialty = 'E2E Test Oncology Specialist'
   AND specialty <> 'Optometry';

-- 2. DELETE the test-pollution Hcp rows. Scoped narrowly to email+name
--    patterns (does NOT touch specialty-based matches, which would have
--    swept up the seeded fixtures handled in step 1).
DELETE FROM "Hcp"
 WHERE email LIKE 'import.test%@e2etest.example.com'
    OR ("firstName" = 'Import' AND "lastName" = 'TestHCP');

-- 3. Drop the v1.15.31 blacklist constraint and replace with a strict whitelist.
--    With cleanup done, the whitelist applies cleanly. Any future write with
--    a non-canonical specialty (old role-form 'Optometrist', a typo
--    'Optomerty', or out-of-domain 'Cardiology') now fails with the
--    constraint name "Hcp_specialty_check".
ALTER TABLE "Hcp" DROP CONSTRAINT IF EXISTS "Hcp_specialty_not_role_form";
DO $$ BEGIN
  ALTER TABLE "Hcp" ADD CONSTRAINT "Hcp_specialty_check"
    CHECK ("specialty" IS NULL OR "specialty" IN ('Optometry', 'Ophthalmology'));
EXCEPTION WHEN duplicate_object THEN null; END $$;
