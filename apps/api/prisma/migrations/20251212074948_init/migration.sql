-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PLATFORM_ADMIN', 'CLIENT_ADMIN', 'TEAM_MEMBER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_VERIFICATION', 'PENDING_APPROVAL', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('FULL', 'LITE');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "SurveyResponseStatus" AS ENUM ('PENDING', 'OPENED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "NominationMatchStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'NEW_HCP', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING_EXPORT', 'EXPORTED', 'EMAIL_SENT', 'EMAIL_DELIVERED', 'EMAIL_OPENED', 'CLAIMED', 'BOUNCED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OptOutScope" AS ENUM ('CAMPAIGN', 'GLOBAL');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('TEXT', 'NUMBER', 'RATING', 'SINGLE_CHOICE', 'MULTI_CHOICE', 'DROPDOWN', 'MULTI_TEXT');

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ClientType" NOT NULL DEFAULT 'FULL',
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#0066CC',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "cognitoSub" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "clientId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiseaseArea" (
    "id" TEXT NOT NULL,
    "therapeuticArea" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiseaseArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiteClientDiseaseArea" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "diseaseAreaId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "grantedBy" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiteClientDiseaseArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hcp" (
    "id" TEXT NOT NULL,
    "npi" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "specialty" TEXT,
    "subSpecialty" TEXT,
    "city" TEXT,
    "state" TEXT,
    "yearsInPractice" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "Hcp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HcpAlias" (
    "id" TEXT NOT NULL,
    "hcpId" TEXT NOT NULL,
    "aliasName" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HcpAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HcpDiseaseAreaScore" (
    "id" TEXT NOT NULL,
    "hcpId" TEXT NOT NULL,
    "diseaseAreaId" TEXT NOT NULL,
    "scorePublications" DECIMAL(5,2),
    "scoreClinicalTrials" DECIMAL(5,2),
    "scoreTradePubs" DECIMAL(5,2),
    "scoreOrgLeadership" DECIMAL(5,2),
    "scoreOrgAwareness" DECIMAL(5,2),
    "scoreConference" DECIMAL(5,2),
    "scoreSocialMedia" DECIMAL(5,2),
    "scoreMediaPodcasts" DECIMAL(5,2),
    "scoreSurvey" DECIMAL(5,2),
    "totalNominationCount" INTEGER NOT NULL DEFAULT 0,
    "compositeScore" DECIMAL(5,2),
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "campaignCount" INTEGER NOT NULL DEFAULT 0,
    "lastCalculatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HcpDiseaseAreaScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HcpCampaignScore" (
    "id" TEXT NOT NULL,
    "hcpId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "scoreSurvey" DECIMAL(5,2),
    "nominationCount" INTEGER NOT NULL DEFAULT 0,
    "compositeScore" DECIMAL(5,2),
    "calculatedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HcpCampaignScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreImportBatch" (
    "id" TEXT NOT NULL,
    "diseaseAreaId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "recordsTotal" INTEGER NOT NULL,
    "recordsImported" INTEGER NOT NULL,
    "recordsSkipped" INTEGER NOT NULL,
    "importedBy" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "ScoreImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "category" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "tags" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectionTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isCore" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SectionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectionQuestion" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SectionQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurveyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateSection" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TemplateSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "diseaseAreaId" TEXT NOT NULL,
    "surveyTemplateId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "honorariumAmount" DECIMAL(10,2),
    "surveyOpenDate" TIMESTAMP(3),
    "surveyCloseDate" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignHcp" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "hcpId" TEXT NOT NULL,
    "surveyToken" TEXT NOT NULL,
    "emailSentAt" TIMESTAMP(3),
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "lastReminderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignHcp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyQuestion" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sectionName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "questionTextSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompositeScoreConfig" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "weightPublications" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "weightClinicalTrials" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "weightTradePubs" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "weightOrgLeadership" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "weightOrgAwareness" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "weightConference" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "weightSocialMedia" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "weightMediaPodcasts" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "weightSurvey" DECIMAL(5,2) NOT NULL DEFAULT 25,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompositeScoreConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "respondentHcpId" TEXT NOT NULL,
    "surveyToken" TEXT NOT NULL,
    "status" "SurveyResponseStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyResponseAnswer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerText" TEXT,
    "answerJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurveyResponseAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nomination" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "nominatorHcpId" TEXT NOT NULL,
    "rawNameEntered" TEXT NOT NULL,
    "matchedHcpId" TEXT,
    "matchStatus" "NominationMatchStatus" NOT NULL DEFAULT 'UNMATCHED',
    "matchedBy" TEXT,
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Nomination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "hcpId" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING_EXPORT',
    "statusUpdatedAt" TIMESTAMP(3),
    "exportedAt" TIMESTAMP(3),
    "exportBatchId" TEXT,
    "externalReferenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentExportBatch" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "exportedBy" TEXT NOT NULL,
    "exportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordCount" INTEGER NOT NULL,
    "fileName" TEXT,
    "notes" TEXT,

    CONSTRAINT "PaymentExportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentStatusHistory" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "oldStatus" "PaymentStatus",
    "newStatus" "PaymentStatus" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedBy" TEXT,
    "importBatchId" TEXT,

    CONSTRAINT "PaymentStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentImportBatch" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "importedBy" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileName" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL,
    "matchedCount" INTEGER NOT NULL,
    "unmatchedCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "PaymentImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptOut" (
    "id" TEXT NOT NULL,
    "hcpId" TEXT,
    "email" TEXT NOT NULL,
    "scope" "OptOutScope" NOT NULL,
    "campaignId" TEXT,
    "reason" TEXT,
    "optedOutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "optedOutVia" TEXT NOT NULL,
    "resubscribedAt" TIMESTAMP(3),
    "resubscribedVia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptOut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldValues" JSONB,
    "newValues" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardConfig" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "campaignId" TEXT,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Client_type_idx" ON "Client"("type");

-- CreateIndex
CREATE INDEX "Client_isActive_idx" ON "Client"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "User_cognitoSub_key" ON "User"("cognitoSub");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_clientId_idx" ON "User"("clientId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_cognitoSub_idx" ON "User"("cognitoSub");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DiseaseArea_code_key" ON "DiseaseArea"("code");

-- CreateIndex
CREATE INDEX "DiseaseArea_therapeuticArea_idx" ON "DiseaseArea"("therapeuticArea");

-- CreateIndex
CREATE INDEX "DiseaseArea_isActive_idx" ON "DiseaseArea"("isActive");

-- CreateIndex
CREATE INDEX "LiteClientDiseaseArea_clientId_idx" ON "LiteClientDiseaseArea"("clientId");

-- CreateIndex
CREATE INDEX "LiteClientDiseaseArea_diseaseAreaId_idx" ON "LiteClientDiseaseArea"("diseaseAreaId");

-- CreateIndex
CREATE UNIQUE INDEX "LiteClientDiseaseArea_clientId_diseaseAreaId_key" ON "LiteClientDiseaseArea"("clientId", "diseaseAreaId");

-- CreateIndex
CREATE UNIQUE INDEX "Hcp_npi_key" ON "Hcp"("npi");

-- CreateIndex
CREATE INDEX "Hcp_npi_idx" ON "Hcp"("npi");

-- CreateIndex
CREATE INDEX "Hcp_lastName_firstName_idx" ON "Hcp"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Hcp_specialty_idx" ON "Hcp"("specialty");

-- CreateIndex
CREATE INDEX "Hcp_state_idx" ON "Hcp"("state");

-- CreateIndex
CREATE INDEX "HcpAlias_aliasName_idx" ON "HcpAlias"("aliasName");

-- CreateIndex
CREATE UNIQUE INDEX "HcpAlias_hcpId_aliasName_key" ON "HcpAlias"("hcpId", "aliasName");

-- CreateIndex
CREATE INDEX "HcpDiseaseAreaScore_hcpId_diseaseAreaId_isCurrent_idx" ON "HcpDiseaseAreaScore"("hcpId", "diseaseAreaId", "isCurrent");

-- CreateIndex
CREATE INDEX "HcpDiseaseAreaScore_diseaseAreaId_isCurrent_idx" ON "HcpDiseaseAreaScore"("diseaseAreaId", "isCurrent");

-- CreateIndex
CREATE INDEX "HcpDiseaseAreaScore_hcpId_isCurrent_idx" ON "HcpDiseaseAreaScore"("hcpId", "isCurrent");

-- CreateIndex
CREATE INDEX "HcpCampaignScore_campaignId_idx" ON "HcpCampaignScore"("campaignId");

-- CreateIndex
CREATE INDEX "HcpCampaignScore_hcpId_idx" ON "HcpCampaignScore"("hcpId");

-- CreateIndex
CREATE UNIQUE INDEX "HcpCampaignScore_hcpId_campaignId_key" ON "HcpCampaignScore"("hcpId", "campaignId");

-- CreateIndex
CREATE INDEX "ScoreImportBatch_diseaseAreaId_idx" ON "ScoreImportBatch"("diseaseAreaId");

-- CreateIndex
CREATE INDEX "ScoreImportBatch_importedAt_idx" ON "ScoreImportBatch"("importedAt");

-- CreateIndex
CREATE INDEX "Question_category_idx" ON "Question"("category");

-- CreateIndex
CREATE INDEX "Question_type_idx" ON "Question"("type");

-- CreateIndex
CREATE INDEX "Question_status_idx" ON "Question"("status");

-- CreateIndex
CREATE INDEX "SectionTemplate_isCore_idx" ON "SectionTemplate"("isCore");

-- CreateIndex
CREATE INDEX "SectionQuestion_sectionId_idx" ON "SectionQuestion"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "SectionQuestion_sectionId_questionId_key" ON "SectionQuestion"("sectionId", "questionId");

-- CreateIndex
CREATE INDEX "TemplateSection_templateId_idx" ON "TemplateSection"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateSection_templateId_sectionId_key" ON "TemplateSection"("templateId", "sectionId");

-- CreateIndex
CREATE INDEX "Campaign_clientId_idx" ON "Campaign"("clientId");

-- CreateIndex
CREATE INDEX "Campaign_diseaseAreaId_idx" ON "Campaign"("diseaseAreaId");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignHcp_surveyToken_key" ON "CampaignHcp"("surveyToken");

-- CreateIndex
CREATE INDEX "CampaignHcp_surveyToken_idx" ON "CampaignHcp"("surveyToken");

-- CreateIndex
CREATE INDEX "CampaignHcp_campaignId_idx" ON "CampaignHcp"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignHcp_campaignId_hcpId_key" ON "CampaignHcp"("campaignId", "hcpId");

-- CreateIndex
CREATE INDEX "SurveyQuestion_campaignId_idx" ON "SurveyQuestion"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CompositeScoreConfig_campaignId_key" ON "CompositeScoreConfig"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyResponse_surveyToken_key" ON "SurveyResponse"("surveyToken");

-- CreateIndex
CREATE INDEX "SurveyResponse_campaignId_idx" ON "SurveyResponse"("campaignId");

-- CreateIndex
CREATE INDEX "SurveyResponse_respondentHcpId_idx" ON "SurveyResponse"("respondentHcpId");

-- CreateIndex
CREATE INDEX "SurveyResponse_surveyToken_idx" ON "SurveyResponse"("surveyToken");

-- CreateIndex
CREATE INDEX "SurveyResponse_status_idx" ON "SurveyResponse"("status");

-- CreateIndex
CREATE INDEX "SurveyResponseAnswer_responseId_idx" ON "SurveyResponseAnswer"("responseId");

-- CreateIndex
CREATE INDEX "SurveyResponseAnswer_questionId_idx" ON "SurveyResponseAnswer"("questionId");

-- CreateIndex
CREATE INDEX "Nomination_responseId_idx" ON "Nomination"("responseId");

-- CreateIndex
CREATE INDEX "Nomination_questionId_idx" ON "Nomination"("questionId");

-- CreateIndex
CREATE INDEX "Nomination_matchStatus_idx" ON "Nomination"("matchStatus");

-- CreateIndex
CREATE INDEX "Nomination_matchedHcpId_idx" ON "Nomination"("matchedHcpId");

-- CreateIndex
CREATE INDEX "Nomination_rawNameEntered_idx" ON "Nomination"("rawNameEntered");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_responseId_key" ON "Payment"("responseId");

-- CreateIndex
CREATE INDEX "Payment_campaignId_idx" ON "Payment"("campaignId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_campaignId_hcpId_key" ON "Payment"("campaignId", "hcpId");

-- CreateIndex
CREATE INDEX "PaymentExportBatch_campaignId_idx" ON "PaymentExportBatch"("campaignId");

-- CreateIndex
CREATE INDEX "PaymentStatusHistory_paymentId_idx" ON "PaymentStatusHistory"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentImportBatch_campaignId_idx" ON "PaymentImportBatch"("campaignId");

-- CreateIndex
CREATE INDEX "OptOut_email_idx" ON "OptOut"("email");

-- CreateIndex
CREATE INDEX "OptOut_scope_idx" ON "OptOut"("scope");

-- CreateIndex
CREATE INDEX "OptOut_campaignId_idx" ON "OptOut"("campaignId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "DashboardConfig_clientId_idx" ON "DashboardConfig"("clientId");

-- CreateIndex
CREATE INDEX "DashboardConfig_campaignId_idx" ON "DashboardConfig"("campaignId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiteClientDiseaseArea" ADD CONSTRAINT "LiteClientDiseaseArea_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiteClientDiseaseArea" ADD CONSTRAINT "LiteClientDiseaseArea_diseaseAreaId_fkey" FOREIGN KEY ("diseaseAreaId") REFERENCES "DiseaseArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HcpAlias" ADD CONSTRAINT "HcpAlias_hcpId_fkey" FOREIGN KEY ("hcpId") REFERENCES "Hcp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HcpDiseaseAreaScore" ADD CONSTRAINT "HcpDiseaseAreaScore_hcpId_fkey" FOREIGN KEY ("hcpId") REFERENCES "Hcp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HcpDiseaseAreaScore" ADD CONSTRAINT "HcpDiseaseAreaScore_diseaseAreaId_fkey" FOREIGN KEY ("diseaseAreaId") REFERENCES "DiseaseArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HcpCampaignScore" ADD CONSTRAINT "HcpCampaignScore_hcpId_fkey" FOREIGN KEY ("hcpId") REFERENCES "Hcp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HcpCampaignScore" ADD CONSTRAINT "HcpCampaignScore_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionQuestion" ADD CONSTRAINT "SectionQuestion_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "SectionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionQuestion" ADD CONSTRAINT "SectionQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateSection" ADD CONSTRAINT "TemplateSection_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SurveyTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateSection" ADD CONSTRAINT "TemplateSection_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "SectionTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_diseaseAreaId_fkey" FOREIGN KEY ("diseaseAreaId") REFERENCES "DiseaseArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_surveyTemplateId_fkey" FOREIGN KEY ("surveyTemplateId") REFERENCES "SurveyTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignHcp" ADD CONSTRAINT "CampaignHcp_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignHcp" ADD CONSTRAINT "CampaignHcp_hcpId_fkey" FOREIGN KEY ("hcpId") REFERENCES "Hcp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyQuestion" ADD CONSTRAINT "SurveyQuestion_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyQuestion" ADD CONSTRAINT "SurveyQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompositeScoreConfig" ADD CONSTRAINT "CompositeScoreConfig_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_respondentHcpId_fkey" FOREIGN KEY ("respondentHcpId") REFERENCES "Hcp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponseAnswer" ADD CONSTRAINT "SurveyResponseAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "SurveyResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponseAnswer" ADD CONSTRAINT "SurveyResponseAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "SurveyQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nomination" ADD CONSTRAINT "Nomination_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "SurveyResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nomination" ADD CONSTRAINT "Nomination_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "SurveyQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nomination" ADD CONSTRAINT "Nomination_nominatorHcpId_fkey" FOREIGN KEY ("nominatorHcpId") REFERENCES "Hcp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nomination" ADD CONSTRAINT "Nomination_matchedHcpId_fkey" FOREIGN KEY ("matchedHcpId") REFERENCES "Hcp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_hcpId_fkey" FOREIGN KEY ("hcpId") REFERENCES "Hcp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "SurveyResponse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_exportBatchId_fkey" FOREIGN KEY ("exportBatchId") REFERENCES "PaymentExportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentStatusHistory" ADD CONSTRAINT "PaymentStatusHistory_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptOut" ADD CONSTRAINT "OptOut_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
