-- AlterEnum
ALTER TYPE "NominationType" ADD VALUE 'BIASED_LEADER';

-- AlterTable
ALTER TABLE "HcpCampaignScore" ADD COLUMN "scoreBiasedLeader" DECIMAL(5,2),
ADD COLUMN "countBiasedLeader" INTEGER NOT NULL DEFAULT 0;
