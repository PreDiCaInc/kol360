'use client';

import { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, Mail, FileText } from 'lucide-react';

// Configure DOMPurify to allow safe HTML for templates (emails + landing pages)
export const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['div', 'span', 'p', 'a', 'img', 'table', 'tr', 'td', 'th', 'tbody', 'thead',
                   'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'b', 'i', 'u', 'br', 'hr',
                   'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'center', 'caption',
                   'style', 'button', 'svg', 'path', 'polyline', 'line', 'circle', 'rect', 'g'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'style', 'class', 'width', 'height', 'target', 'rel',
                   'bgcolor', 'align', 'valign', 'cellpadding', 'cellspacing', 'border',
                   'data-action', 'viewBox', 'fill', 'stroke', 'stroke-width',
                   'stroke-linecap', 'stroke-linejoin', 'd', 'points',
                   'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2', 'xmlns'],
    ALLOW_DATA_ATTR: true,
    ADD_ATTR: ['target'],
  });
};

type PreviewType = 'invitation' | 'reminder' | 'welcome' | 'thankyou' | 'already-done' | 'disqualified';

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
  disqualifiedTitle?: string;
  disqualifiedMessage?: string;
}

// Sample data for preview
const SAMPLE_DATA = {
  firstName: 'John',
  lastName: 'Smith',
  surveyLink: 'https://kol360.bio-exec.com/survey/abc123',
  unsubscribeUrl: 'https://kol360.bio-exec.com/unsubscribe/abc123',
};

// Updated email templates with new design system colors (teal primary: #147a6d)
export const DEFAULT_INVITATION_SUBJECT = 'Your expertise needed: {campaignName} KOL Survey';
export const DEFAULT_INVITATION_BODY = `
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

// Default landing page templates - full-page HTML (editable like email templates)
// Placeholders: {title}, {lastName}, {campaignName}, {honorariumBlock}, {questionCount}, {year}
// NOTE: All templates use inline styles only (no <style> tags or CSS classes) for reliable
// rendering through DOMPurify sanitization inside the Next.js app shell.
export const DEFAULT_WELCOME_TITLE = 'Welcome to the KOL360 Survey';
export const DEFAULT_WELCOME_MESSAGE = `
<div style="min-height: 100vh; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; background: linear-gradient(to bottom, #f9fafb, #f3f4f6);">
  <!-- Branded Header -->
  <div style="background: linear-gradient(135deg, hsl(175,72%,28%) 0%, hsl(175,72%,22%) 50%, hsl(195,60%,18%) 100%); padding: 40px 24px; text-align: center;">
    <img src="/images/logo-white.png" alt="BioExec" style="height: 56px; width: auto; margin: 0 auto 12px; display: block;" />
    <p style="color: rgba(255,255,255,0.8); font-size: 14px; margin: 0; letter-spacing: 0.05em;">Key Opinion Leader Research</p>
  </div>

  <!-- Content Card -->
  <div style="max-width: 480px; margin: -24px auto 0; padding: 0 16px 32px;">
    <div style="background: white; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.1); overflow: hidden;">
      <div style="padding: 32px 32px 0;">
        <h2 style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 24px; font-weight: 500; letter-spacing: -0.025em; margin: 0 0 4px 0; color: #111827;">{title}</h2>
        <p style="color: #6b7280; margin: 0 0 24px 0; font-size: 14px;">Welcome, Dr. {lastName}</p>
      </div>
      <div style="padding: 0 32px 32px;">
        <p style="color: #6b7280; line-height: 1.7; margin: 0 0 16px 0;">
          Thank you for participating in this survey. Your responses will help us better understand key opinion leaders in this field.
        </p>

        {honorariumBlock}

        <p style="font-size: 14px; color: #6b7280; margin: 16px 0 20px 0;">
          Your progress will be saved automatically. You can return to complete the survey at any time.
        </p>

        <button data-action="begin-survey" style="width: 100%; padding: 14px 24px; font-size: 16px; font-weight: 600; color: white; background: linear-gradient(135deg, #147a6d 0%, #0f5d54 100%); border: none; border-radius: 10px; cursor: pointer; box-shadow: 0 4px 14px rgba(20,122,109,0.3);">
          Begin Survey
        </button>
      </div>
    </div>

    <div style="text-align: center; margin-top: 24px;">
      <p style="font-size: 13px; color: #9ca3af; margin: 0;">
        Your responses will be kept confidential and used only for research purposes.
      </p>
      <p style="font-size: 12px; color: #9ca3af; margin: 8px 0 0 0;">
        Need help? <a href="mailto:support@bio-exec.com" style="color: #147a6d; text-decoration: none;">Contact support</a>
      </p>
    </div>

    <!-- Footer -->
    <div style="text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 12px; color: #d1d5db; margin: 0;">&copy; {year} Bio-Exec KOL Research. All rights reserved.</p>
    </div>
  </div>
</div>
`;

export const DEFAULT_THANKYOU_TITLE = 'Thank You!';
export const DEFAULT_THANKYOU_MESSAGE = `
<div style="min-height: 100vh; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; background: linear-gradient(to bottom, #f9fafb, #f3f4f6);">
  <!-- Branded Header -->
  <div style="background: linear-gradient(135deg, hsl(175,72%,28%) 0%, hsl(175,72%,22%) 50%, hsl(195,60%,18%) 100%); padding: 40px 24px; text-align: center;">
    <img src="/images/logo-white.png" alt="BioExec" style="height: 56px; width: auto; margin: 0 auto 12px; display: block;" />
    <p style="color: rgba(255,255,255,0.8); font-size: 14px; margin: 0; letter-spacing: 0.05em;">Key Opinion Leader Research</p>
  </div>

  <!-- Content Card -->
  <div style="max-width: 480px; margin: -24px auto 0; padding: 0 16px 32px;">
    <div style="background: white; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.1); padding: 48px 32px;">
      <div style="display: flex; flex-direction: column; align-items: center; text-align: center;">
        <div style="width: 64px; height: 64px; border-radius: 50%; background: #ecfdf5; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        </div>
        <h2 style="font-size: 24px; font-weight: 600; letter-spacing: -0.025em; margin: 0 0 12px 0; color: #111827;">{title}</h2>
        <p style="color: #6b7280; line-height: 1.7; margin: 0 0 16px 0;">
          Thank you for completing the survey, Dr. {lastName}. Your insights are invaluable to this research and will help shape the future of key opinion leader engagement.
        </p>

        {honorariumBlock}

        <p style="color: #6b7280; line-height: 1.7; margin: 16px 0 0 0; font-size: 14px;">
          If you have any questions, please contact
          <a href="mailto:support@bio-exec.com" style="color: #147a6d; text-decoration: none;">support@bio-exec.com</a>.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 12px; color: #d1d5db; margin: 0;">&copy; {year} Bio-Exec KOL Research. All rights reserved.</p>
    </div>
  </div>
</div>
`;

export const DEFAULT_ALREADYDONE_TITLE = 'Survey Already Completed';
export const DEFAULT_ALREADYDONE_MESSAGE = `
<div style="min-height: 100vh; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; background: linear-gradient(to bottom, #f9fafb, #f3f4f6);">
  <!-- Branded Header -->
  <div style="background: linear-gradient(135deg, hsl(175,72%,28%) 0%, hsl(175,72%,22%) 50%, hsl(195,60%,18%) 100%); padding: 40px 24px; text-align: center;">
    <img src="/images/logo-white.png" alt="BioExec" style="height: 56px; width: auto; margin: 0 auto 12px; display: block;" />
    <p style="color: rgba(255,255,255,0.8); font-size: 14px; margin: 0; letter-spacing: 0.05em;">Key Opinion Leader Research</p>
  </div>

  <!-- Content Card -->
  <div style="max-width: 480px; margin: -24px auto 0; padding: 0 16px 32px;">
    <div style="background: white; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.1); padding: 48px 32px;">
      <div style="display: flex; flex-direction: column; align-items: center; text-align: center;">
        <div style="width: 64px; height: 64px; border-radius: 50%; background: #f0fdf9; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#147a6d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        </div>
        <h2 style="font-size: 24px; font-weight: 600; letter-spacing: -0.025em; margin: 0 0 12px 0; color: #111827;">{title}</h2>
        <p style="color: #6b7280; line-height: 1.7; margin: 0;">
          You have already completed this survey. Thank you for your participation.
        </p>
        <p style="color: #6b7280; line-height: 1.7; margin: 16px 0 0 0; font-size: 14px;">
          If you believe this is an error, please contact
          <a href="mailto:support@bio-exec.com" style="color: #147a6d; text-decoration: none;">support@bio-exec.com</a>.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 12px; color: #d1d5db; margin: 0;">&copy; {year} Bio-Exec KOL Research. All rights reserved.</p>
    </div>
  </div>
</div>
`;

export const DEFAULT_DISQUALIFIED_TITLE = 'Thank You';
export const DEFAULT_DISQUALIFIED_MESSAGE = `
<div style="min-height: 100vh; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; background: linear-gradient(to bottom, #f9fafb, #f3f4f6);">
  <!-- Branded Header -->
  <div style="background: linear-gradient(135deg, hsl(175,72%,28%) 0%, hsl(175,72%,22%) 50%, hsl(195,60%,18%) 100%); padding: 40px 24px; text-align: center;">
    <img src="/images/logo-white.png" alt="BioExec" style="height: 56px; width: auto; margin: 0 auto 12px; display: block;" />
    <p style="color: rgba(255,255,255,0.8); font-size: 14px; margin: 0; letter-spacing: 0.05em;">Key Opinion Leader Research</p>
  </div>

  <!-- Content Card -->
  <div style="max-width: 480px; margin: -24px auto 0; padding: 0 16px 32px;">
    <div style="background: white; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.1); padding: 48px 32px;">
      <div style="display: flex; flex-direction: column; align-items: center; text-align: center;">
        <div style="width: 64px; height: 64px; border-radius: 50%; background: #f0fdf9; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#147a6d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        </div>
        <h2 style="font-size: 24px; font-weight: 600; letter-spacing: -0.025em; margin: 0 0 12px 0; color: #111827;">{title}</h2>
        <p style="color: #6b7280; line-height: 1.7; margin: 0;">
          Thank you for your interest. Unfortunately, based on your responses, you do not qualify for this survey at this time.
        </p>
        <p style="color: #6b7280; line-height: 1.7; margin: 16px 0 0 0; font-size: 14px;">
          We appreciate your time and willingness to participate.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 12px; color: #d1d5db; margin: 0;">&copy; {year} Bio-Exec KOL Research. All rights reserved.</p>
    </div>
  </div>
</div>
`;

export const DEFAULT_REMINDER_SUBJECT = 'Reminder: {campaignName} KOL Survey - We value your input';
export const DEFAULT_REMINDER_BODY = `
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

export function replacePlaceholders(
  template: string,
  campaignName: string,
  honorariumAmount?: number | null,
  options?: { title?: string; lastName?: string; questionCount?: number }
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
    .replace(/\{firstName\}/g, options?.lastName ? SAMPLE_DATA.firstName : SAMPLE_DATA.firstName)
    .replace(/\{lastName\}/g, options?.lastName || SAMPLE_DATA.lastName)
    .replace(/\{surveyLink\}/g, SAMPLE_DATA.surveyLink)
    .replace(/\{surveyUrl\}/g, SAMPLE_DATA.surveyLink)
    .replace(/\{unsubscribeUrl\}/g, SAMPLE_DATA.unsubscribeUrl)
    .replace(/\{campaignName\}/g, campaignName)
    .replace(/\{honorarium\}/g, honorariumText)
    .replace(/\{honorariumBlock\}/g, honorariumBlock)
    .replace(/\{title\}/g, options?.title || campaignName)
    .replace(/\{questionCount\}/g, String(options?.questionCount ?? 12))
    .replace(/\{year\}/g, String(new Date().getFullYear()));
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
  disqualifiedTitle,
  disqualifiedMessage,
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

          {/* Email Body - sanitized to prevent XSS */}
          <div
            className="bg-slate-100 p-4"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(finalBody) }}
          />
        </div>
      </div>
    );
  };

  const renderLandingPagePreview = (
    previewType: 'welcome' | 'thankyou' | 'already-done' | 'disqualified'
  ) => {
    let title: string;
    let message: string;
    let defaultTitle: string;
    let defaultMessage: string;
    let label: string;

    switch (previewType) {
      case 'welcome':
        title = welcomeTitle || '';
        message = welcomeMessage || '';
        defaultTitle = DEFAULT_WELCOME_TITLE;
        defaultMessage = DEFAULT_WELCOME_MESSAGE;
        label = 'Welcome Page';
        break;
      case 'thankyou':
        title = thankYouTitle || '';
        message = thankYouMessage || '';
        defaultTitle = DEFAULT_THANKYOU_TITLE;
        defaultMessage = DEFAULT_THANKYOU_MESSAGE;
        label = 'Thank You Page';
        break;
      case 'already-done':
        title = alreadyDoneTitle || '';
        message = alreadyDoneMessage || '';
        defaultTitle = DEFAULT_ALREADYDONE_TITLE;
        defaultMessage = DEFAULT_ALREADYDONE_MESSAGE;
        label = 'Already Completed Page';
        break;
      case 'disqualified':
        title = disqualifiedTitle || '';
        message = disqualifiedMessage || '';
        defaultTitle = DEFAULT_DISQUALIFIED_TITLE;
        defaultMessage = DEFAULT_DISQUALIFIED_MESSAGE;
        label = 'Disqualified Page';
        break;
    }

    const finalHtml = replacePlaceholders(
      message || defaultMessage,
      campaignName,
      honorariumAmount,
      { title: title || defaultTitle }
    );

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="w-4 h-4" />
          <span>{label} Preview</span>
          {!message && <Badge variant="muted" className="text-xs">Using Default Template</Badge>}
        </div>

        {/* Full-page HTML Preview */}
        <div className="border border-border/60 rounded-xl overflow-hidden shadow-sm">
          <div
            className="bg-slate-100"
            style={{ minHeight: previewType === 'welcome' ? 500 : 400 }}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(finalHtml) }}
          />
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
    { key: 'disqualified', label: 'Disqualified', icon: <FileText className="w-4 h-4" /> },
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
          {activeTab === 'disqualified' && renderLandingPagePreview('disqualified')}
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
