'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useCampaign,
  useUpdateCampaign,
  useActivateCampaign,
  useCloseCampaign,
  useReopenCampaign,
  usePublishCampaign,
} from '@/hooks/use-campaigns';
import { useScoreConfig, useUpdateScoreConfig, useResetScoreConfig } from '@/hooks/use-score-config';
import { useSendReminders, useDistributionStats } from '@/hooks/use-distribution';
import { useCampaignScores } from '@/hooks/use-campaign-scores';
import { RequireAuth } from '@/components/auth/require-auth';
import { ScoreConfigForm } from '@/components/campaigns/score-config-form';
import { CampaignHcpsTab } from '@/components/campaigns/campaign-hcps-tab';
import { CampaignTemplatesTab } from '@/components/campaigns/campaign-templates-tab';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  Users,
  FileText,
  BarChart3,
  Bell,
  CheckCircle2,
  AlertCircle,
  Mail,
  LayoutDashboard,
  UserCheck,
  Calculator,
  Pencil,
  X,
  Check,
  Loader2,
  Send,
  Circle,
  ChevronRight,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CampaignStatus, ScoreConfigInput } from '@kol360/shared';

const statusColors: Record<CampaignStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  ACTIVE: 'bg-green-100 text-green-800',
  CLOSED: 'bg-yellow-100 text-yellow-800',
  PUBLISHED: 'bg-blue-100 text-blue-800',
};

// Workflow steps configuration - steps 1-4 are setup (DRAFT), 5+ are post-activation
const WORKFLOW_STEPS = [
  { id: 'overview', label: 'Overview', icon: FileText, description: 'Campaign details', phase: 'setup' },
  { id: 'hcps', label: 'HCPs', icon: Users, description: 'Assign participants', phase: 'setup' },
  { id: 'scores', label: 'Score Config', icon: BarChart3, description: 'Configure weights', phase: 'setup' },
  { id: 'templates', label: 'Templates', icon: Mail, description: 'Email templates', phase: 'setup' },
  { id: 'initiate', label: 'Initiate Survey', icon: Send, description: 'Launch campaign', phase: 'setup' },
  { id: 'nominations', label: 'Nominations', icon: UserCheck, description: 'Match nominations', phase: 'active', external: true },
  { id: 'survey-scores', label: 'Survey Scores', icon: Calculator, description: 'Calculate scores', phase: 'closed', external: true },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'View results', phase: 'published', external: true },
];

// Helper type for step completion status
interface StepStatus {
  id: string;
  completed: boolean;
  label: string;
}

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;

  const { data: campaign, isLoading } = useCampaign(campaignId);
  const { data: scoreConfig } = useScoreConfig(campaignId);
  const updateCampaign = useUpdateCampaign();
  const updateScoreConfig = useUpdateScoreConfig();
  const resetScoreConfig = useResetScoreConfig();
  const activateCampaign = useActivateCampaign();
  const closeCampaign = useCloseCampaign();
  const reopenCampaign = useReopenCampaign();
  const publishCampaign = usePublishCampaign();
  const sendReminders = useSendReminders();
  const { data: distributionStats } = useDistributionStats(campaignId);
  const { data: campaignScores } = useCampaignScores(campaignId);

  const [activeStep, setActiveStep] = useState('overview');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editData, setEditData] = useState({ name: '', description: '' });
  const [statusAction, setStatusAction] = useState<'activate' | 'close' | 'reopen' | 'publish' | null>(null);
  const [showReminderConfirm, setShowReminderConfirm] = useState(false);
  const [reminderResult, setReminderResult] = useState<{ sent: number; failed?: number; skipped?: number; skippedCompleted?: number; skippedRecentlyReminded?: number; skippedMaxReminders?: number; errors: Array<{ email: string; error: string }> } | null>(null);

  const handleStartEdit = () => {
    if (campaign) {
      setEditData({
        name: campaign.name,
        description: campaign.description || '',
      });
      setIsEditingName(true);
    }
  };

  const handleSaveEdit = async () => {
    if (!editData.name.trim()) return;
    try {
      await updateCampaign.mutateAsync({
        id: campaignId,
        data: {
          name: editData.name.trim(),
          description: editData.description.trim() || null,
        },
      });
      setIsEditingName(false);
    } catch (error) {
      console.error('Failed to update campaign:', error);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingName(false);
    if (campaign) {
      setEditData({
        name: campaign.name,
        description: campaign.description || '',
      });
    }
  };

  const handleStatusChange = async () => {
    if (!statusAction) return;
    try {
      switch (statusAction) {
        case 'activate':
          await activateCampaign.mutateAsync(campaignId);
          break;
        case 'close':
          await closeCampaign.mutateAsync(campaignId);
          break;
        case 'reopen':
          await reopenCampaign.mutateAsync(campaignId);
          break;
        case 'publish':
          await publishCampaign.mutateAsync(campaignId);
          break;
      }
      setStatusAction(null);
    } catch (error) {
      console.error('Failed to change status:', error);
    }
  };

  const handleSaveScoreConfig = async (data: ScoreConfigInput) => {
    await updateScoreConfig.mutateAsync({ campaignId, data });
  };

  const handleResetScoreConfig = async () => {
    await resetScoreConfig.mutateAsync(campaignId);
  };

  const handleSendReminders = async () => {
    try {
      const result = await sendReminders.mutateAsync(campaignId);
      setReminderResult(result);
      setShowReminderConfirm(false);
    } catch (error) {
      console.error('Failed to send reminders:', error);
    }
  };

  // Calculate step completion status for DRAFT campaigns
  const getSetupStepStatuses = (): StepStatus[] => {
    if (!campaign) return [];

    const hasHcps = campaign._count.campaignHcps > 0;
    const hasScoreConfig = !!scoreConfig; // Score config is auto-created, so this is always true
    // For templates, we'd need to check if invitation template exists - assume true for now
    const hasTemplates = true;

    return [
      { id: 'overview', completed: true, label: 'Overview' }, // Always complete
      { id: 'hcps', completed: hasHcps, label: 'Assign HCPs' },
      { id: 'scores', completed: hasScoreConfig, label: 'Score Config' },
      { id: 'templates', completed: hasTemplates, label: 'Email Templates' },
      { id: 'initiate', completed: false, label: 'Initiate Survey' }, // Complete when activated
    ];
  };

  // Get the next incomplete step for DRAFT campaigns
  const getNextIncompleteStep = (): StepStatus | null => {
    const statuses = getSetupStepStatuses();
    return statuses.find(s => !s.completed) || null;
  };

  // Check if all setup steps are complete (ready to activate)
  const isReadyToActivate = (): boolean => {
    if (!campaign || campaign.status !== 'DRAFT') return false;
    const hasHcps = campaign._count.campaignHcps > 0;
    return hasHcps; // Minimum requirement: HCPs assigned
  };

  // Get current workflow progress for visual display
  const getWorkflowProgress = () => {
    if (!campaign) return 0;
    switch (campaign.status) {
      case 'DRAFT': {
        // Show progress through setup steps
        const statuses = getSetupStepStatuses();
        const completedCount = statuses.filter(s => s.completed).length;
        return completedCount;
      }
      case 'ACTIVE': return 5; // Survey initiated
      case 'CLOSED': {
        // If scores have been calculated, show survey-scores as complete (step 7)
        const hasScores = campaignScores && campaignScores.items && campaignScores.items.length > 0;
        return hasScores ? 7 : 6;
      }
      case 'PUBLISHED': return 8; // Complete
      default: return 0;
    }
  };

  const handleStepClick = (stepId: string) => {
    const step = WORKFLOW_STEPS.find(s => s.id === stepId);
    if (step?.external) {
      // Navigate to external page
      switch (stepId) {
        case 'nominations':
          router.push(`/admin/campaigns/${campaignId}/nominations`);
          break;
        case 'survey-scores':
          router.push(`/admin/campaigns/${campaignId}/scores`);
          break;
        case 'dashboard':
          router.push(`/admin/campaigns/${campaignId}/dashboard`);
          break;
      }
    } else {
      setActiveStep(stepId);
    }
  };

  if (isLoading) {
    return (
      <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
        <div className="p-6">Loading...</div>
      </RequireAuth>
    );
  }

  if (!campaign) {
    return (
      <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
        <div className="p-6">
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold">Campaign not found</h2>
            <Button className="mt-4" onClick={() => router.push('/admin/campaigns')}>
              Back to Campaigns
            </Button>
          </div>
        </div>
      </RequireAuth>
    );
  }

  const statusActionLabels = {
    activate: { title: 'Activate Campaign', description: 'This will make the campaign active and ready for survey distribution.' },
    close: { title: 'Close Campaign', description: 'This will close the survey collection. You can reopen it later if needed.' },
    reopen: { title: 'Reopen Campaign', description: 'This will reopen the campaign for additional survey responses.' },
    publish: { title: 'Publish Results', description: 'This will publish the KOL scores. This action cannot be undone.' },
  };

  const workflowProgress = getWorkflowProgress();

  return (
    <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/campaigns">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Link>
          </Button>
        </div>

        <div className="flex justify-between items-start mb-6">
          <div className="flex-1">
            {isEditingName ? (
              <div className="space-y-3 max-w-xl">
                <div className="flex items-center gap-2">
                  <Input
                    value={editData.name}
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                    className="text-xl font-bold"
                    placeholder="Campaign name"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleSaveEdit}
                    disabled={updateCampaign.isPending || !editData.name.trim()}
                  >
                    {updateCampaign.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4 text-green-600" />
                    )}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                    <X className="w-4 h-4 text-red-600" />
                  </Button>
                </div>
                <Textarea
                  value={editData.description}
                  onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                  placeholder="Campaign description (optional)"
                  rows={2}
                  className="text-sm"
                />
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-bold">{campaign.name}</h1>
                  {campaign.status !== 'PUBLISHED' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleStartEdit}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  )}
                  <Badge className={statusColors[campaign.status as CampaignStatus]}>
                    {campaign.status}
                  </Badge>
                </div>
                {campaign.description && (
                  <p className="text-sm text-muted-foreground mb-1">{campaign.description}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  {campaign.client.name} &middot; {campaign.diseaseArea.name}
                </p>
              </div>
            )}
          </div>
          {/* Workflow-aware action button - shows next step */}
          <div className="flex gap-2">
            {campaign.status === 'DRAFT' && (() => {
              const nextStep = getNextIncompleteStep();
              if (nextStep && nextStep.id !== 'initiate') {
                // Guide to next incomplete setup step
                const stepConfig = WORKFLOW_STEPS.find(s => s.id === nextStep.id);
                const Icon = stepConfig?.icon || FileText;
                return (
                  <Button onClick={() => handleStepClick(nextStep.id)}>
                    <Icon className="w-4 h-4 mr-2" />
                    Next: {nextStep.label}
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                );
              } else if (isReadyToActivate()) {
                // All setup done, ready to activate
                return (
                  <Button onClick={() => handleStepClick('initiate')}>
                    <Send className="w-4 h-4 mr-2" />
                    Ready to Launch
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                );
              } else {
                // Not ready - show what's needed
                return (
                  <Button onClick={() => handleStepClick('hcps')} variant="outline">
                    <Users className="w-4 h-4 mr-2" />
                    Assign HCPs to Continue
                  </Button>
                );
              }
            })()}
            {campaign.status === 'ACTIVE' && (
              <Button onClick={() => handleStepClick('nominations')}>
                <UserCheck className="w-4 h-4 mr-2" />
                Review Nominations
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
            {campaign.status === 'CLOSED' && (
              <Button onClick={() => handleStepClick('survey-scores')}>
                <Calculator className="w-4 h-4 mr-2" />
                Calculate Scores
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
            {campaign.status === 'PUBLISHED' && (
              <Button onClick={() => handleStepClick('dashboard')} variant="outline">
                <LayoutDashboard className="w-4 h-4 mr-2" />
                View Dashboard
              </Button>
            )}
          </div>
        </div>

        {/* Workflow Progress Steps */}
        <div className="mb-6 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max pb-2">
            {WORKFLOW_STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = activeStep === step.id;
              const isCompleted = index < workflowProgress;

              // For DRAFT campaigns, check actual step completion
              const setupStatuses = getSetupStepStatuses();
              const stepStatus = setupStatuses.find(s => s.id === step.id);
              const isStepComplete = campaign.status === 'DRAFT'
                ? stepStatus?.completed ?? false
                : isCompleted;

              // Determine if step is accessible
              const isSetupStep = step.phase === 'setup';
              const isClickable = isSetupStep || (step.external && campaign.status !== 'DRAFT');

              // Is this the "next" step to complete?
              const nextStep = getNextIncompleteStep();
              const isNextStep = campaign.status === 'DRAFT' && nextStep?.id === step.id;

              return (
                <div key={step.id} className="flex items-center">
                  <button
                    onClick={() => isClickable && handleStepClick(step.id)}
                    disabled={!isClickable}
                    className={`
                      flex flex-col items-center p-2 rounded-lg transition-all min-w-[80px]
                      ${isActive ? 'bg-primary text-primary-foreground' : ''}
                      ${isStepComplete && !isActive ? 'text-green-600' : ''}
                      ${isNextStep && !isActive ? 'text-blue-600 bg-blue-50' : ''}
                      ${!isActive && !isStepComplete && !isNextStep ? 'text-muted-foreground hover:bg-muted' : ''}
                      ${!isClickable ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    <div className={`
                      w-8 h-8 rounded-full flex items-center justify-center mb-1
                      ${isActive ? 'bg-primary-foreground/20' : ''}
                      ${isStepComplete && !isActive ? 'bg-green-100' : ''}
                      ${isNextStep && !isActive ? 'bg-blue-100 ring-2 ring-blue-400' : ''}
                      ${!isActive && !isStepComplete && !isNextStep ? 'bg-muted' : ''}
                    `}>
                      {isStepComplete && !isActive ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : !isStepComplete && !isActive && !isNextStep ? (
                        <Circle className="w-4 h-4" />
                      ) : (
                        <Icon className="w-4 h-4" />
                      )}
                    </div>
                    <span className="text-xs font-medium whitespace-nowrap">{step.label}</span>
                    {isNextStep && !isActive && (
                      <span className="text-[10px] text-blue-600 font-medium">Next</span>
                    )}
                  </button>
                  {index < WORKFLOW_STEPS.length - 1 && (
                    <div className={`w-4 h-0.5 mx-1 ${isStepComplete ? 'bg-green-400' : 'bg-muted'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="space-y-6">
          {activeStep === 'overview' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">HCPs Assigned</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{campaign._count.campaignHcps}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Responses</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {(campaign._count as { completedResponses?: number }).completedResponses ?? 0} / {campaign._count.campaignHcps}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {(campaign._count as { completedResponses?: number }).completedResponses ?? 0} completed
                      {campaign._count.surveyResponses > ((campaign._count as { completedResponses?: number }).completedResponses ?? 0) && (
                        <>, {campaign._count.surveyResponses - ((campaign._count as { completedResponses?: number }).completedResponses ?? 0)} in progress</>
                      )}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Honorarium</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {campaign.honorariumAmount ? `$${campaign.honorariumAmount}` : 'N/A'}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Campaign Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-muted-foreground">Client</label>
                      <p className="font-medium">{campaign.client.name}</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Disease Area</label>
                      <p className="font-medium">{campaign.diseaseArea.name}</p>
                    </div>
                  </div>
                  {campaign.surveyTemplate && (
                    <div>
                      <label className="text-sm text-muted-foreground">Survey Template</label>
                      <p>{campaign.surveyTemplate.name}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-muted-foreground">Survey Open Date</label>
                      <p>{campaign.surveyOpenDate ? new Date(campaign.surveyOpenDate).toLocaleDateString() : (campaign.status === 'DRAFT' ? 'Opens on activation' : 'Not set')}</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Survey Close Date</label>
                      <p>
                        {campaign.surveyCloseDate
                          ? new Date(campaign.surveyCloseDate).toLocaleDateString()
                          : campaign.status === 'ACTIVE'
                          ? 'In Progress'
                          : campaign.status === 'DRAFT'
                          ? 'Not started'
                          : 'Not set'}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Created</label>
                    <p>{new Date(campaign.createdAt).toLocaleString()}</p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {activeStep === 'hcps' && (
            <CampaignHcpsTab
              campaignId={campaignId}
              campaignStatus={campaign.status}
            />
          )}

          {activeStep === 'scores' && scoreConfig && (
            <ScoreConfigForm
              config={scoreConfig}
              onSave={handleSaveScoreConfig}
              onReset={handleResetScoreConfig}
              isLoading={updateScoreConfig.isPending || resetScoreConfig.isPending}
            />
          )}

          {activeStep === 'templates' && (
            <CampaignTemplatesTab campaignId={campaignId} />
          )}

          {activeStep === 'initiate' && (
            <Card>
              <CardHeader>
                <CardTitle>Initiate Survey</CardTitle>
                <CardDescription>
                  Launch the campaign and send survey invitations to HCPs
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {campaign.status === 'DRAFT' ? (
                  <>
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                      <h4 className="font-medium text-blue-900 mb-2">Before activating, ensure:</h4>
                      <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                        <li>HCPs have been assigned to this campaign</li>
                        <li>Score configuration weights are set correctly</li>
                        <li>Email templates (invitation & reminder) are configured</li>
                      </ul>
                    </div>
                    <div className="flex items-center gap-4">
                      <Button onClick={() => setStatusAction('activate')} size="lg">
                        <Play className="w-5 h-5 mr-2" />
                        Activate Campaign
                      </Button>
                      <p className="text-sm text-muted-foreground">
                        This will send invitation emails to all assigned HCPs
                      </p>
                    </div>
                  </>
                ) : campaign.status === 'ACTIVE' ? (
                  <>
                    <div className="bg-green-50 border border-green-200 rounded-md p-4">
                      <div className="flex items-center gap-2 text-green-800">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="font-medium">Campaign is active</span>
                      </div>
                      <p className="text-sm text-green-700 mt-1">
                        Survey invitations have been sent. HCPs can now respond.
                      </p>
                    </div>

                    {/* Survey Response Stats */}
                    {distributionStats && (
                      <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                        <h4 className="font-medium text-gray-900 mb-3">Survey Response Status</h4>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">{distributionStats.completed}</div>
                            <div className="text-xs text-muted-foreground">Completed</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600">{distributionStats.inProgress}</div>
                            <div className="text-xs text-muted-foreground">In Progress</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-purple-600">{distributionStats.opened}</div>
                            <div className="text-xs text-muted-foreground">Opened</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-orange-600">{distributionStats.invited - distributionStats.completed - distributionStats.inProgress - distributionStats.opened}</div>
                            <div className="text-xs text-muted-foreground">Not Opened</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-gray-600">{distributionStats.total}</div>
                            <div className="text-xs text-muted-foreground">Total HCPs</div>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mt-3">
                          Reminders will be sent to {distributionStats.invited - distributionStats.completed} HCPs who have not completed the survey.
                        </p>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <Button onClick={() => setShowReminderConfirm(true)} variant="outline">
                        <Bell className="w-4 h-4 mr-2" />
                        Send Reminders
                      </Button>
                      <Button onClick={() => setStatusAction('close')} variant="outline">
                        <Pause className="w-4 h-4 mr-2" />
                        Close Survey
                      </Button>
                    </div>
                  </>
                ) : campaign.status === 'CLOSED' ? (
                  <>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                      <div className="flex items-center gap-2 text-yellow-800">
                        <Pause className="w-5 h-5" />
                        <span className="font-medium">Survey collection closed</span>
                      </div>
                      <p className="text-sm text-yellow-700 mt-1">
                        No more responses are being accepted. You can reopen if needed.
                      </p>
                    </div>
                    <Button onClick={() => setStatusAction('reopen')} variant="outline">
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reopen Survey
                    </Button>
                  </>
                ) : (
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                    <div className="flex items-center gap-2 text-blue-800">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="font-medium">Campaign published</span>
                    </div>
                    <p className="text-sm text-blue-700 mt-1">
                      Results have been published and scores are final.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Status Change Confirmation */}
        <AlertDialog open={!!statusAction} onOpenChange={() => setStatusAction(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {statusAction && statusActionLabels[statusAction].title}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {statusAction && statusActionLabels[statusAction].description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleStatusChange}>
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Send Reminders Confirmation */}
        <AlertDialog open={showReminderConfirm} onOpenChange={setShowReminderConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Send Reminders</AlertDialogTitle>
              <AlertDialogDescription>
                This will send reminder emails to HCPs who have been invited but haven&apos;t completed the survey.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleSendReminders}>
                Send Emails
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Reminder Result Dialog */}
        <Dialog open={!!reminderResult} onOpenChange={() => setReminderResult(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {reminderResult?.failed === 0 ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-yellow-500" />
                )}
                Reminders Sent
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-2">
              <p className="text-lg">
                Successfully sent: <strong className="text-green-600">{reminderResult?.sent || 0}</strong>
              </p>
              {(reminderResult?.failed ?? 0) > 0 && (
                <p className="text-lg">
                  Failed: <strong className="text-red-600">{reminderResult?.failed}</strong>
                </p>
              )}
              {(reminderResult?.skipped ?? 0) > 0 && (
                <div className="space-y-1">
                  <p className="text-lg">
                    Skipped: <strong className="text-muted-foreground">{reminderResult?.skipped}</strong>
                  </p>
                  {((reminderResult?.skippedCompleted ?? 0) > 0 || (reminderResult?.skippedRecentlyReminded ?? 0) > 0 || (reminderResult?.skippedMaxReminders ?? 0) > 0) && (
                    <ul className="text-sm text-muted-foreground ml-4 list-disc">
                      {(reminderResult?.skippedCompleted ?? 0) > 0 && (
                        <li>{reminderResult?.skippedCompleted} already completed</li>
                      )}
                      {(reminderResult?.skippedMaxReminders ?? 0) > 0 && (
                        <li>{reminderResult?.skippedMaxReminders} reached max reminders</li>
                      )}
                      {(reminderResult?.skippedRecentlyReminded ?? 0) > 0 && (
                        <li>{reminderResult?.skippedRecentlyReminded} received a reminder within the last 24 hrs</li>
                      )}
                    </ul>
                  )}
                </div>
              )}
              {reminderResult?.errors && reminderResult.errors.length > 0 && (
                <div className="mt-4">
                  <p className="font-medium mb-2">Errors:</p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {reminderResult.errors.map((err, i) => (
                      <li key={i}>{err.email}: {err.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => setReminderResult(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RequireAuth>
  );
}
