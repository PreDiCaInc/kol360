'use client';

import { useState, useEffect } from 'react';
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
import { Eye, Mail, FileText, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';

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

// Updated email templates with new design system colors (teal primary: #147a6d)
const DEFAULT_INVITATION_SUBJECT = 'Your expertise needed: {campaignName} KOL Survey';
const DEFAULT_INVITATION_BODY = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.7; color: #1a1a2e; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
  <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
    <!-- Header with gradient -->
    <div style="background: linear-gradient(135deg, #147a6d 0%, #0f5d54 100%); padding: 32px 24px; text-align: center;">
      <img src="/images/logo-white.png" alt="KOL360" style="height: 36px; margin-bottom: 8px;">
      <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 14px;">Key Opinion Leader Research</p>
    </div>

    <div style="padding: 32px 24px;">
      <h2 style="color: #147a6d; margin: 0 0 20px 0; font-size: 22px; font-weight: 600;">Dear Dr. {lastName},</h2>

      <p style="margin: 0 0 16px 0; color: #374151;">You have been identified as a <strong>key opinion leader</strong> in your field, and we would greatly value your insights.</p>

      <p style="margin: 0 0 16px 0; color: #374151;">We are conducting the <strong style="color: #147a6d;">{campaignName}</strong> research study and would like to invite you to participate in a brief survey about thought leaders in your specialty area.</p>

      <div style="background: #f0fdf9; border-left: 4px solid #147a6d; padding: 16px; border-radius: 0 8px 8px 0; margin: 24px 0;">
        <p style="margin: 0; color: #0f5d54; font-size: 14px;">
          <strong>⏱️ Estimated time:</strong> 5-10 minutes
        </p>
      </div>

      {honorariumBlock}

      <div style="text-align: center; margin: 32px 0;">
        <a href="{surveyLink}" style="background: linear-gradient(135deg, #147a6d 0%, #0f5d54 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 14px rgba(20, 122, 109, 0.4);">
          Start Survey →
        </a>
      </div>

      <p style="font-size: 13px; color: #6b7280; margin: 24px 0 8px 0;">If the button doesn't work, copy this link:</p>
      <p style="word-break: break-all; color: #147a6d; font-size: 13px; background: #f8fafc; padding: 12px; border-radius: 8px; margin: 0;">{surveyLink}</p>
    </div>

    <!-- Footer -->
    <div style="background: #f8fafc; padding: 24px; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 13px; color: #6b7280; margin: 0 0 8px 0; text-align: center;">
        🔒 Your responses will be kept confidential and used only for research purposes.
      </p>
      <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
        <a href="{unsubscribeUrl}" style="color: #9ca3af;">Unsubscribe</a> · BioExec Research · Confidential KOL Survey
      </p>
    </div>
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
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.7; color: #1a1a2e; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
  <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
    <!-- Header with gradient -->
    <div style="background: linear-gradient(135deg, #147a6d 0%, #0f5d54 100%); padding: 32px 24px; text-align: center;">
      <img src="/images/logo-white.png" alt="KOL360" style="height: 36px; margin-bottom: 8px;">
      <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 14px;">Key Opinion Leader Research</p>
    </div>

    <div style="padding: 32px 24px;">
      <!-- Reminder badge -->
      <div style="display: inline-block; background: #fef3c7; color: #92400e; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 20px;">
        ⏰ Friendly Reminder
      </div>

      <h2 style="color: #147a6d; margin: 0 0 20px 0; font-size: 22px; font-weight: 600;">Dear Dr. {lastName},</h2>

      <p style="margin: 0 0 16px 0; color: #374151;">We recently invited you to participate in the <strong style="color: #147a6d;">{campaignName}</strong> research study, and we noticed you haven't yet completed the survey.</p>

      <p style="margin: 0 0 16px 0; color: #374151;">Your insights as a key opinion leader are <strong>invaluable</strong> to this research.</p>

      <div style="background: #f0fdf9; border-left: 4px solid #147a6d; padding: 16px; border-radius: 0 8px 8px 0; margin: 24px 0;">
        <p style="margin: 0; color: #0f5d54; font-size: 14px;">
          <strong>⏱️ Only 5-10 minutes</strong> to complete
        </p>
      </div>

      {honorariumBlock}

      <div style="text-align: center; margin: 32px 0;">
        <a href="{surveyLink}" style="background: linear-gradient(135deg, #147a6d 0%, #0f5d54 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 14px rgba(20, 122, 109, 0.4);">
          Complete Survey Now →
        </a>
      </div>

      <p style="font-size: 13px; color: #6b7280; margin: 24px 0 8px 0;">If the button doesn't work, copy this link:</p>
      <p style="word-break: break-all; color: #147a6d; font-size: 13px; background: #f8fafc; padding: 12px; border-radius: 8px; margin: 0;">{surveyLink}</p>
    </div>

    <!-- Footer -->
    <div style="background: #f8fafc; padding: 24px; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
        <a href="{unsubscribeUrl}" style="color: #9ca3af;">Unsubscribe</a> · BioExec Research · Confidential KOL Survey
      </p>
    </div>
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
    ? `<div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border: 1px solid #a7f3d0; padding: 20px; border-radius: 12px; margin: 24px 0; text-align: center;">
        <p style="margin: 0 0 4px 0; font-size: 14px; color: #065f46;">Upon completion, you will receive</p>
        <p style="margin: 0; font-size: 28px; font-weight: 700; color: #047857;">$${honorariumAmount}</p>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #065f46;">honorarium</p>
      </div>`
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

  // Sync activeTab with type prop when dialog opens
  useEffect(() => {
    setActiveTab(type);
  }, [type, open]);

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
          {!body && <Badge variant="success" className="text-xs">Using Default Template</Badge>}
        </div>

        {/* Email Header Mock */}
        <div className="border border-border/60 rounded-xl overflow-hidden shadow-sm">
          <div className="bg-muted/50 p-4 border-b border-border/60 space-y-2">
            <div className="flex gap-2 text-sm">
              <span className="text-muted-foreground w-16 shrink-0">From:</span>
              <span>BioExec KOL Research &lt;noreply@bio-exec.com&gt;</span>
            </div>
            <div className="flex gap-2 text-sm">
              <span className="text-muted-foreground w-16 shrink-0">To:</span>
              <span>dr.{SAMPLE_DATA.lastName.toLowerCase()}@example.com</span>
            </div>
            <div className="flex gap-2 text-sm">
              <span className="text-muted-foreground w-16 shrink-0">Subject:</span>
              <span className="font-medium">{finalSubject}</span>
            </div>
          </div>

          {/* Email Body */}
          <div
            className="bg-slate-100 p-4"
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
        icon = <CheckCircle2 className="w-12 h-12 text-emerald-500" />;
        break;
      case 'already-done':
        title = alreadyDoneTitle || '';
        message = alreadyDoneMessage || '';
        defaultTitle = 'Survey Already Completed';
        defaultMessage = 'You have already completed this survey. Thank you for your participation.';
        icon = <AlertCircle className="w-12 h-12 text-primary" />;
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
          {!title && !message && <Badge variant="muted" className="text-xs">Using Defaults</Badge>}
        </div>

        {/* Landing Page Mock */}
        <div className="bg-gradient-to-b from-muted/30 to-muted/60 rounded-xl p-8 min-h-[400px] flex items-center justify-center">
          <Card className="max-w-md w-full shadow-lg border-border/60 overflow-hidden">
            {previewType === 'welcome' ? (
              <>
                <div className="h-1.5 bg-gradient-to-r from-primary to-primary/60" />
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl tracking-tight">{finalTitle}</CardTitle>
                  <CardDescription className="text-base">
                    Welcome, Dr. {SAMPLE_DATA.lastName}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground leading-relaxed">{finalMessage}</p>
                  {honorariumAmount && (
                    <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 rounded-lg border border-emerald-200 dark:border-emerald-800/30">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-800/40 flex items-center justify-center shrink-0">
                        <span className="text-lg font-semibold">$</span>
                      </div>
                      <p className="text-sm">
                        Upon completion, you will receive a <strong>${honorariumAmount}</strong> honorarium.
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-4 py-3 rounded-lg">
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span>Your progress will be saved automatically.</span>
                  </div>
                  <Button className="w-full" size="lg" disabled>Begin Survey</Button>
                </CardContent>
              </>
            ) : (
              <CardContent className="pt-8 pb-8">
                <div className="flex flex-col items-center text-center">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-5 ${previewType === 'thankyou' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-primary/10'}`}>
                    {icon}
                  </div>
                  <h2 className="text-2xl font-semibold mb-3 tracking-tight">{finalTitle}</h2>
                  <p className="text-muted-foreground">{finalMessage}</p>
                  {previewType === 'thankyou' && honorariumAmount && (
                    <div className="mt-5 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 rounded-lg text-sm border border-emerald-200 dark:border-emerald-800/30">
                      Your ${honorariumAmount} honorarium will be processed shortly.
                    </div>
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
        <div className="flex gap-1 border-b border-border/60 pb-3 overflow-x-auto">
          {tabs.map((tab) => (
            <Button
              key={tab.key}
              variant={activeTab === tab.key ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab(tab.key)}
              className="flex items-center gap-1.5 shrink-0"
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

        <div className="flex justify-end pt-4 border-t border-border/60">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
