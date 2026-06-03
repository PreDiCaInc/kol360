'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useImpersonation } from '@/lib/impersonation-context';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  useCampaign,
  useUpdateCampaign,
  useActivateCampaign,
  useCloseCampaign,
  useReopenCampaign,
  usePublishCampaign,
  useCampaignAuditLog,
  useConfirmWorkflowStep,
} from '@/hooks/use-campaigns';
import { useSurveyTemplates } from '@/hooks/use-survey-templates';
// use-score-config + use-campaign-scores + ScoreConfigForm removed in Phase 3 PR A —
// weights/recalc now live on /admin/kol-analysis. Campaign no longer carries its own
// weight config or per-campaign computed scores.
import { useSendReminders, useSendInvitations, useDistributionStats, useEmailProgress } from '@/hooks/use-distribution';
import { RequireAuth } from '@/components/auth/require-auth';
import { CampaignHcpsTab } from '@/components/campaigns/campaign-hcps-tab';
import { CampaignTemplatesTab } from '@/components/campaigns/campaign-templates-tab';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  Users,
  FileText,
  Bell,
  CheckCircle2,
  AlertCircle,
  Mail,
  LayoutDashboard,
  UserCheck,
  Pencil,
  X,
  Check,
  Loader2,
  Send,
  Circle,
  ChevronRight,
  DollarSign,
  History,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CampaignStatus } from '@kol360/shared';
// ScoreConfigInput removed from shared in Phase 3 PR A — campaign no longer
// has its own weight config (now on KolAnalysis.weightsJson).

const statusColors: Record<CampaignStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  ACTIVE: 'bg-green-100 text-green-800',
  CLOSED: 'bg-yellow-100 text-yellow-800',
  PUBLISHED: 'bg-blue-100 text-blue-800',
};

// Workflow steps configuration - steps 1-4 are setup (DRAFT), 5+ are post-activation
// Phase 3 PR A (v1.16.0): 'scores' (Score Config) + 'survey-scores' (Survey Scores
// calculate) steps removed. Weights and recalc moved to /admin/kol-analysis per
// (client, DA); campaign setup no longer carries the legacy CompositeScoreConfig
// confirm-and-continue step.
const WORKFLOW_STEPS = [
  { id: 'overview', label: 'Overview', icon: FileText, description: 'Campaign details', phase: 'setup' },
  { id: 'hcps', label: 'HCPs', icon: Users, description: 'Assign participants', phase: 'setup' },
  { id: 'templates', label: 'Templates', icon: Mail, description: 'Email templates', phase: 'setup' },
  { id: 'initiate', label: 'Initiate Survey', icon: Send, description: 'Launch campaign', phase: 'setup' },
  { id: 'nominations', label: 'Nominations', icon: UserCheck, description: 'Match nominations', phase: 'active', external: true },
  // { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'View results', phase: 'published', external: true },
  { id: 'payments', label: 'Payments', icon: DollarSign, description: 'Honorarium tracking', phase: 'published', external: true },
  // Survey Status is a monitoring tool — accessible across all non-DRAFT statuses
  { id: 'survey-status', label: 'Survey Status', icon: UserCheck, description: 'Track survey taker progress', phase: 'active', external: true },
];

// Helper type for step completion status
interface StepStatus {
  id: string;
  completed: boolean;
  label: string;
}

export default function CampaignDetailPage() {
  const { isImpersonating } = useImpersonation();
  const { canWrite } = useAuth();
  // v1.17.20: client roles (CLIENT_ADMIN + TEAM_MEMBER) are view-only.
  // canEdit gates write affordances; visibleSteps gates the workflow
  // tabs so client users see only the Overview "status view" — no
  // setup steps (HCPs / Templates / Initiate), no Survey Status (which
  // exposes the per-HCP survey link), no Nominations / Payments.
  const canEdit = canWrite && !isImpersonating;
  const visibleSteps = canWrite ? WORKFLOW_STEPS : WORKFLOW_STEPS.filter(s => s.id === 'overview');
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;

  const { data: campaign, isLoading } = useCampaign(campaignId);
  // useScoreConfig + useUpdateScoreConfig + useResetScoreConfig removed in
  // Phase 3 PR A — campaign no longer has its own weight config.
  const updateCampaign = useUpdateCampaign();
  const activateCampaign = useActivateCampaign();
  const closeCampaign = useCloseCampaign();
  const reopenCampaign = useReopenCampaign();
  const publishCampaign = usePublishCampaign();
  const sendReminders = useSendReminders();
  const sendInvitations = useSendInvitations();
  const { data: distributionStats } = useDistributionStats(campaignId);
  // useCampaignScores removed in Phase 3 PR A. The "scores published" tile
  // in the CLOSED-state summary now falls back to status === 'PUBLISHED' as
  // the signal — campaignScores rows were a proxy for "publishScores() ran",
  // and that publish path is gone now.
  const { data: auditLogData } = useCampaignAuditLog(campaignId);
  const confirmWorkflowStep = useConfirmWorkflowStep();
  const { data: surveyTemplates } = useSurveyTemplates();

  const [activeStep, setActiveStep] = useState('overview');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editData, setEditData] = useState({ name: '', description: '' });
  const [statusAction, setStatusAction] = useState<'activate' | 'close' | 'reopen' | 'publish' | null>(null);
  const [showReminderConfirm, setShowReminderConfirm] = useState(false);
  const [showInvitationConfirm, setShowInvitationConfirm] = useState(false);
  const [invitationProgressId, setInvitationProgressId] = useState<string | null>(null);
  const [reminderProgressId, setReminderProgressId] = useState<string | null>(null);
  const [invitationResult, setInvitationResult] = useState<{ sent: number; failed?: number; skipped?: number; errors: Array<{ email: string; error: string }> } | null>(null);
  const [reminderResult, setReminderResult] = useState<{ sent: number; failed?: number; skipped?: number; skippedCompleted?: number; skippedRecentlyReminded?: number; skippedMaxReminders?: number; errors: Array<{ email: string; error: string }> } | null>(null);

  const { data: invitationProgress } = useEmailProgress(campaignId, invitationProgressId);
  const { data: reminderProgress } = useEmailProgress(campaignId, reminderProgressId);

  // When invitation progress completes, extract result and clear progressId.
  // Depends on the full progress object so React knows every read field is
  // covered. The if/else guards make non-terminal ticks a no-op, so this
  // re-runs cheaply on each progress update without changing behavior.
  useEffect(() => {
    if (invitationProgress?.status === 'completed' && invitationProgress.resultData) {
      setInvitationResult(invitationProgress.resultData as typeof invitationResult);
      setInvitationProgressId(null);
    } else if (invitationProgress?.status === 'failed') {
      setInvitationResult({
        sent: invitationProgress.created || 0,
        failed: invitationProgress.errors || 0,
        skipped: invitationProgress.updated || 0,
        errors: [{ email: 'system', error: invitationProgress.currentItem || 'Send failed' }],
      });
      setInvitationProgressId(null);
    }
  }, [invitationProgress]);

  // Same pattern as the invitation effect above.
  useEffect(() => {
    if (reminderProgress?.status === 'completed' && reminderProgress.resultData) {
      setReminderResult(reminderProgress.resultData as typeof reminderResult);
      setReminderProgressId(null);
    } else if (reminderProgress?.status === 'failed') {
      setReminderResult({
        sent: reminderProgress.created || 0,
        failed: reminderProgress.errors || 0,
        skipped: reminderProgress.updated || 0,
        errors: [{ email: 'system', error: reminderProgress.currentItem || 'Send failed' }],
      });
      setReminderProgressId(null);
    }
  }, [reminderProgress]);

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

  // handleSaveScoreConfig / handleResetScoreConfig removed in Phase 3 PR A —
  // campaign weight config moved to KolAnalysis.weightsJson per (client, DA).

  const [overrideReminderLimit, setOverrideReminderLimit] = useState(false);

  const handleSendReminders = async () => {
    try {
      // If override is enabled, pass a high maxReminders so HCPs at the limit receive another reminder
      const maxReminders = overrideReminderLimit ? 100 : undefined;
      const result = await sendReminders.mutateAsync({ campaignId, maxReminders });
      if (result?.progressId) {
        setReminderProgressId(result.progressId);
      }
      setShowReminderConfirm(false);
      setOverrideReminderLimit(false);
    } catch (error) {
      console.error('Failed to send reminders:', error);
    }
  };

  const handleSendInvitations = async () => {
    try {
      const result = await sendInvitations.mutateAsync(campaignId);
      if (result?.progressId) {
        setInvitationProgressId(result.progressId);
      }
      setShowInvitationConfirm(false);
    } catch (error) {
      console.error('Failed to send invitations:', error);
    }
  };

  // handleConfirmStep narrowed in Phase 3 PR A — 'scores' step removed, only
  // 'templates' remains as a per-campaign confirm-and-continue gate.
  const handleConfirmStep = async (step: 'templates') => {
    try {
      await confirmWorkflowStep.mutateAsync({ campaignId, step });
      if (step === 'templates') {
        setActiveStep('initiate');
      }
    } catch (error) {
      console.error(`Failed to confirm ${step} step:`, error);
    }
  };

  // Calculate step completion status for DRAFT campaigns.
  // Phase 3 PR A: dropped the 'scores' step (and its scoreConfigConfirmedAt
  // gate) — campaign no longer carries its own weight config.
  const getSetupStepStatuses = (): StepStatus[] => {
    if (!campaign) return [];

    const hasHcps = campaign._count.campaignHcps > 0;
    const hasConfirmedTemplates = !!campaign.templatesConfirmedAt;

    return [
      { id: 'overview', completed: true, label: 'Overview' }, // Always complete
      { id: 'hcps', completed: hasHcps, label: 'Assign HCPs' },
      { id: 'templates', completed: hasConfirmedTemplates, label: 'Email Templates' },
      { id: 'initiate', completed: false, label: 'Initiate Survey' }, // Complete when activated
    ];
  };

  // Get the next incomplete step for DRAFT campaigns
  const getNextIncompleteStep = (): StepStatus | null => {
    const statuses = getSetupStepStatuses();
    return statuses.find(s => !s.completed) || null;
  };

  // Check if all setup steps are complete (ready to activate).
  // Phase 3 PR A: scoreConfigConfirmedAt gate dropped — only HCPs + survey
  // questions + templates confirm remain.
  const isReadyToActivate = (): boolean => {
    if (!campaign || campaign.status !== 'DRAFT') return false;
    const hasHcps = campaign._count.campaignHcps > 0;
    const hasSurveyQuestions = ((campaign._count as Record<string, number>).surveyQuestions ?? 0) > 0;
    const hasConfirmedTemplates = !!campaign.templatesConfirmedAt;
    return hasHcps && hasSurveyQuestions && hasConfirmedTemplates;
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
      case 'ACTIVE': return 4; // Survey initiated (was 5 pre-PR-A; 'scores' step removed)
      case 'CLOSED': return 5; // Nominations done (was 6; 'survey-scores' removed)
      case 'PUBLISHED': return 6; // Payments available (was 8; numbering shifted)
      default: return 0;
    }
  };

  const handleStepClick = (stepId: string) => {
    const step = WORKFLOW_STEPS.find(s => s.id === stepId);
    if (step?.external) {
      // Navigate to external page
      // Phase 3 PR A: 'survey-scores' external link removed (page replaced with
      // a redirect to /admin/kol-analysis). If a bookmark or stale state ever
      // routes here for that id, the redirect handles it.
      switch (stepId) {
        case 'survey-status':
          router.push(`/admin/campaigns/${campaignId}/survey-status`);
          break;
        case 'nominations':
          router.push(`/admin/campaigns/${campaignId}/nominations`);
          break;
        case 'payments':
          router.push(`/admin/campaigns/${campaignId}/payments`);
          break;
        // case 'dashboard':
        //   router.push(`/admin/campaigns/${campaignId}/dashboard`);
        //   break;
      }
    } else {
      setActiveStep(stepId);
    }
  };

  if (isLoading) {
    return (
      <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN', 'TEAM_MEMBER']}>
        <div className="p-6">Loading...</div>
      </RequireAuth>
    );
  }

  if (!campaign) {
    return (
      <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN', 'TEAM_MEMBER']}>
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
    <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN', 'TEAM_MEMBER']}>
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
                  {campaign.status !== 'PUBLISHED' && canEdit && (
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
            {campaign.status === 'DRAFT' && canEdit && (() => {
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
            {campaign.status === 'ACTIVE' && canEdit && (
              <Button onClick={() => handleStepClick('nominations')}>
                <UserCheck className="w-4 h-4 mr-2" />
                Review Nominations
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
            {/* "Calculate Scores" button removed in Phase 3 PR A — scores are
                computed by the KOL Analysis pipeline now (auto on /publish,
                or via the explicit Recalculate button on the analysis page).
                Dashboard button disabled until campaign-level config is ready. */}
          </div>
        </div>

        {/* Workflow Progress Steps */}
        <div className="mb-6 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max pb-2">
            {visibleSteps.map((step, index) => {
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
              // Payments step is only accessible after campaign is published
              const isPaymentsStep = step.id === 'payments';
              const canAccessPayments = isPaymentsStep && ['ACTIVE', 'CLOSED', 'PUBLISHED'].includes(campaign.status);
              // Other external steps are accessible once campaign is not in DRAFT
              const canAccessOtherExternal = step.external && !isPaymentsStep && campaign.status !== 'DRAFT';
              const isClickable = isSetupStep || canAccessPayments || canAccessOtherExternal;

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
                  {index < visibleSteps.length - 1 && (
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
                    <CardTitle className="text-lg">Score Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* Phase 3 PR A: campaign-level scores are gone. Score
                        status now reflects whether the campaign has been
                        PUBLISHED (which triggers the KOL Analysis auto-recalc
                        for any analysis that includes this campaign). For
                        per-HCP scores, the steward goes to /admin/kol-analysis. */}
                    {campaign.status === 'PUBLISHED' ? (
                      <div>
                        <div className="text-3xl font-bold text-green-600">✓</div>
                        <p className="text-sm text-muted-foreground">Published — analysis recalculated</p>
                      </div>
                    ) : (
                      <div>
                        <div className="text-3xl font-bold text-muted-foreground">--</div>
                        <p className="text-sm text-muted-foreground">Publish to update analysis</p>
                      </div>
                    )}
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
                  <div>
                    <label className="text-sm text-muted-foreground">Survey Template</label>
                    {canEdit && (campaign.status === 'DRAFT' || (campaign.status === 'ACTIVE' && campaign._count.surveyResponses === 0)) ? (
                      <Select
                        value={campaign.surveyTemplateId || 'none'}
                        onValueChange={async (value) => {
                          try {
                            await updateCampaign.mutateAsync({
                              id: campaignId,
                              data: { surveyTemplateId: value === 'none' ? null : value },
                            });
                          } catch (error) {
                            console.error('Failed to update survey template:', error);
                          }
                        }}
                        disabled={updateCampaign.isPending}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select a survey template" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No template</SelectItem>
                          {surveyTemplates?.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p>{campaign.surveyTemplate?.name || 'None'}</p>
                    )}
                  </div>
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
                    <label className="text-sm text-muted-foreground">Honorarium Amount ($)</label>
                    {canEdit && ['DRAFT', 'ACTIVE'].includes(campaign.status) ? (
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="e.g. 150"
                        defaultValue={campaign.honorariumAmount ?? ''}
                        key={`hon-${campaign.honorariumAmount}`}
                        onBlur={async (e) => {
                          const val = e.target.value === '' ? null : Number(e.target.value);
                          if (val === campaign.honorariumAmount) return;
                          try {
                            await updateCampaign.mutateAsync({
                              id: campaignId,
                              data: { honorariumAmount: val },
                            });
                          } catch (error) {
                            console.error('Failed to update honorarium amount:', error);
                          }
                        }}
                        className="mt-1 max-w-[200px]"
                        disabled={updateCampaign.isPending}
                      />
                    ) : (
                      <p className="font-medium">{campaign.honorariumAmount ? `$${campaign.honorariumAmount}` : 'Not set'}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between border rounded-lg p-3 bg-muted/30">
                    <div>
                      <label className="text-sm font-medium">Exclude Internal Emails</label>
                      <p className="text-xs text-muted-foreground">
                        Hide @bio-exec.com respondents from nominations, scores, and exports
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={campaign.excludeInternalEmails ?? false}
                      onClick={async () => {
                        try {
                          await updateCampaign.mutateAsync({
                            id: campaignId,
                            data: { excludeInternalEmails: !campaign.excludeInternalEmails },
                          });
                        } catch (error) {
                          console.error('Failed to toggle exclude internal emails:', error);
                        }
                      }}
                      disabled={updateCampaign.isPending}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        campaign.excludeInternalEmails ? 'bg-primary' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          campaign.excludeInternalEmails ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center justify-between border rounded-lg p-3 bg-muted/30">
                    <div>
                      <label className="text-sm font-medium">Show Topics Discussed Charts</label>
                      <p className="text-xs text-muted-foreground">
                        When enabled, the Topics Discussed charts will appear in the insights dashboard for this campaign
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={campaign.showTopicsDiscussed ?? false}
                      onClick={async () => {
                        try {
                          await updateCampaign.mutateAsync({
                            id: campaignId,
                            data: { showTopicsDiscussed: !campaign.showTopicsDiscussed },
                          });
                        } catch (error) {
                          console.error('Failed to toggle show topics discussed:', error);
                        }
                      }}
                      disabled={updateCampaign.isPending}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        campaign.showTopicsDiscussed ? 'bg-primary' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          campaign.showTopicsDiscussed ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Created</label>
                    <p>{new Date(campaign.createdAt).toLocaleString()}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Campaign Status Audit Log */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <History className="w-5 h-5" />
                    Status History
                  </CardTitle>
                  <CardDescription>Audit log of campaign status changes</CardDescription>
                </CardHeader>
                <CardContent>
                  {auditLogData?.items && auditLogData.items.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Action</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Changed By</TableHead>
                          <TableHead>Date/Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {auditLogData.items.map((log) => {
                          // Format action to be more readable
                          const actionLabel = log.action
                            .replace('campaign.', '')
                            .replace(/_/g, ' ')
                            .replace(/\b\w/g, (c) => c.toUpperCase());

                          // Get status from newValues if available
                          const newStatus = log.newValues?.status as string | undefined;

                          return (
                            <TableRow key={log.id}>
                              <TableCell className="font-medium">{actionLabel}</TableCell>
                              <TableCell>
                                {newStatus && (
                                  <Badge className={statusColors[newStatus as CampaignStatus] || 'bg-gray-100'}>
                                    {newStatus}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {log.user
                                  ? `${log.user.firstName || ''} ${log.user.lastName || ''}`.trim() || log.user.email
                                  : 'System'}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {new Date(log.createdAt).toLocaleString()}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-muted-foreground text-center py-4">No status changes recorded yet</p>
                  )}
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

          {/* activeStep === 'scores' render block removed in Phase 3 PR A.
              Campaign-level Score Config tab is gone; weights live on
              KolAnalysis per (client, DA) at /admin/kol-analysis. The 'scores'
              workflow step itself is also dropped from WORKFLOW_STEPS, so
              clicking the (no-longer-rendered) step is impossible. */}

          {activeStep === 'templates' && (
            <div className="space-y-6">
              <CampaignTemplatesTab campaignId={campaignId} />
              {campaign.status === 'DRAFT' && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        {campaign.templatesConfirmedAt ? (
                          <div className="flex items-center gap-2 text-green-600">
                            <CheckCircle2 className="w-5 h-5" />
                            <span className="font-medium">Email templates confirmed</span>
                            <span className="text-sm text-muted-foreground">
                              ({new Date(campaign.templatesConfirmedAt).toLocaleDateString()})
                            </span>
                          </div>
                        ) : (
                          <p className="text-muted-foreground">
                            Review the email templates above and confirm to continue. Default templates will be used if not customized.
                          </p>
                        )}
                      </div>
                      <Button
                        onClick={() => handleConfirmStep('templates')}
                        disabled={confirmWorkflowStep.isPending}
                      >
                        {confirmWorkflowStep.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <ChevronRight className="w-4 h-4 mr-2" />
                        )}
                        {campaign.templatesConfirmedAt ? 'Continue to Launch' : 'Confirm & Continue'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
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
                      <h4 className="font-medium text-blue-900 mb-2">Setup Checklist:</h4>
                      <ul className="text-sm space-y-2">
                        <li className={`flex items-center gap-2 ${((campaign._count as Record<string, number>).surveyQuestions ?? 0) > 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {((campaign._count as Record<string, number>).surveyQuestions ?? 0) > 0 ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            <AlertCircle className="w-4 h-4" />
                          )}
                          Survey questions ({(campaign._count as Record<string, number>).surveyQuestions ?? 0} questions)
                          {((campaign._count as Record<string, number>).surveyQuestions ?? 0) === 0 && (
                            <span className="text-red-600 font-medium">- Select a survey template in Overview</span>
                          )}
                        </li>
                        <li className={`flex items-center gap-2 ${campaign._count.campaignHcps > 0 ? 'text-green-700' : 'text-blue-800'}`}>
                          {campaign._count.campaignHcps > 0 ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            <Circle className="w-4 h-4" />
                          )}
                          HCPs assigned ({campaign._count.campaignHcps} assigned)
                          {campaign._count.campaignHcps === 0 && (
                            <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setActiveStep('hcps')}>
                              Go to HCPs
                            </Button>
                          )}
                        </li>
                        {/* Score-config gate removed in Phase 3 PR A. The
                            scoreConfigConfirmedAt DB column is still populated
                            on legacy rows but no longer used to gate Activate. */}
                        <li className={`flex items-center gap-2 ${campaign.templatesConfirmedAt ? 'text-green-700' : 'text-blue-800'}`}>
                          {campaign.templatesConfirmedAt ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            <Circle className="w-4 h-4" />
                          )}
                          Email templates confirmed
                          {!campaign.templatesConfirmedAt && (
                            <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setActiveStep('templates')}>
                              Go to Templates
                            </Button>
                          )}
                        </li>
                      </ul>
                    </div>
                    <div className="flex items-center gap-4">
                      {canEdit && (
                        <Button
                          onClick={() => setStatusAction('activate')}
                          size="lg"
                          disabled={!isReadyToActivate()}
                        >
                          <Play className="w-5 h-5 mr-2" />
                          Activate Campaign
                        </Button>
                      )}
                      {isReadyToActivate() ? (
                        <p className="text-sm text-muted-foreground">
                          This will activate the campaign. You can then send invitation emails to HCPs.
                        </p>
                      ) : (
                        <p className="text-sm text-amber-600">
                          Complete all setup steps above to activate the campaign
                        </p>
                      )}
                    </div>
                  </>
                ) : campaign.status === 'ACTIVE' ? (
                  <>
                    <div className="bg-green-50 border border-green-200 rounded-md p-4">
                      <div className="flex items-center gap-2 text-green-800">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="font-medium">Campaign is active</span>
                      </div>
                      {distributionStats && distributionStats.invited > 0 ? (
                        <p className="text-sm text-green-700 mt-1">
                          Survey invitations have been sent to {distributionStats.invited} HCPs. They can now respond.
                        </p>
                      ) : (
                        <p className="text-sm text-amber-600 mt-1">
                          Campaign is active but no invitations have been sent yet. Click &quot;Send Invitations&quot; below to email HCPs.
                        </p>
                      )}
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

                    {canEdit && (
                      <div className="flex gap-3 flex-wrap">
                        {distributionStats && distributionStats.notInvited > 0 && (
                          <Button onClick={() => setShowInvitationConfirm(true)} variant="default" disabled={!!invitationProgressId || sendInvitations.isPending}>
                            <Mail className="w-4 h-4 mr-2" />
                            {invitationProgressId ? 'Sending Invitations...' : `Send Invitations (${distributionStats.notInvited})`}
                          </Button>
                        )}
                        <Button onClick={() => setShowReminderConfirm(true)} variant="outline" disabled={!distributionStats || distributionStats.invited === 0 || !!reminderProgressId || sendReminders.isPending}>
                          <Bell className="w-4 h-4 mr-2" />
                          {reminderProgressId ? 'Sending Reminders...' : 'Send Reminders'}
                        </Button>
                        <Button onClick={() => setStatusAction('close')} variant="outline">
                          <Pause className="w-4 h-4 mr-2" />
                          Close Survey
                        </Button>
                      </div>
                    )}
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
                    {canEdit && (
                      <Button onClick={() => setStatusAction('reopen')} variant="outline">
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Reopen Survey
                      </Button>
                    )}
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

        {/* Send Invitations Confirmation */}
        <AlertDialog open={showInvitationConfirm} onOpenChange={setShowInvitationConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Send Survey Invitations</AlertDialogTitle>
              <AlertDialogDescription>
                This will send invitation emails to {distributionStats?.notInvited || 0} HCPs who have not yet received an invitation.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleSendInvitations} disabled={sendInvitations.isPending}>
                {sendInvitations.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Invitations'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Invitation Result Dialog */}
        <Dialog open={!!invitationResult} onOpenChange={() => setInvitationResult(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {invitationResult?.failed === 0 ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-yellow-500" />
                )}
                Invitations Sent
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-2">
              <p className="text-lg">
                Successfully sent: <strong className="text-green-600">{invitationResult?.sent || 0}</strong>
              </p>
              {(invitationResult?.failed ?? 0) > 0 && (
                <p className="text-lg">
                  Failed: <strong className="text-red-600">{invitationResult?.failed}</strong>
                </p>
              )}
              {(invitationResult?.skipped ?? 0) > 0 && (
                <p className="text-lg">
                  Skipped: <strong className="text-muted-foreground">{invitationResult?.skipped}</strong>
                </p>
              )}
              {invitationResult?.errors && invitationResult.errors.length > 0 && (
                <div className="mt-4">
                  <p className="font-medium mb-2">Errors:</p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {invitationResult.errors.map((err, i) => (
                      <li key={i}>{err.email}: {err.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => setInvitationResult(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Send Reminders Confirmation */}
        <AlertDialog open={showReminderConfirm} onOpenChange={(open) => { setShowReminderConfirm(open); if (!open) setOverrideReminderLimit(false); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Send Reminders</AlertDialogTitle>
              <AlertDialogDescription>
                This will send reminder emails to HCPs who have been invited but haven&apos;t completed the survey.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {distributionStats && distributionStats.atMaxReminders > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 my-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-900">
                      {distributionStats.atMaxReminders} HCP{distributionStats.atMaxReminders === 1 ? ' has' : 's have'} reached the reminder limit (3)
                    </p>
                    <p className="text-xs text-amber-700 mt-1">
                      These HCPs will be skipped unless you override the limit below.
                    </p>
                    <label className="flex items-center gap-2 mt-2 cursor-pointer">
                      <Checkbox
                        checked={overrideReminderLimit}
                        onCheckedChange={(checked) => setOverrideReminderLimit(!!checked)}
                      />
                      <span className="text-sm text-amber-900">
                        Override limit and send to these HCPs anyway
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleSendReminders} disabled={sendReminders.isPending}>
                {sendReminders.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : overrideReminderLimit ? (
                  'Send Emails (Override)'
                ) : (
                  'Send Emails'
                )}
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
