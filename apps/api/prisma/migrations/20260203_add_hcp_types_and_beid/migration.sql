-- Step 1: Add new columns
ALTER TABLE "Hcp" ADD COLUMN "beId" TEXT;
ALTER TABLE "Hcp" ADD COLUMN "isSurveyTaker" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Hcp" ADD COLUMN "isNominated" BOOLEAN NOT NULL DEFAULT false;

-- Step 2: Make npi optional
ALTER TABLE "Hcp" ALTER COLUMN "npi" DROP NOT NULL;

-- Step 3: Backfill isSurveyTaker
UPDATE "Hcp" SET "isSurveyTaker" = true;

-- Step 4: Backfill beId
UPDATE "Hcp" SET "beId" = 'BE-' || LPAD(sub.rn::text, 6, '0')
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) as rn
  FROM "Hcp"
) sub
WHERE "Hcp".id = sub.id;

-- Step 5: Make beId non-nullable
ALTER TABLE "Hcp" ALTER COLUMN "beId" SET NOT NULL;

-- Step 6: Add unique constraint and indexes
CREATE UNIQUE INDEX "Hcp_beId_key" ON "Hcp"("beId");
CREATE INDEX "Hcp_beId_idx" ON "Hcp"("beId");
CREATE INDEX "Hcp_isSurveyTaker_idx" ON "Hcp"("isSurveyTaker");
CREATE INDEX "Hcp_isNominated_idx" ON "Hcp"("isNominated");
