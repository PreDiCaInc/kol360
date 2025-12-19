import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const ses = new SESClient({
  region: process.env.AWS_REGION || 'us-east-2',
});

const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'noreply@bio-exec.com';
const FROM_NAME = process.env.SES_FROM_NAME || 'BioExec KOL Research';
const MOCK_MODE = process.env.EMAIL_MOCK_MODE === 'true';

// Base URL for survey links
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://kol360.bio-exec.com';

interface SendEmailParams {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
}

interface SendInvitationParams {
  campaignId: string;
  hcpId: string;
  email: string;
  firstName: string;
  lastName: string;
  surveyToken: string;
  campaignName: string;
  honorariumAmount?: number | null;
}

interface SendReminderParams extends SendInvitationParams {
  reminderNumber: number;
}

interface BulkSendResult {
  sent: number;
  failed: number;
  skipped: number;
  errors: Array<{ email: string; error: string }>;
}

export class EmailService {
  /**
   * Send a single email via SES
   */
  async sendEmail(params: SendEmailParams): Promise<{ messageId: string }> {
    const { to, subject, htmlBody, textBody } = params;

    if (MOCK_MODE) {
      logger.info('MOCK: Would send email', { to, subject });
      return { messageId: `mock-${Date.now()}` };
    }

    try {
      const command = new SendEmailCommand({
        Source: `${FROM_NAME} <${FROM_EMAIL}>`,
        Destination: {
          ToAddresses: [to],
        },
        Message: {
          Subject: {
            Data: subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: htmlBody,
              Charset: 'UTF-8',
            },
            Text: {
              Data: textBody,
              Charset: 'UTF-8',
            },
          },
        },
      });

      const response = await ses.send(command);
      logger.info('Email sent successfully', { to, messageId: response.MessageId });

      return { messageId: response.MessageId || '' };
    } catch (error) {
      logger.error('Failed to send email', { to }, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Send survey invitation email to a single HCP
   */
  async sendSurveyInvitation(params: SendInvitationParams): Promise<{ messageId: string }> {
    const {
      campaignId,
      hcpId,
      email,
      lastName,
      surveyToken,
      campaignName,
      honorariumAmount,
    } = params;

    // Check opt-out status
    const optOut = await prisma.optOut.findFirst({
      where: {
        email,
        resubscribedAt: null,
        OR: [
          { scope: 'GLOBAL' },
          { scope: 'CAMPAIGN', campaignId },
        ],
      },
    });

    if (optOut) {
      logger.info('Skipping email - user opted out', { email, optOutScope: optOut.scope });
      throw new Error('Recipient has opted out');
    }

    const surveyUrl = `${APP_URL}/survey/${surveyToken}`;
    const unsubscribeUrl = `${APP_URL}/unsubscribe/${surveyToken}`;

    const honorariumText = honorariumAmount
      ? `As a thank you for your participation, you will receive a $${honorariumAmount} honorarium upon completion.`
      : '';

    const subject = `Your expertise needed: ${campaignName} KOL Survey`;

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <img src="${APP_URL}/images/logo-black.png" alt="BioExec" style="height: 40px;">
  </div>

  <h2 style="color: #0066CC;">Dear Dr. ${lastName},</h2>

  <p>You have been identified as a key opinion leader in your field, and we would greatly value your insights.</p>

  <p>We are conducting the <strong>${campaignName}</strong> research study and would like to invite you to participate in a brief survey about thought leaders in your specialty area.</p>

  <p>The survey takes approximately <strong>5-10 minutes</strong> to complete.</p>

  ${honorariumText ? `<p style="background-color: #f0f7ff; padding: 15px; border-radius: 5px;">${honorariumText}</p>` : ''}

  <div style="text-align: center; margin: 30px 0;">
    <a href="${surveyUrl}" style="background-color: #0066CC; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
      Start Survey
    </a>
  </div>

  <p>If the button above doesn't work, copy and paste this link into your browser:</p>
  <p style="word-break: break-all; color: #666; font-size: 14px;">${surveyUrl}</p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

  <p style="font-size: 14px; color: #666;">
    Your responses will be kept confidential and used only for research purposes.
  </p>

  <p style="font-size: 12px; color: #999;">
    If you wish to unsubscribe from this survey, <a href="${unsubscribeUrl}" style="color: #999;">click here</a>.
  </p>

  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999; text-align: center;">
    <p>BioExec Research | Confidential KOL Survey</p>
  </div>
</body>
</html>
    `.trim();

    const textBody = `
Dear Dr. ${lastName},

You have been identified as a key opinion leader in your field, and we would greatly value your insights.

We are conducting the ${campaignName} research study and would like to invite you to participate in a brief survey about thought leaders in your specialty area.

The survey takes approximately 5-10 minutes to complete.

${honorariumText}

To start the survey, visit:
${surveyUrl}

Your responses will be kept confidential and used only for research purposes.

To unsubscribe from this survey, visit:
${unsubscribeUrl}

---
BioExec Research | Confidential KOL Survey
    `.trim();

    const result = await this.sendEmail({
      to: email,
      subject,
      htmlBody,
      textBody,
    });

    // Update CampaignHcp record
    await prisma.campaignHcp.update({
      where: {
        campaignId_hcpId: { campaignId, hcpId },
      },
      data: {
        emailSentAt: new Date(),
      },
    });

    return result;
  }

  /**
   * Send reminder email to a single HCP
   */
  async sendReminderEmail(params: SendReminderParams): Promise<{ messageId: string }> {
    const {
      campaignId,
      hcpId,
      email,
      lastName,
      surveyToken,
      campaignName,
      honorariumAmount,
      reminderNumber,
    } = params;

    // Check opt-out status
    const optOut = await prisma.optOut.findFirst({
      where: {
        email,
        resubscribedAt: null,
        OR: [
          { scope: 'GLOBAL' },
          { scope: 'CAMPAIGN', campaignId },
        ],
      },
    });

    if (optOut) {
      throw new Error('Recipient has opted out');
    }

    // Check if already completed
    const response = await prisma.surveyResponse.findFirst({
      where: {
        campaignId,
        respondentHcpId: hcpId,
        status: 'COMPLETED',
      },
    });

    if (response) {
      throw new Error('Survey already completed');
    }

    const surveyUrl = `${APP_URL}/survey/${surveyToken}`;
    const unsubscribeUrl = `${APP_URL}/unsubscribe/${surveyToken}`;

    const honorariumText = honorariumAmount
      ? `Remember, you will receive a $${honorariumAmount} honorarium upon completion.`
      : '';

    const urgencyText = reminderNumber >= 2
      ? 'This survey will be closing soon. '
      : '';

    const subject = `Reminder: ${campaignName} KOL Survey - We value your input`;

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <img src="${APP_URL}/images/logo-black.png" alt="BioExec" style="height: 40px;">
  </div>

  <h2 style="color: #0066CC;">Dear Dr. ${lastName},</h2>

  <p>We recently invited you to participate in the <strong>${campaignName}</strong> research study, and we noticed you haven't yet completed the survey.</p>

  <p>${urgencyText}Your insights as a key opinion leader are invaluable to this research.</p>

  <p>The survey takes only <strong>5-10 minutes</strong> to complete.</p>

  ${honorariumText ? `<p style="background-color: #f0f7ff; padding: 15px; border-radius: 5px;">${honorariumText}</p>` : ''}

  <div style="text-align: center; margin: 30px 0;">
    <a href="${surveyUrl}" style="background-color: #0066CC; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
      Complete Survey Now
    </a>
  </div>

  <p>If the button above doesn't work, copy and paste this link into your browser:</p>
  <p style="word-break: break-all; color: #666; font-size: 14px;">${surveyUrl}</p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

  <p style="font-size: 12px; color: #999;">
    If you wish to unsubscribe from this survey, <a href="${unsubscribeUrl}" style="color: #999;">click here</a>.
  </p>

  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999; text-align: center;">
    <p>BioExec Research | Confidential KOL Survey</p>
  </div>
</body>
</html>
    `.trim();

    const textBody = `
Dear Dr. ${lastName},

We recently invited you to participate in the ${campaignName} research study, and we noticed you haven't yet completed the survey.

${urgencyText}Your insights as a key opinion leader are invaluable to this research.

The survey takes only 5-10 minutes to complete.

${honorariumText}

To complete the survey, visit:
${surveyUrl}

To unsubscribe, visit:
${unsubscribeUrl}

---
BioExec Research | Confidential KOL Survey
    `.trim();

    const result = await this.sendEmail({
      to: email,
      subject,
      htmlBody,
      textBody,
    });

    // Update CampaignHcp record
    await prisma.campaignHcp.update({
      where: {
        campaignId_hcpId: { campaignId, hcpId },
      },
      data: {
        reminderCount: { increment: 1 },
        lastReminderAt: new Date(),
      },
    });

    return result;
  }

  /**
   * Send invitations to all uninvited HCPs in a campaign
   */
  async sendBulkInvitations(campaignId: string): Promise<BulkSendResult> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        name: true,
        status: true,
        honorariumAmount: true,
      },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.status !== 'ACTIVE') {
      throw new Error('Can only send invitations for active campaigns');
    }

    // Get all HCPs who haven't been sent an invitation yet
    const uninvitedHcps = await prisma.campaignHcp.findMany({
      where: {
        campaignId,
        emailSentAt: null,
      },
      include: {
        hcp: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    const result: BulkSendResult = {
      sent: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

    for (const campaignHcp of uninvitedHcps) {
      const { hcp, surveyToken } = campaignHcp;

      if (!hcp.email) {
        result.skipped++;
        result.errors.push({ email: 'N/A', error: `HCP ${hcp.firstName} ${hcp.lastName} has no email` });
        continue;
      }

      try {
        await this.sendSurveyInvitation({
          campaignId,
          hcpId: hcp.id,
          email: hcp.email,
          firstName: hcp.firstName,
          lastName: hcp.lastName,
          surveyToken,
          campaignName: campaign.name,
          honorariumAmount: campaign.honorariumAmount ? Number(campaign.honorariumAmount) : null,
        });
        result.sent++;

        // Small delay to avoid SES rate limits (14 emails/sec for sandbox)
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        result.failed++;
        result.errors.push({
          email: hcp.email,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return result;
  }

  /**
   * Send reminders to all HCPs who haven't completed the survey
   */
  async sendBulkReminders(campaignId: string, maxReminders: number = 3): Promise<BulkSendResult> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        name: true,
        status: true,
        honorariumAmount: true,
      },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.status !== 'ACTIVE') {
      throw new Error('Can only send reminders for active campaigns');
    }

    // Get HCPs who:
    // - Have been sent an invitation
    // - Haven't completed the survey
    // - Haven't exceeded max reminders
    // - Haven't been sent a reminder in the last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const eligibleHcps = await prisma.campaignHcp.findMany({
      where: {
        campaignId,
        emailSentAt: { not: null },
        reminderCount: { lt: maxReminders },
        OR: [
          { lastReminderAt: null },
          { lastReminderAt: { lt: oneDayAgo } },
        ],
      },
      include: {
        hcp: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Filter out those who have completed
    const completedHcpIds = new Set(
      (await prisma.surveyResponse.findMany({
        where: {
          campaignId,
          status: 'COMPLETED',
        },
        select: { respondentHcpId: true },
      })).map((r: { respondentHcpId: string }) => r.respondentHcpId)
    );

    const result: BulkSendResult = {
      sent: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

    for (const campaignHcp of eligibleHcps) {
      const { hcp, surveyToken, reminderCount } = campaignHcp;

      if (completedHcpIds.has(hcp.id)) {
        result.skipped++;
        continue;
      }

      if (!hcp.email) {
        result.skipped++;
        continue;
      }

      try {
        await this.sendReminderEmail({
          campaignId,
          hcpId: hcp.id,
          email: hcp.email,
          firstName: hcp.firstName,
          lastName: hcp.lastName,
          surveyToken,
          campaignName: campaign.name,
          honorariumAmount: campaign.honorariumAmount ? Number(campaign.honorariumAmount) : null,
          reminderNumber: reminderCount + 1,
        });
        result.sent++;

        // Small delay to avoid SES rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        result.failed++;
        result.errors.push({
          email: hcp.email,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return result;
  }
}

export const emailService = new EmailService();
