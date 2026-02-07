-- Add campaign-level HCP segmentation fields to CampaignHcp
-- These fields are optional and populated during HCP import

ALTER TABLE "CampaignHcp" ADD COLUMN IF NOT EXISTS "marketDecile" INTEGER;
ALTER TABLE "CampaignHcp" ADD COLUMN IF NOT EXISTS "product1Decile" INTEGER;
ALTER TABLE "CampaignHcp" ADD COLUMN IF NOT EXISTS "product2Decile" INTEGER;
ALTER TABLE "CampaignHcp" ADD COLUMN IF NOT EXISTS "practiceSetting" TEXT;
ALTER TABLE "CampaignHcp" ADD COLUMN IF NOT EXISTS "practiceSentiment" TEXT;
ALTER TABLE "CampaignHcp" ADD COLUMN IF NOT EXISTS "prescribingBehavior" TEXT;
ALTER TABLE "CampaignHcp" ADD COLUMN IF NOT EXISTS "segmentation1" TEXT;
ALTER TABLE "CampaignHcp" ADD COLUMN IF NOT EXISTS "segmentation2" TEXT;
ALTER TABLE "CampaignHcp" ADD COLUMN IF NOT EXISTS "segmentation3" TEXT;
