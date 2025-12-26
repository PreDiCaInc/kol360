'use client';

import { useState, useEffect } from 'react';
import {
  useCampaign,
  useEmailTemplates,
  useUpdateEmailTemplates,
  useLandingPageTemplates,
  useUpdateLandingPageTemplates,
} from '@/hooks/use-campaigns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Mail, FileText, Save, RotateCcw, Eye } from 'lucide-react';
import { SurveyPreviewDialog } from './survey-preview-dialog';
import { TemplatePreviewDialog } from './template-preview-dialog';

type PreviewType = 'invitation' | 'reminder' | 'welcome' | 'thankyou' | 'already-done';

interface CampaignTemplatesTabProps {
  campaignId: string;
}

export function CampaignTemplatesTab({ campaignId }: CampaignTemplatesTabProps) {
  const { data: campaign } = useCampaign(campaignId);
  const { data: emailTemplates, isLoading: emailLoading } = useEmailTemplates(campaignId);
  const { data: landingTemplates, isLoading: landingLoading } = useLandingPageTemplates(campaignId);
  const updateEmailTemplates = useUpdateEmailTemplates();
  const updateLandingTemplates = useUpdateLandingPageTemplates();

  // Email templates state
  const [invitationSubject, setInvitationSubject] = useState('');
  const [invitationBody, setInvitationBody] = useState('');
  const [reminderSubject, setReminderSubject] = useState('');
  const [reminderBody, setReminderBody] = useState('');

  // Landing page state
  const [welcomeTitle, setWelcomeTitle] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [thankYouTitle, setThankYouTitle] = useState('');
  const [thankYouMessage, setThankYouMessage] = useState('');
  const [alreadyDoneTitle, setAlreadyDoneTitle] = useState('');
  const [alreadyDoneMessage, setAlreadyDoneMessage] = useState('');

  // Track unsaved changes
  const [emailDirty, setEmailDirty] = useState(false);
  const [landingDirty, setLandingDirty] = useState(false);

  // Preview dialogs
  const [showSurveyPreview, setShowSurveyPreview] = useState(false);
  const [templatePreviewType, setTemplatePreviewType] = useState<PreviewType | null>(null);

  // Initialize form with fetched data
  useEffect(() => {
    if (emailTemplates) {
      setInvitationSubject(emailTemplates.invitationEmailSubject || '');
      setInvitationBody(emailTemplates.invitationEmailBody || '');
      setReminderSubject(emailTemplates.reminderEmailSubject || '');
      setReminderBody(emailTemplates.reminderEmailBody || '');
      setEmailDirty(false);
    }
  }, [emailTemplates]);

  useEffect(() => {
    if (landingTemplates) {
      setWelcomeTitle(landingTemplates.surveyWelcomeTitle || '');
      setWelcomeMessage(landingTemplates.surveyWelcomeMessage || '');
      setThankYouTitle(landingTemplates.surveyThankYouTitle || '');
      setThankYouMessage(landingTemplates.surveyThankYouMessage || '');
      setAlreadyDoneTitle(landingTemplates.surveyAlreadyDoneTitle || '');
      setAlreadyDoneMessage(landingTemplates.surveyAlreadyDoneMessage || '');
      setLandingDirty(false);
    }
  }, [landingTemplates]);

  const handleSaveEmailTemplates = async () => {
    await updateEmailTemplates.mutateAsync({
      campaignId,
      data: {
        invitationEmailSubject: invitationSubject || null,
        invitationEmailBody: invitationBody || null,
        reminderEmailSubject: reminderSubject || null,
        reminderEmailBody: reminderBody || null,
      },
    });
    setEmailDirty(false);
  };

  const handleSaveLandingTemplates = async () => {
    await updateLandingTemplates.mutateAsync({
      campaignId,
      data: {
        surveyWelcomeTitle: welcomeTitle || null,
        surveyWelcomeMessage: welcomeMessage || null,
        surveyThankYouTitle: thankYouTitle || null,
        surveyThankYouMessage: thankYouMessage || null,
        surveyAlreadyDoneTitle: alreadyDoneTitle || null,
        surveyAlreadyDoneMessage: alreadyDoneMessage || null,
      },
    });
    setLandingDirty(false);
  };

  const handleResetEmailTemplates = () => {
    if (emailTemplates) {
      setInvitationSubject(emailTemplates.invitationEmailSubject || '');
      setInvitationBody(emailTemplates.invitationEmailBody || '');
      setReminderSubject(emailTemplates.reminderEmailSubject || '');
      setReminderBody(emailTemplates.reminderEmailBody || '');
      setEmailDirty(false);
    }
  };

  const handleResetLandingTemplates = () => {
    if (landingTemplates) {
      setWelcomeTitle(landingTemplates.surveyWelcomeTitle || '');
      setWelcomeMessage(landingTemplates.surveyWelcomeMessage || '');
      setThankYouTitle(landingTemplates.surveyThankYouTitle || '');
      setThankYouMessage(landingTemplates.surveyThankYouMessage || '');
      setAlreadyDoneTitle(landingTemplates.surveyAlreadyDoneTitle || '');
      setAlreadyDoneMessage(landingTemplates.surveyAlreadyDoneMessage || '');
      setLandingDirty(false);
    }
  };

  if (emailLoading || landingLoading) {
    return <div className="p-4">Loading templates...</div>;
  }

  return (
    <div className="space-y-6 fade-in">
      {/* Preview Button Header */}
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => setShowSurveyPreview(true)} className="gap-2">
          <Eye className="w-4 h-4" />
          Preview Survey
        </Button>
      </div>

      {/* Email Templates */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              <CardTitle>Email Templates</CardTitle>
            </div>
            <div className="flex gap-2">
              {emailDirty && (
                <Button variant="outline" size="sm" onClick={handleResetEmailTemplates}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleSaveEmailTemplates}
                disabled={!emailDirty || updateEmailTemplates.isPending}
              >
                <Save className="w-4 h-4 mr-2" />
                {updateEmailTemplates.isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
          <CardDescription>
            Customize the email templates sent to HCPs. Use placeholders like {'{firstName}'}, {'{lastName}'}, {'{surveyLink}'}, {'{campaignName}'}, {'{honorarium}'}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="invitation">
              <AccordionTrigger className="flex-1">
                <div className="flex items-center justify-between w-full pr-2">
                  <span>Invitation Email</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTemplatePreviewType('invitation');
                    }}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Preview
                  </Button>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <div>
                  <label className="text-sm font-medium">Subject</label>
                  <Input
                    value={invitationSubject}
                    onChange={(e) => {
                      setInvitationSubject(e.target.value);
                      setEmailDirty(true);
                    }}
                    placeholder="Default: KOL360 Survey Invitation - {campaignName}"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Body (HTML)</label>
                  <Textarea
                    value={invitationBody}
                    onChange={(e) => {
                      setInvitationBody(e.target.value);
                      setEmailDirty(true);
                    }}
                    placeholder="Leave empty to use default template. Supports HTML."
                    rows={12}
                    className="font-mono text-sm"
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="reminder">
              <AccordionTrigger className="flex-1">
                <div className="flex items-center justify-between w-full pr-2">
                  <span>Reminder Email</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTemplatePreviewType('reminder');
                    }}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Preview
                  </Button>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <div>
                  <label className="text-sm font-medium">Subject</label>
                  <Input
                    value={reminderSubject}
                    onChange={(e) => {
                      setReminderSubject(e.target.value);
                      setEmailDirty(true);
                    }}
                    placeholder="Default: Reminder: Complete Your KOL360 Survey"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Body (HTML)</label>
                  <Textarea
                    value={reminderBody}
                    onChange={(e) => {
                      setReminderBody(e.target.value);
                      setEmailDirty(true);
                    }}
                    placeholder="Leave empty to use default template. Supports HTML."
                    rows={12}
                    className="font-mono text-sm"
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Landing Page Templates */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              <CardTitle>Survey Page Messages</CardTitle>
            </div>
            <div className="flex gap-2">
              {landingDirty && (
                <Button variant="outline" size="sm" onClick={handleResetLandingTemplates}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleSaveLandingTemplates}
                disabled={!landingDirty || updateLandingTemplates.isPending}
              >
                <Save className="w-4 h-4 mr-2" />
                {updateLandingTemplates.isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
          <CardDescription>
            Customize the messages shown on the survey landing pages.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="welcome">
              <AccordionTrigger className="flex-1">
                <div className="flex items-center justify-between w-full pr-2">
                  <span>Welcome Page</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTemplatePreviewType('welcome');
                    }}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Preview
                  </Button>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <div>
                  <label className="text-sm font-medium">Title</label>
                  <Input
                    value={welcomeTitle}
                    onChange={(e) => {
                      setWelcomeTitle(e.target.value);
                      setLandingDirty(true);
                    }}
                    placeholder="Default: Welcome to the KOL360 Survey"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Message</label>
                  <Textarea
                    value={welcomeMessage}
                    onChange={(e) => {
                      setWelcomeMessage(e.target.value);
                      setLandingDirty(true);
                    }}
                    placeholder="Leave empty to use default message."
                    rows={4}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="thankyou">
              <AccordionTrigger className="flex-1">
                <div className="flex items-center justify-between w-full pr-2">
                  <span>Thank You Page (After Completion)</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTemplatePreviewType('thankyou');
                    }}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Preview
                  </Button>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <div>
                  <label className="text-sm font-medium">Title</label>
                  <Input
                    value={thankYouTitle}
                    onChange={(e) => {
                      setThankYouTitle(e.target.value);
                      setLandingDirty(true);
                    }}
                    placeholder="Default: Thank You!"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Message</label>
                  <Textarea
                    value={thankYouMessage}
                    onChange={(e) => {
                      setThankYouMessage(e.target.value);
                      setLandingDirty(true);
                    }}
                    placeholder="Leave empty to use default message."
                    rows={4}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="already-done">
              <AccordionTrigger className="flex-1">
                <div className="flex items-center justify-between w-full pr-2">
                  <span>Already Completed Page</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTemplatePreviewType('already-done');
                    }}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Preview
                  </Button>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <div>
                  <label className="text-sm font-medium">Title</label>
                  <Input
                    value={alreadyDoneTitle}
                    onChange={(e) => {
                      setAlreadyDoneTitle(e.target.value);
                      setLandingDirty(true);
                    }}
                    placeholder="Default: Survey Already Completed"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Message</label>
                  <Textarea
                    value={alreadyDoneMessage}
                    onChange={(e) => {
                      setAlreadyDoneMessage(e.target.value);
                      setLandingDirty(true);
                    }}
                    placeholder="Leave empty to use default message."
                    rows={4}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Survey Preview Dialog */}
      <SurveyPreviewDialog
        open={showSurveyPreview}
        onOpenChange={setShowSurveyPreview}
        campaignId={campaignId}
      />

      {/* Template Preview Dialog */}
      <TemplatePreviewDialog
        open={templatePreviewType !== null}
        onOpenChange={(open) => {
          if (!open) setTemplatePreviewType(null);
        }}
        type={templatePreviewType || 'invitation'}
        campaignName={campaign?.name || 'Campaign'}
        honorariumAmount={campaign?.honorariumAmount}
        invitationSubject={invitationSubject}
        invitationBody={invitationBody}
        reminderSubject={reminderSubject}
        reminderBody={reminderBody}
        welcomeTitle={welcomeTitle}
        welcomeMessage={welcomeMessage}
        thankYouTitle={thankYouTitle}
        thankYouMessage={thankYouMessage}
        alreadyDoneTitle={alreadyDoneTitle}
        alreadyDoneMessage={alreadyDoneMessage}
      />
    </div>
  );
}
