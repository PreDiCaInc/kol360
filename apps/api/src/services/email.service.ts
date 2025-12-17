import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });
const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'noreply@bio-exec.com';
const SURVEY_BASE_URL = process.env.SURVEY_BASE_URL || 'https://kol360.bio-exec.com';

export class EmailService {
  async sendSurveyInvitation(params: {
    to: string;
    hcpName: string;
    surveyToken: string;
    campaignName: string;
    honorarium?: number;
  }) {
    const surveyUrl = `${SURVEY_BASE_URL}/survey/${params.surveyToken}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #0066CC;">You're Invited to Participate in a KOL Survey</h2>
          <p>Dear Dr. ${params.hcpName},</p>
          <p>You have been selected to participate in our <strong>${params.campaignName}</strong> survey.</p>
          ${params.honorarium ? `<p>Upon completion, you will receive a <strong>$${params.honorarium}</strong> honorarium.</p>` : ''}
          <p style="margin: 30px 0;">
            <a href="${surveyUrl}" style="background:#0066CC;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;display:inline-block;">Take Survey</a>
          </p>
          <p style="font-size: 14px; color: #666;">Or copy this link: ${surveyUrl}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="font-size: 12px; color: #999;">
            Don't want to receive these emails? <a href="${SURVEY_BASE_URL}/unsubscribe/${params.surveyToken}" style="color: #666;">Unsubscribe</a>
          </p>
        </div>
      </body>
      </html>
    `;

    const textBody = `
Dear Dr. ${params.hcpName},

You have been selected to participate in our ${params.campaignName} survey.
${params.honorarium ? `Upon completion, you will receive a $${params.honorarium} honorarium.` : ''}

Take the survey here: ${surveyUrl}

To unsubscribe: ${SURVEY_BASE_URL}/unsubscribe/${params.surveyToken}
    `.trim();

    await ses.send(new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [params.to] },
      Message: {
        Subject: { Data: `Survey Invitation: ${params.campaignName}` },
        Body: {
          Html: { Data: html },
          Text: { Data: textBody },
        },
      },
    }));
  }

  async sendReminder(params: {
    to: string;
    hcpName: string;
    surveyToken: string;
    campaignName: string;
    reminderNumber: number;
  }) {
    const surveyUrl = `${SURVEY_BASE_URL}/survey/${params.surveyToken}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #0066CC;">Reminder: Complete Your Survey</h2>
          <p>Dear Dr. ${params.hcpName},</p>
          <p>This is a friendly reminder to complete the <strong>${params.campaignName}</strong> survey.</p>
          <p style="margin: 30px 0;">
            <a href="${surveyUrl}" style="background:#0066CC;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;display:inline-block;">Complete Survey</a>
          </p>
          <p style="font-size: 14px; color: #666;">Or copy this link: ${surveyUrl}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="font-size: 12px; color: #999;">
            Don't want to receive these emails? <a href="${SURVEY_BASE_URL}/unsubscribe/${params.surveyToken}" style="color: #666;">Unsubscribe</a>
          </p>
        </div>
      </body>
      </html>
    `;

    const textBody = `
Dear Dr. ${params.hcpName},

This is a friendly reminder to complete the ${params.campaignName} survey.

Complete the survey here: ${surveyUrl}

To unsubscribe: ${SURVEY_BASE_URL}/unsubscribe/${params.surveyToken}
    `.trim();

    await ses.send(new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [params.to] },
      Message: {
        Subject: { Data: `Reminder: ${params.campaignName} Survey` },
        Body: {
          Html: { Data: html },
          Text: { Data: textBody },
        },
      },
    }));
  }
}
