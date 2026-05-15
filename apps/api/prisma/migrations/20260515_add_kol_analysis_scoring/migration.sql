-- KOL Analysis scoring: curated (client, disease area, campaign set) becomes
-- the scoring unit. Survey scores are pooled across included campaigns and
-- normalized once, replacing invalid per-campaign-then-average behavior.

-- CreateTable
CREATE TABLE "KolAnalysis" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "diseaseAreaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weightsJson" JSONB NOT NULL,
    "lastCalculatedAt" TIMESTAMP(3),
    "calcStatus" TEXT NOT NULL DEFAULT 'idle',
    "calcError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "KolAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KolAnalysisCampaign" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KolAnalysisCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HcpAnalysisScore" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "hcpId" TEXT NOT NULL,
    "scoreDiscussionLeaders" DECIMAL(5,2),
    "countDiscussionLeaders" INTEGER NOT NULL DEFAULT 0,
    "scoreReferralLeaders" DECIMAL(5,2),
    "countReferralLeaders" INTEGER NOT NULL DEFAULT 0,
    "scoreAdviceLeaders" DECIMAL(5,2),
    "countAdviceLeaders" INTEGER NOT NULL DEFAULT 0,
    "scoreNationalLeader" DECIMAL(5,2),
    "countNationalLeader" INTEGER NOT NULL DEFAULT 0,
    "scoreRisingStar" DECIMAL(5,2),
    "countRisingStar" INTEGER NOT NULL DEFAULT 0,
    "scoreSocialLeader" DECIMAL(5,2),
    "countSocialLeader" INTEGER NOT NULL DEFAULT 0,
    "scoreRegionalLeader" DECIMAL(5,2),
    "countRegionalLeader" INTEGER NOT NULL DEFAULT 0,
    "scoreBiasedLeader" DECIMAL(5,2),
    "countBiasedLeader" INTEGER NOT NULL DEFAULT 0,
    "scoreSurvey" DECIMAL(5,2),
    "nominationCount" INTEGER NOT NULL DEFAULT 0,
    "compositeScore" DECIMAL(5,2),
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HcpAnalysisScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KolAnalysis_diseaseAreaId_idx" ON "KolAnalysis"("diseaseAreaId");
CREATE INDEX "KolAnalysis_clientId_idx" ON "KolAnalysis"("clientId");
CREATE UNIQUE INDEX "KolAnalysis_clientId_diseaseAreaId_key" ON "KolAnalysis"("clientId", "diseaseAreaId");

-- CreateIndex
CREATE INDEX "KolAnalysisCampaign_campaignId_idx" ON "KolAnalysisCampaign"("campaignId");
CREATE UNIQUE INDEX "KolAnalysisCampaign_analysisId_campaignId_key" ON "KolAnalysisCampaign"("analysisId", "campaignId");

-- CreateIndex
CREATE INDEX "HcpAnalysisScore_analysisId_idx" ON "HcpAnalysisScore"("analysisId");
CREATE INDEX "HcpAnalysisScore_hcpId_idx" ON "HcpAnalysisScore"("hcpId");
CREATE UNIQUE INDEX "HcpAnalysisScore_analysisId_hcpId_key" ON "HcpAnalysisScore"("analysisId", "hcpId");

-- AddForeignKey
ALTER TABLE "KolAnalysis" ADD CONSTRAINT "KolAnalysis_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KolAnalysis" ADD CONSTRAINT "KolAnalysis_diseaseAreaId_fkey" FOREIGN KEY ("diseaseAreaId") REFERENCES "DiseaseArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KolAnalysisCampaign" ADD CONSTRAINT "KolAnalysisCampaign_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "KolAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KolAnalysisCampaign" ADD CONSTRAINT "KolAnalysisCampaign_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HcpAnalysisScore" ADD CONSTRAINT "HcpAnalysisScore_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "KolAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HcpAnalysisScore" ADD CONSTRAINT "HcpAnalysisScore_hcpId_fkey" FOREIGN KEY ("hcpId") REFERENCES "Hcp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
