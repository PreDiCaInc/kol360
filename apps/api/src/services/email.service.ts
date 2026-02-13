import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const ses = new SESClient({
  region: process.env.AWS_REGION || 'us-east-2',
});

const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'noreply@bio-exec.com';
const FROM_NAME = process.env.SES_FROM_NAME || 'BioExec KOL Research';
const MOCK_MODE = process.env.EMAIL_MOCK_MODE === 'true';
const SEND_EXTERNAL_EMAIL = process.env.SEND_EXTERNAL_EMAIL === 'true';
const ALLOWED_EMAIL_DOMAIN = 'bio-exec.com';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

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
  customSubject?: string | null;
  customBody?: string | null;
}

interface SendReminderParams extends SendInvitationParams {
  reminderNumber: number;
}

interface BulkSendResult {
  sent: number;
  failed: number;
  skipped: number;
  skippedNoEmail?: number;
  skippedOptedOut?: number;
  skippedRecentlySurveyed?: number;
  skippedCompleted?: number;
  skippedRecentlyReminded?: number;
  skippedMaxReminders?: number;
  errors: Array<{ email: string; error: string }>;
}

export class EmailService {
  /**
   * Send a single email via SES
   */
  async sendEmail(params: SendEmailParams): Promise<{ messageId: string }> {
    const { to, subject, htmlBody, textBody } = params;

    // Check if external emails are allowed
    const emailDomain = to.split('@')[1]?.toLowerCase();
    const isInternalEmail = emailDomain === ALLOWED_EMAIL_DOMAIN;

    if (!isInternalEmail && !SEND_EXTERNAL_EMAIL) {
      logger.info('BLOCKED: External email not allowed', {
        to,
        subject,
        reason: 'SEND_EXTERNAL_EMAIL is not enabled'
      });
      return { messageId: `blocked-external-${Date.now()}` };
    }

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
  /**
   * Replace template placeholders with actual values
   */
  private replaceTemplatePlaceholders(
    template: string,
    params: {
      firstName: string;
      lastName: string;
      surveyUrl: string;
      unsubscribeUrl: string;
      campaignName: string;
      honorariumAmount?: number | null;
    }
  ): string {
    const honorariumText = params.honorariumAmount
      ? `$${params.honorariumAmount}`
      : '';

    const honorariumBlock = params.honorariumAmount
      ? `<div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border: 1px solid #a7f3d0; padding: 20px; border-radius: 12px; margin: 24px 0; text-align: center;">
        <p style="margin: 0 0 4px 0; font-size: 14px; color: #065f46;">Upon completion, you will receive</p>
        <p style="margin: 0; font-size: 28px; font-weight: 700; color: #047857;">$${params.honorariumAmount}</p>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #065f46;">honorarium</p>
      </div>`
      : '';

    return template
      .replace(/\{firstName\}/g, params.firstName)
      .replace(/\{lastName\}/g, params.lastName)
      .replace(/\{surveyLink\}/g, params.surveyUrl)
      .replace(/\{surveyUrl\}/g, params.surveyUrl)
      .replace(/\{unsubscribeUrl\}/g, params.unsubscribeUrl)
      .replace(/\{campaignName\}/g, params.campaignName)
      .replace(/\{honorarium\}/g, honorariumText)
      .replace(/\{honorariumBlock\}/g, honorariumBlock);
  }

  async sendSurveyInvitation(params: SendInvitationParams): Promise<{ messageId: string }> {
    const {
      campaignId,
      hcpId,
      email,
      firstName,
      lastName,
      surveyToken,
      campaignName,
      honorariumAmount,
      customSubject,
      customBody,
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

    // Use custom subject/body if provided, otherwise use default
    const subject = customSubject
      ? this.replaceTemplatePlaceholders(customSubject, { firstName, lastName, surveyUrl, unsubscribeUrl, campaignName, honorariumAmount })
      : `Your expertise needed: ${campaignName} KOL Survey`;

    // Build honorarium block for default template
    const honorariumBlock = honorariumAmount
      ? `<div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border: 1px solid #a7f3d0; padding: 20px; border-radius: 12px; margin: 24px 0; text-align: center;">
          <p style="margin: 0 0 4px 0; font-size: 14px; color: #065f46;">Upon completion, you will receive</p>
          <p style="margin: 0; font-size: 28px; font-weight: 700; color: #047857;">$${honorariumAmount}</p>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: #065f46;">honorarium</p>
        </div>`
      : '';

    // If custom body provided, use it with placeholder replacement
    let htmlBody: string;
    if (customBody) {
      htmlBody = this.replaceTemplatePlaceholders(customBody, { firstName, lastName, surveyUrl, unsubscribeUrl, campaignName, honorariumAmount });
    } else {
      htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.7; color: #1a1a2e; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
  <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
    <div style="background: linear-gradient(135deg, #147a6d 0%, #0f5d54 100%); padding: 32px 24px; text-align: center;">
      <img src="${APP_URL}/images/logo-white.png" alt="KOL360" style="height: 36px; margin-bottom: 8px;">
      <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 14px;">Key Opinion Leader Research</p>
    </div>

    <div style="padding: 32px 24px;">
      <h2 style="color: #147a6d; margin: 0 0 20px 0; font-size: 22px; font-weight: 600;">Dear Dr. ${lastName},</h2>

      <p style="margin: 0 0 16px 0; color: #374151;">You have been identified as a <strong>key opinion leader</strong> in your field, and we would greatly value your insights.</p>

      <p style="margin: 0 0 16px 0; color: #374151;">We are conducting the <strong style="color: #147a6d;">${campaignName}</strong> research study and would like to invite you to participate in a brief survey about thought leaders in your specialty area.</p>

      <div style="background: #f0fdf9; border-left: 4px solid #147a6d; padding: 16px; border-radius: 0 8px 8px 0; margin: 24px 0;">
        <p style="margin: 0; color: #0f5d54; font-size: 14px;">
          <strong>Estimated time:</strong> 5-10 minutes
        </p>
      </div>

      ${honorariumBlock}

      <div style="text-align: center; margin: 32px 0;">
        <a href="${surveyUrl}" style="background: linear-gradient(135deg, #147a6d 0%, #0f5d54 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 14px rgba(20, 122, 109, 0.4);">
          Start Survey
        </a>
      </div>

      <p style="font-size: 13px; color: #6b7280; margin: 24px 0 8px 0;">If the button doesn't work, copy this link:</p>
      <p style="word-break: break-all; color: #147a6d; font-size: 13px; background: #f8fafc; padding: 12px; border-radius: 8px; margin: 0;">${surveyUrl}</p>
    </div>

    <div style="background: #f8fafc; padding: 24px; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 13px; color: #6b7280; margin: 0 0 8px 0; text-align: center;">
        Your responses will be kept confidential and used only for research purposes.
      </p>
      <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
        <a href="${unsubscribeUrl}" style="color: #9ca3af;">Unsubscribe</a> &middot; BioExec Research &middot; Confidential KOL Survey
      </p>
    </div>
  </div>
</body>
</html>
    `.trim();
    }

    // Generate plain text version (strip HTML if custom body was provided)
    const textBody = customBody
      ? htmlBody.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
      : `
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
      firstName,
      lastName,
      surveyToken,
      campaignName,
      honorariumAmount,
      reminderNumber,
      customSubject,
      customBody,
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

    // Use custom subject/body if provided, otherwise use default
    const subject = customSubject
      ? this.replaceTemplatePlaceholders(customSubject, { firstName, lastName, surveyUrl, unsubscribeUrl, campaignName, honorariumAmount })
      : `Reminder: ${campaignName} KOL Survey - We value your input`;

    // Build honorarium block for default template
    const honorariumBlock = honorariumAmount
      ? `<div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border: 1px solid #a7f3d0; padding: 20px; border-radius: 12px; margin: 24px 0; text-align: center;">
          <p style="margin: 0 0 4px 0; font-size: 14px; color: #065f46;">Upon completion, you will receive</p>
          <p style="margin: 0; font-size: 28px; font-weight: 700; color: #047857;">$${honorariumAmount}</p>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: #065f46;">honorarium</p>
        </div>`
      : '';

    let htmlBody: string;
    if (customBody) {
      htmlBody = this.replaceTemplatePlaceholders(customBody, { firstName, lastName, surveyUrl, unsubscribeUrl, campaignName, honorariumAmount });
    } else {
      htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.7; color: #1a1a2e; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
  <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
    <div style="background: linear-gradient(135deg, #147a6d 0%, #0f5d54 100%); padding: 32px 24px; text-align: center;">
      <img src="${APP_URL}/images/logo-white.png" alt="KOL360" style="height: 36px; margin-bottom: 8px;">
      <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 14px;">Key Opinion Leader Research</p>
    </div>

    <div style="padding: 32px 24px;">
      <div style="display: inline-block; background: #fef3c7; color: #92400e; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 20px;">
        Friendly Reminder
      </div>

      <h2 style="color: #147a6d; margin: 0 0 20px 0; font-size: 22px; font-weight: 600;">Dear Dr. ${lastName},</h2>

      <p style="margin: 0 0 16px 0; color: #374151;">We recently invited you to participate in the <strong style="color: #147a6d;">${campaignName}</strong> research study, and we noticed you haven't yet completed the survey.</p>

      <p style="margin: 0 0 16px 0; color: #374151;">${urgencyText}Your insights as a key opinion leader are <strong>invaluable</strong> to this research.</p>

      <div style="background: #f0fdf9; border-left: 4px solid #147a6d; padding: 16px; border-radius: 0 8px 8px 0; margin: 24px 0;">
        <p style="margin: 0; color: #0f5d54; font-size: 14px;">
          <strong>Only 5-10 minutes</strong> to complete
        </p>
      </div>

      ${honorariumBlock}

      <div style="text-align: center; margin: 32px 0;">
        <a href="${surveyUrl}" style="background: linear-gradient(135deg, #147a6d 0%, #0f5d54 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 14px rgba(20, 122, 109, 0.4);">
          Complete Survey Now
        </a>
      </div>

      <p style="font-size: 13px; color: #6b7280; margin: 24px 0 8px 0;">If the button doesn't work, copy this link:</p>
      <p style="word-break: break-all; color: #147a6d; font-size: 13px; background: #f8fafc; padding: 12px; border-radius: 8px; margin: 0;">${surveyUrl}</p>
    </div>

    <div style="background: #f8fafc; padding: 24px; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
        <a href="${unsubscribeUrl}" style="color: #9ca3af;">Unsubscribe</a> &middot; BioExec Research &middot; Confidential KOL Survey
      </p>
    </div>
  </div>
</body>
</html>
    `.trim();
    }

    // Generate plain text version (strip HTML if custom body was provided)
    const textBody = customBody
      ? htmlBody.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
      : `
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
        diseaseAreaId: true,
        honorariumAmount: true,
        invitationEmailSubject: true,
        invitationEmailBody: true,
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

    // Check for HCPs who completed a survey for the same disease area in the past year
    // Only enforce this rule in production - allow re-surveying in dev/test environments
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const hcpIds = uninvitedHcps.map(ch => ch.hcpId);
    let recentlyCompletedSurveys: Array<{ respondentHcpId: string; completedAt: Date | null; campaign: { name: string } }> = [];

    if (IS_PRODUCTION) {
      recentlyCompletedSurveys = await prisma.surveyResponse.findMany({
        where: {
          respondentHcpId: { in: hcpIds },
          status: 'COMPLETED',
          completedAt: { gte: oneYearAgo },
          campaign: {
            diseaseAreaId: campaign.diseaseAreaId,
            id: { not: campaignId }, // Exclude current campaign
          },
        },
        select: {
          respondentHcpId: true,
          completedAt: true,
          campaign: { select: { name: true } },
        },
      });
    } else {
      logger.info('12-month survey cooldown bypassed (non-production environment)', { campaignId });
    }

    const recentlySurveyedHcpIds = new Set(recentlyCompletedSurveys.map(r => r.respondentHcpId));

    // Check for opt-outs
    const optOuts = await prisma.optOut.findMany({
      where: {
        email: { in: uninvitedHcps.filter(ch => ch.hcp.email).map(ch => ch.hcp.email!) },
        resubscribedAt: null,
        OR: [
          { scope: 'GLOBAL' },
          { scope: 'CAMPAIGN', campaignId },
        ],
      },
      select: { email: true },
    });
    const optedOutEmails = new Set(optOuts.map(o => o.email.toLowerCase()));

    const result: BulkSendResult = {
      sent: 0,
      failed: 0,
      skipped: 0,
      skippedNoEmail: 0,
      skippedOptedOut: 0,
      skippedRecentlySurveyed: 0,
      errors: [],
    };

    for (const campaignHcp of uninvitedHcps) {
      const { hcp, surveyToken } = campaignHcp;

      // Check: No email
      if (!hcp.email) {
        result.skipped++;
        result.skippedNoEmail = (result.skippedNoEmail || 0) + 1;
        result.errors.push({ email: 'N/A', error: `HCP ${hcp.firstName} ${hcp.lastName} has no email` });
        continue;
      }

      // Check: Opted out
      if (optedOutEmails.has(hcp.email.toLowerCase())) {
        result.skipped++;
        result.skippedOptedOut = (result.skippedOptedOut || 0) + 1;
        result.errors.push({ email: hcp.email, error: 'Opted out' });
        continue;
      }

      // Check: Recently surveyed in same disease area
      if (recentlySurveyedHcpIds.has(hcp.id)) {
        result.skipped++;
        result.skippedRecentlySurveyed = (result.skippedRecentlySurveyed || 0) + 1;

        // Find the most recent completed survey for this HCP in same disease area
        const previousSurvey = recentlyCompletedSurveys.find(r => r.respondentHcpId === hcp.id);

        // Create a SurveyResponse with RECENTLY_SURVEYED status
        await prisma.surveyResponse.upsert({
          where: {
            surveyToken: surveyToken,
          },
          create: {
            campaignId,
            respondentHcpId: hcp.id,
            surveyToken,
            status: 'RECENTLY_SURVEYED',
            completedAt: previousSurvey?.completedAt, // Carry over completion date for reference
          },
          update: {
            status: 'RECENTLY_SURVEYED',
            completedAt: previousSurvey?.completedAt,
          },
        });

        // Copy nominations (survey responses) from the previous campaign to current campaign
        // This copies how the HCP rated/nominated others, not the scores they received
        const previousResponse = await prisma.surveyResponse.findFirst({
          where: {
            respondentHcpId: hcp.id,
            status: 'COMPLETED',
            completedAt: { gte: oneYearAgo },
            campaign: {
              diseaseAreaId: campaign.diseaseAreaId,
              id: { not: campaignId },
            },
          },
          include: {
            nominations: {
              include: {
                question: { select: { nominationType: true } },
              },
            },
          },
          orderBy: { completedAt: 'desc' },
        });

        let nominationsCopied = 0;
        if (previousResponse && previousResponse.nominations.length > 0) {
          // Get the SurveyResponse we just created for the new campaign
          const newResponse = await prisma.surveyResponse.findUnique({
            where: { surveyToken },
          });

          if (newResponse) {
            // Get survey questions for the current campaign (mapped by nominationType)
            const currentCampaignQuestions = await prisma.surveyQuestion.findMany({
              where: { campaignId, nominationType: { not: null } },
            });
            const questionByType = new Map(
              currentCampaignQuestions.map(q => [q.nominationType, q.id])
            );

            // Copy each nomination to the new campaign
            for (const nomination of previousResponse.nominations) {
              const nominationType = nomination.question?.nominationType;
              if (!nominationType) continue;

              const targetQuestionId = questionByType.get(nominationType);
              if (!targetQuestionId) continue;

              await prisma.nomination.create({
                data: {
                  responseId: newResponse.id,
                  questionId: targetQuestionId,
                  nominatorHcpId: hcp.id,
                  rawNameEntered: nomination.rawNameEntered,
                  matchedHcpId: nomination.matchedHcpId,
                  matchStatus: nomination.matchStatus,
                  matchedBy: nomination.matchedBy,
                  matchedAt: nomination.matchedAt,
                  matchConfidence: nomination.matchConfidence,
                  matchType: nomination.matchType,
                  excludeReason: nomination.excludeReason,
                },
              });
              nominationsCopied++;
            }
          }
        }

        result.errors.push({
          email: hcp.email,
          error: `Recently surveyed in same disease area - ${nominationsCopied} nominations copied`,
        });
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
          customSubject: campaign.invitationEmailSubject,
          customBody: campaign.invitationEmailBody,
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
        reminderEmailSubject: true,
        reminderEmailBody: true,
      },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.status !== 'ACTIVE') {
      throw new Error('Can only send reminders for active campaigns');
    }

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Get all HCPs who have been invited (no reminder count filter - we'll count those separately)
    const allInvitedHcps = await prisma.campaignHcp.findMany({
      where: {
        campaignId,
        emailSentAt: { not: null },
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

    // Get completed HCP IDs
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
      skippedCompleted: 0,
      skippedRecentlyReminded: 0,
      skippedMaxReminders: 0,
      errors: [],
    };

    for (const campaignHcp of allInvitedHcps) {
      const { hcp, surveyToken, reminderCount, lastReminderAt } = campaignHcp;

      // Check if completed (highest priority - count all completed)
      if (completedHcpIds.has(hcp.id)) {
        result.skipped++;
        result.skippedCompleted!++;
        continue;
      }

      // Check if max reminders reached
      if (reminderCount >= maxReminders) {
        result.skipped++;
        result.skippedMaxReminders!++;
        continue;
      }

      // Check 24-hour cooldown (only in production mode)
      if (!MOCK_MODE && lastReminderAt && lastReminderAt >= oneDayAgo) {
        result.skipped++;
        result.skippedRecentlyReminded!++;
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
          customSubject: campaign.reminderEmailSubject,
          customBody: campaign.reminderEmailBody,
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
