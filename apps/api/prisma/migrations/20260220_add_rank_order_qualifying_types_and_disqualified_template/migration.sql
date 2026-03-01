-- AlterEnum
ALTER TYPE "QuestionType" ADD VALUE 'RANK_ORDER';
ALTER TYPE "QuestionType" ADD VALUE 'QUALIFYING';

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "surveyDisqualifiedMessage" TEXT,
ADD COLUMN "surveyDisqualifiedTitle" TEXT;
