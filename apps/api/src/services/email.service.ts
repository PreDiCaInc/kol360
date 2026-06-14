import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { importProgressStore } from './import-progress.service';
import { isPlaceholderEmail } from '@kol360/shared';

const ses = new SESClient({
  region: process.env.AWS_REGION || 'us-east-2',
});

const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'research@bio-exec.com';
const FROM_NAME = process.env.SES_FROM_NAME || 'BioExec KOL Research';
const MOCK_MODE = process.env.EMAIL_MOCK_MODE === 'true';
const SEND_EXTERNAL_EMAIL = process.env.SEND_EXTERNAL_EMAIL === 'true';
const ALLOWED_EMAIL_DOMAIN = 'bio-exec.com';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Base URL for survey links - derive from environment if not explicitly set
function getAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.NODE_ENV === 'production') return 'https://kol360.bio-exec.com';
  if (process.env.NODE_ENV === 'staging') return 'https://koltest.bio-exec.com';
  return 'http://localhost:3000';
}
const APP_URL = getAppUrl();

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
  /** v1.17.36: placeholder addresses (nomail@*) — distinct from
   * skippedNoEmail. Surfaces in the admin UI so the customer can see
   * how many of their HCPs need a real email on file before the next
   * campaign cycle. See bulk-send-accepts-placeholder-emails-2026-06-13.md. */
  skippedPlaceholder?: number;
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

    // v1.17.36: placeholder-aware gate. Mirrors the bulk-send change.
    // Single-send paths can also be hit directly (admin "resend
    // invitation" button) and need the same protection.
    if (isPlaceholderEmail(email)) {
      logger.info('Skipping email - placeholder address', { email, hcpId });
      throw new Error('Recipient has placeholder email — not sending');
    }

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

    const honorariumDisplay = honorariumAmount ? `$${honorariumAmount}` : '$XYZ';
    const honorariumText = `As a thank you for your time, you will receive a ${honorariumDisplay} gift card for completing the survey.*`;

    // Use custom subject/body if provided, otherwise use default
    const subject = customSubject
      ? this.replaceTemplatePlaceholders(customSubject, { firstName, lastName, surveyUrl, unsubscribeUrl, campaignName, honorariumAmount })
      : `Who do you trust for Dry Eye insights?`;

    // Build honorarium block for custom template placeholder replacement
    const honorariumBlock = `<p style="margin: 0 0 16px 0; color: #374151;">As a thank you for your time, you will receive a <strong>${honorariumDisplay} gift card</strong> for completing the survey.*</p>`;

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
      <h2 style="color: #147a6d; margin: 0 0 20px 0; font-size: 22px; font-weight: 600;">Dear ${firstName} ${lastName},</h2>

      <p style="margin: 0 0 16px 0; color: #374151;">We invite you to participate in a short 10-minute survey to identify your colleagues shaping the field of dry eye disease.</p>

      <p style="margin: 0 0 16px 0; color: #374151;">Your input will help us understand the physicians you turn to for trusted insights, whether established key opinion leaders or emerging voices advancing the diagnosis and treatment of dry eye disease.</p>

      <p style="margin: 0 0 16px 0; color: #374151;">As a thank you for your time, you will receive a <strong>${honorariumDisplay} gift card</strong> for completing the survey.*</p>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${surveyUrl}" style="background: linear-gradient(135deg, #147a6d 0%, #0f5d54 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 14px rgba(20, 122, 109, 0.4);">
          Start Survey
        </a>
      </div>

      <p style="margin: 0 0 16px 0; color: #374151;">Thank you for your participation!</p>

      <p style="margin: 0 0 4px 0; color: #374151;">Sincerely,</p>
      <p style="margin: 0 0 2px 0; color: #374151; font-weight: 600;">Joe Boyd</p>
      <p style="margin: 0 0 0 0; color: #6b7280; font-size: 14px;">COO, Bio-Exec, LLC</p>

      <p style="font-size: 12px; color: #9ca3af; margin: 24px 0 0 0;">*Please note: Due to state laws, we are unable to provide honoraria/payments to physicians in Vermont or Maine.</p>

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
Dear ${firstName} ${lastName},

We invite you to participate in a short 10-minute survey to identify your colleagues shaping the field of dry eye disease.

Your input will help us understand the physicians you turn to for trusted insights, whether established key opinion leaders or emerging voices advancing the diagnosis and treatment of dry eye disease.

${honorariumText}

To start the survey, visit:
${surveyUrl}

Thank you for your participation!

Sincerely,
Joe Boyd
COO, Bio-Exec, LLC

*Please note: Due to state laws, we are unable to provide honoraria/payments to physicians in Vermont or Maine.

To unsubscribe from this survey, visit:
${unsubscribeUrl}
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

    // v1.17.36: placeholder-aware gate for the single-reminder path
    // (used by admin "resend reminder" button).
    if (isPlaceholderEmail(email)) {
      logger.info('Skipping reminder - placeholder address', { email, hcpId });
      throw new Error('Recipient has placeholder email — not sending');
    }

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

    const honorariumDisplay = honorariumAmount ? `$${honorariumAmount}` : '$XYZ';
    const honorariumText = `As a thank you for your time, you will receive a ${honorariumDisplay} gift card for completing the survey.*`;

    const urgencyText = reminderNumber >= 2
      ? 'This survey will be closing soon. '
      : '';

    // Use custom subject/body if provided, otherwise use default
    const subject = customSubject
      ? this.replaceTemplatePlaceholders(customSubject, { firstName, lastName, surveyUrl, unsubscribeUrl, campaignName, honorariumAmount })
      : `Reminder: ${campaignName} KOL Survey - We value your input`;

    // Build honorarium block for custom template placeholder replacement
    const honorariumBlock = `<p style="margin: 0 0 16px 0; color: #374151;">As a thank you for your time, you will receive a <strong>${honorariumDisplay} gift card</strong> for completing the survey.*</p>`;

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

      <h2 style="color: #147a6d; margin: 0 0 20px 0; font-size: 22px; font-weight: 600;">Dear ${firstName} ${lastName},</h2>

      <p style="margin: 0 0 16px 0; color: #374151;">We recently invited you to participate in a short survey to identify your colleagues shaping the field of dry eye disease, and we noticed you haven't yet completed it.</p>

      <p style="margin: 0 0 16px 0; color: #374151;">${urgencyText}Your insights are <strong>invaluable</strong> to this research. The survey takes only about 10 minutes to complete.</p>

      <p style="margin: 0 0 16px 0; color: #374151;">As a thank you for your time, you will receive a <strong>${honorariumDisplay} gift card</strong> for completing the survey.*</p>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${surveyUrl}" style="background: linear-gradient(135deg, #147a6d 0%, #0f5d54 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 14px rgba(20, 122, 109, 0.4);">
          Complete Survey Now
        </a>
      </div>

      <p style="margin: 0 0 16px 0; color: #374151;">Thank you for your participation!</p>

      <p style="margin: 0 0 4px 0; color: #374151;">Sincerely,</p>
      <p style="margin: 0 0 2px 0; color: #374151; font-weight: 600;">Joe Boyd</p>
      <p style="margin: 0 0 0 0; color: #6b7280; font-size: 14px;">COO, Bio-Exec, LLC</p>

      <p style="font-size: 12px; color: #9ca3af; margin: 24px 0 0 0;">*Please note: Due to state laws, we are unable to provide honoraria/payments to physicians in Vermont or Maine.</p>

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
Dear ${firstName} ${lastName},

We recently invited you to participate in a short survey to identify your colleagues shaping the field of dry eye disease, and we noticed you haven't yet completed it.

${urgencyText}Your insights are invaluable to this research. The survey takes only about 10 minutes to complete.

${honorariumText}

To complete the survey, visit:
${surveyUrl}

Thank you for your participation!

Sincerely,
Joe Boyd
COO, Bio-Exec, LLC

*Please note: Due to state laws, we are unable to provide honoraria/payments to physicians in Vermont or Maine.

To unsubscribe, visit:
${unsubscribeUrl}
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
  async sendBulkInvitations(campaignId: string, progressId?: string): Promise<BulkSendResult> {
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

    // Start progress tracking if progressId provided
    if (progressId) {
      importProgressStore.start(progressId, 'email-invitations', uninvitedHcps.length);
    }

    try {
      for (let i = 0; i < uninvitedHcps.length; i++) {
        const campaignHcp = uninvitedHcps[i];
        const { hcp, surveyToken } = campaignHcp;

        // v1.17.36: placeholder-aware skip. Pre-fix this was bare
        // `if (!hcp.email)` which only blocked NULLs. Operators have
        // historically typed `nomail@bio-exec.com` or
        // `nomail@kol360research.com` when no real address was on
        // file; those passed the NULL check, went to SES, got 250 OK,
        // and the platform marked emailSentAt — 269 confirmed
        // bounces across the two ACTIVE Sun Pharma 2026 campaigns
        // happened this way. See
        // docs/findings/bulk-send-accepts-placeholder-emails-2026-06-13.md.
        if (isPlaceholderEmail(hcp.email)) {
          result.skipped++;
          if (!hcp.email) {
            result.skippedNoEmail = (result.skippedNoEmail || 0) + 1;
            result.errors.push({ email: 'N/A', error: `HCP ${hcp.firstName} ${hcp.lastName} has no email` });
          } else {
            result.skippedPlaceholder = (result.skippedPlaceholder || 0) + 1;
            result.errors.push({
              email: hcp.email,
              error: `HCP ${hcp.firstName} ${hcp.lastName} has placeholder email — not sending`,
            });
          }
          if (progressId) {
            importProgressStore.update(progressId, {
              processed: i + 1, created: result.sent, updated: result.skipped, errors: result.failed,
              currentItem: `Skipped: ${hcp.firstName} ${hcp.lastName} (${hcp.email ? 'placeholder' : 'no email'})`,
            });
          }
          continue;
        }

        // Check: Opted out
        if (optedOutEmails.has(hcp.email.toLowerCase())) {
          result.skipped++;
          result.skippedOptedOut = (result.skippedOptedOut || 0) + 1;
          result.errors.push({ email: hcp.email, error: 'Opted out' });
          if (progressId) {
            importProgressStore.update(progressId, {
              processed: i + 1, created: result.sent, updated: result.skipped, errors: result.failed,
              currentItem: `Skipped: ${hcp.email} (opted out)`,
            });
          }
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
              completedAt: previousSurvey?.completedAt,
            },
            update: {
              status: 'RECENTLY_SURVEYED',
              completedAt: previousSurvey?.completedAt,
            },
          });

          // Copy nominations from the previous campaign to current campaign
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
            const newResponse = await prisma.surveyResponse.findUnique({
              where: { surveyToken },
            });

            if (newResponse) {
              const currentCampaignQuestions = await prisma.surveyQuestion.findMany({
                where: { campaignId, nominationType: { not: null } },
              });
              const questionByType = new Map(
                currentCampaignQuestions.map(q => [q.nominationType, q.id])
              );

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
          if (progressId) {
            importProgressStore.update(progressId, {
              processed: i + 1, created: result.sent, updated: result.skipped, errors: result.failed,
              currentItem: `Skipped: ${hcp.email} (recently surveyed)`,
            });
          }
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

        // Update progress after each HCP (sent or failed)
        if (progressId) {
          importProgressStore.update(progressId, {
            processed: i + 1,
            created: result.sent,
            updated: result.skipped,
            errors: result.failed,
            currentItem: `${hcp.email}`,
          });
        }
      }

      // Mark complete with full result data
      if (progressId) {
        importProgressStore.complete(progressId, {
          created: result.sent,
          updated: result.skipped,
          errors: result.failed,
          resultData: result as unknown as Record<string, unknown>,
        });
      }
    } catch (error) {
      // Catastrophic failure (auth error, etc.)
      if (progressId) {
        importProgressStore.fail(progressId, error instanceof Error ? error.message : 'Unknown error');
      }
      throw error;
    }

    return result;
  }

  /**
   * Send reminders to all HCPs who haven't completed the survey
   */
  async sendBulkReminders(campaignId: string, maxReminders: number = 3, progressId?: string): Promise<BulkSendResult> {
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

    // Start progress tracking if progressId provided
    if (progressId) {
      importProgressStore.start(progressId, 'email-reminders', allInvitedHcps.length);
    }

    try {
      for (let i = 0; i < allInvitedHcps.length; i++) {
        const campaignHcp = allInvitedHcps[i];
        const { hcp, surveyToken, reminderCount, lastReminderAt } = campaignHcp;

        // Check if completed (highest priority - count all completed)
        if (completedHcpIds.has(hcp.id)) {
          result.skipped++;
          result.skippedCompleted!++;
          if (progressId) {
            importProgressStore.update(progressId, {
              processed: i + 1, created: result.sent, updated: result.skipped, errors: result.failed,
              currentItem: `Skipped: ${hcp.email || hcp.firstName} (completed)`,
            });
          }
          continue;
        }

        // Check if max reminders reached
        if (reminderCount >= maxReminders) {
          result.skipped++;
          result.skippedMaxReminders!++;
          if (progressId) {
            importProgressStore.update(progressId, {
              processed: i + 1, created: result.sent, updated: result.skipped, errors: result.failed,
              currentItem: `Skipped: ${hcp.email || hcp.firstName} (max reminders)`,
            });
          }
          continue;
        }

        // Check 24-hour cooldown (only in production mode)
        if (!MOCK_MODE && lastReminderAt && lastReminderAt >= oneDayAgo) {
          result.skipped++;
          result.skippedRecentlyReminded!++;
          if (progressId) {
            importProgressStore.update(progressId, {
              processed: i + 1, created: result.sent, updated: result.skipped, errors: result.failed,
              currentItem: `Skipped: ${hcp.email || hcp.firstName} (recently reminded)`,
            });
          }
          continue;
        }

        // v1.17.36: same placeholder-aware skip in the reminder loop.
        if (isPlaceholderEmail(hcp.email)) {
          result.skipped++;
          if (!hcp.email) {
            result.skippedNoEmail = (result.skippedNoEmail || 0) + 1;
          } else {
            result.skippedPlaceholder = (result.skippedPlaceholder || 0) + 1;
          }
          if (progressId) {
            importProgressStore.update(progressId, {
              processed: i + 1, created: result.sent, updated: result.skipped, errors: result.failed,
              currentItem: `Skipped: ${hcp.firstName} ${hcp.lastName} (${hcp.email ? 'placeholder' : 'no email'})`,
            });
          }
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

        // Update progress after each HCP
        if (progressId) {
          importProgressStore.update(progressId, {
            processed: i + 1,
            created: result.sent,
            updated: result.skipped,
            errors: result.failed,
            currentItem: `${hcp.email}`,
          });
        }
      }

      // Mark complete with full result data
      if (progressId) {
        importProgressStore.complete(progressId, {
          created: result.sent,
          updated: result.skipped,
          errors: result.failed,
          resultData: result as unknown as Record<string, unknown>,
        });
      }
    } catch (error) {
      if (progressId) {
        importProgressStore.fail(progressId, error instanceof Error ? error.message : 'Unknown error');
      }
      throw error;
    }

    return result;
  }
}

export const emailService = new EmailService();
