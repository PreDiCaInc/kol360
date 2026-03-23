-- Set existing NULL values to 0 before making NOT NULL
UPDATE "Campaign" SET "honorariumAmount" = 0 WHERE "honorariumAmount" IS NULL;

-- Make honorariumAmount required with default 0
ALTER TABLE "Campaign" ALTER COLUMN "honorariumAmount" SET DEFAULT 0;
ALTER TABLE "Campaign" ALTER COLUMN "honorariumAmount" SET NOT NULL;
