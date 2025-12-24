-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "invitationEmailBody" TEXT,
ADD COLUMN     "invitationEmailSubject" TEXT,
ADD COLUMN     "reminderEmailBody" TEXT,
ADD COLUMN     "reminderEmailSubject" TEXT;
