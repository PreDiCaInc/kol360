-- Create beId sequence for atomic, collision-free beId generation.
-- Used by both internal HCP creation (generateBeId, createWithAtomicBeId, importFromFile)
-- and by external apps (e.g., HCP curation tool) via direct DB access.

CREATE SEQUENCE IF NOT EXISTS beid_seq;

-- Seed the sequence at max(existing beIds) + 1 so new values never collide
-- with existing BE-XXXXXX records. Uses GREATEST to ensure we start at 1 or higher
-- even if the table is empty.
SELECT setval(
  'beid_seq',
  GREATEST(
    (SELECT COALESCE(MAX(CAST(SUBSTRING("beId" FROM 4) AS INTEGER)), 0)
     FROM "Hcp"
     WHERE "beId" ~ '^BE-[0-9]+$'),
    1
  ),
  true  -- mark as "used" so next nextval() returns seeded_value + 1
);
