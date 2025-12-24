'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Eye, Mail, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

type PreviewType = 'invitation' | 'reminder' | 'welcome' | 'thankyou' | 'already-done';

interface TemplatePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: PreviewType;
  campaignName: string;
  honorariumAmount?: number | null;
  // Email templates
  invitationSubject?: string;
  invitationBody?: string;
  reminderSubject?: string;
  reminderBody?: string;
  // Landing page templates
  welcomeTitle?: string;
  welcomeMessage?: string;
  thankYouTitle?: string;
  thankYouMessage?: string;
  alreadyDoneTitle?: string;
  alreadyDoneMessage?: string;
}

// Sample data for preview
const SAMPLE_DATA = {
  firstName: 'John',
  lastName: 'Smith',
  surveyLink: 'https://kol360.bio-exec.com/survey/abc123',
  unsubscribeUrl: 'https://kol360.bio-exec.com/unsubscribe/abc123',
};

// Default templates matching the email service
const DEFAULT_INVITATION_SUBJECT = 'Your expertise needed: {campaignName} KOL Survey';
const DEFAULT_INVITATION_BODY = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <img src="/images/logo-black.png" alt="BioExec" style="height: 40px;">
  </div>

  <h2 style="color: #0066CC;">Dear Dr. {lastName},</h2>

  <p>You have been identified as a key opinion leader in your field, and we would greatly value your insights.</p>

  <p>We are conducting the <strong>{campaignName}</strong> research study and would like to invite you to participate in a brief survey about thought leaders in your specialty area.</p>

  <p>The survey takes approximately <strong>5-10 minutes</strong> to complete.</p>

  {honorariumBlock}

  <div style="text-align: center; margin: 30px 0;">
    <a href="{surveyLink}" style="background-color: #0066CC; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
      Start Survey
    </a>
  </div>

  <p>If the button above doesn't work, copy and paste this link into your browser:</p>
  <p style="word-break: break-all; color: #666; font-size: 14px;">{surveyLink}</p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

  <p style="font-size: 14px; color: #666;">
    Your responses will be kept confidential and used only for research purposes.
  </p>

  <p style="font-size: 12px; color: #999;">
    If you wish to unsubscribe from this survey, <a href="{unsubscribeUrl}" style="color: #999;">click here</a>.
  </p>

  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999; text-align: center;">
    <p>BioExec Research | Confidential KOL Survey</p>
  </div>
</body>
</html>
`;

const DEFAULT_REMINDER_SUBJECT = 'Reminder: {campaignName} KOL Survey - We value your input';
const DEFAULT_REMINDER_BODY = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <img src="/images/logo-black.png" alt="BioExec" style="height: 40px;">
  </div>

  <h2 style="color: #0066CC;">Dear Dr. {lastName},</h2>

  <p>We recently invited you to participate in the <strong>{campaignName}</strong> research study, and we noticed you haven't yet completed the survey.</p>

  <p>Your insights as a key opinion leader are invaluable to this research.</p>

  <p>The survey takes only <strong>5-10 minutes</strong> to complete.</p>

  {honorariumBlock}

  <div style="text-align: center; margin: 30px 0;">
    <a href="{surveyLink}" style="background-color: #0066CC; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
      Complete Survey Now
    </a>
  </div>

  <p>If the button above doesn't work, copy and paste this link into your browser:</p>
  <p style="word-break: break-all; color: #666; font-size: 14px;">{surveyLink}</p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

  <p style="font-size: 12px; color: #999;">
    If you wish to unsubscribe from this survey, <a href="{unsubscribeUrl}" style="color: #999;">click here</a>.
  </p>

  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999; text-align: center;">
    <p>BioExec Research | Confidential KOL Survey</p>
  </div>
</body>
</html>
`;

function replacePlaceholders(
  template: string,
  campaignName: string,
  honorariumAmount?: number | null
): string {
  const honorariumBlock = honorariumAmount
    ? `<p style="background-color: #f0f7ff; padding: 15px; border-radius: 5px;">As a thank you for your participation, you will receive a $${honorariumAmount} honorarium upon completion.</p>`
    : '';
  const honorariumText = honorariumAmount ? `$${honorariumAmount}` : '';

  return template
    .replace(/\{firstName\}/g, SAMPLE_DATA.firstName)
    .replace(/\{lastName\}/g, SAMPLE_DATA.lastName)
    .replace(/\{surveyLink\}/g, SAMPLE_DATA.surveyLink)
    .replace(/\{surveyUrl\}/g, SAMPLE_DATA.surveyLink)
    .replace(/\{unsubscribeUrl\}/g, SAMPLE_DATA.unsubscribeUrl)
    .replace(/\{campaignName\}/g, campaignName)
    .replace(/\{honorarium\}/g, honorariumText)
    .replace(/\{honorariumBlock\}/g, honorariumBlock);
}

export function TemplatePreviewDialog({
  open,
  onOpenChange,
  type,
  campaignName,
  honorariumAmount,
  invitationSubject,
  invitationBody,
  reminderSubject,
  reminderBody,
  welcomeTitle,
  welcomeMessage,
  thankYouTitle,
  thankYouMessage,
  alreadyDoneTitle,
  alreadyDoneMessage,
}: TemplatePreviewDialogProps) {
  const [activeTab, setActiveTab] = useState<PreviewType>(type);

  const renderEmailPreview = (
    subject: string | undefined,
    body: string | undefined,
    defaultSubject: string,
    defaultBody: string,
    emailType: 'invitation' | 'reminder'
  ) => {
    const finalSubject = replacePlaceholders(
      subject || defaultSubject,
      campaignName,
      honorariumAmount
    );
    const finalBody = replacePlaceholders(
      body || defaultBody,
      campaignName,
      honorariumAmount
    );

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Mail className="w-4 h-4" />
          <span>{emailType === 'invitation' ? 'Invitation Email' : 'Reminder Email'} Preview</span>
          {!body && <Badge variant="secondary">Using Default Template</Badge>}
        </div>

        {/* Email Header Mock */}
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-100 p-3 border-b space-y-1">
            <div className="flex gap-2 text-sm">
              <span className="text-muted-foreground w-16">From:</span>
              <span>BioExec KOL Research &lt;noreply@bio-exec.com&gt;</span>
            </div>
            <div className="flex gap-2 text-sm">
              <span className="text-muted-foreground w-16">To:</span>
              <span>dr.{SAMPLE_DATA.lastName.toLowerCase()}@example.com</span>
            </div>
            <div className="flex gap-2 text-sm">
              <span className="text-muted-foreground w-16">Subject:</span>
              <span className="font-medium">{finalSubject}</span>
            </div>
          </div>

          {/* Email Body */}
          <div
            className="p-4 bg-white"
            dangerouslySetInnerHTML={{ __html: finalBody }}
          />
        </div>
      </div>
    );
  };

  const renderLandingPagePreview = (
    previewType: 'welcome' | 'thankyou' | 'already-done'
  ) => {
    let title: string;
    let message: string;
    let icon: React.ReactNode;
    let defaultTitle: string;
    let defaultMessage: string;

    switch (previewType) {
      case 'welcome':
        title = welcomeTitle || '';
        message = welcomeMessage || '';
        defaultTitle = campaignName;
        defaultMessage = 'Thank you for participating in this survey. Your responses will help us better understand key opinion leaders in this field.';
        icon = null;
        break;
      case 'thankyou':
        title = thankYouTitle || '';
        message = thankYouMessage || '';
        defaultTitle = 'Thank You!';
        defaultMessage = `Thank you for completing the survey, Dr. ${SAMPLE_DATA.lastName}.`;
        icon = <CheckCircle2 className="w-12 h-12 text-green-500" />;
        break;
      case 'already-done':
        title = alreadyDoneTitle || '';
        message = alreadyDoneMessage || '';
        defaultTitle = 'Survey Already Completed';
        defaultMessage = 'You have already completed this survey. Thank you for your participation.';
        icon = <AlertCircle className="w-12 h-12 text-blue-500" />;
        break;
    }

    const finalTitle = title || defaultTitle;
    const finalMessage = message || defaultMessage;

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="w-4 h-4" />
          <span>
            {previewType === 'welcome' ? 'Welcome Page' :
             previewType === 'thankyou' ? 'Thank You Page' : 'Already Completed Page'} Preview
          </span>
          {!title && !message && <Badge variant="secondary">Using Defaults</Badge>}
        </div>

        {/* Landing Page Mock */}
        <div className="bg-gray-100 rounded-lg p-8">
          <Card className="max-w-md mx-auto">
            {previewType === 'welcome' ? (
              <>
                <CardHeader>
                  <CardTitle>{finalTitle}</CardTitle>
                  <CardDescription>Welcome, Dr. {SAMPLE_DATA.lastName}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">{finalMessage}</p>
                  {honorariumAmount && (
                    <p className="text-sm bg-green-50 text-green-800 p-3 rounded-md">
                      Upon completion, you will receive a ${honorariumAmount} honorarium.
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    This survey contains questions across multiple sections.
                    Your progress will be saved automatically.
                  </p>
                  <Button className="w-full" disabled>Begin Survey</Button>
                </CardContent>
              </>
            ) : (
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center">
                  {icon}
                  <h2 className="text-xl font-semibold mt-4 mb-2">{finalTitle}</h2>
                  <p className="text-muted-foreground">{finalMessage}</p>
                  {previewType === 'thankyou' && honorariumAmount && (
                    <p className="mt-4 text-sm">
                      Your ${honorariumAmount} honorarium will be processed shortly.
                    </p>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    );
  };

  const tabs: { key: PreviewType; label: string; icon: React.ReactNode }[] = [
    { key: 'invitation', label: 'Invitation', icon: <Mail className="w-4 h-4" /> },
    { key: 'reminder', label: 'Reminder', icon: <Mail className="w-4 h-4" /> },
    { key: 'welcome', label: 'Welcome', icon: <FileText className="w-4 h-4" /> },
    { key: 'thankyou', label: 'Thank You', icon: <FileText className="w-4 h-4" /> },
    { key: 'already-done', label: 'Already Done', icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Template Preview
          </DialogTitle>
        </DialogHeader>

        {/* Tab Navigation */}
        <div className="flex gap-1 border-b pb-2 overflow-x-auto">
          {tabs.map((tab) => (
            <Button
              key={tab.key}
              variant={activeTab === tab.key ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab(tab.key)}
              className="flex items-center gap-1"
            >
              {tab.icon}
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Preview Content */}
        <div className="mt-4">
          {activeTab === 'invitation' && renderEmailPreview(
            invitationSubject,
            invitationBody,
            DEFAULT_INVITATION_SUBJECT,
            DEFAULT_INVITATION_BODY,
            'invitation'
          )}
          {activeTab === 'reminder' && renderEmailPreview(
            reminderSubject,
            reminderBody,
            DEFAULT_REMINDER_SUBJECT,
            DEFAULT_REMINDER_BODY,
            'reminder'
          )}
          {activeTab === 'welcome' && renderLandingPagePreview('welcome')}
          {activeTab === 'thankyou' && renderLandingPagePreview('thankyou')}
          {activeTab === 'already-done' && renderLandingPagePreview('already-done')}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
