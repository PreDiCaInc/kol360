-- Rename scoreOrgAwareness to scoreOrgAwards in HcpDiseaseAreaScore
ALTER TABLE "HcpDiseaseAreaScore" RENAME COLUMN "scoreOrgAwareness" TO "scoreOrgAwards";

-- Rename weightOrgAwareness to weightOrgAwards in CompositeScoreConfig
ALTER TABLE "CompositeScoreConfig" RENAME COLUMN "weightOrgAwareness" TO "weightOrgAwards";
