import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

interface Hcp {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  specialty: string | null;
  institution: string | null;
}

interface CampaignHcp {
  id: string;
  campaignId: string;
  hcpId: string;
  surveyToken: string;
  emailSentAt: string | null;
  reminderCount: number;
  lastReminderAt: string | null;
  createdAt: string;
  hcp: Hcp;
  surveyStatus: 'PENDING' | 'OPENED' | 'IN_PROGRESS' | 'COMPLETED' | 'EXCLUDED' | null;
  completedAt: string | null;
}

interface DistributionStats {
  total: number;
  invited: number;
  notInvited: number;
  opened: number;
  inProgress: number;
  completed: number;
  optedOut: number;
  atMaxReminders: number;
  completionRate: number;
}

interface SendResult {
  sent: number;
  failed?: number;
  skipped?: number;
  errors: Array<{ email: string; error: string }>;
}

interface SendStartResult {
  progressId: string;
  status: 'started' | 'already-running';
}

interface EmailProgress {
  id: string;
  type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total: number;
  processed: number;
  created: number;   // sent count
  updated: number;   // skipped count
  errors: number;    // failed count
  startedAt: string;
  completedAt?: string;
  currentItem?: string;
  estimatedSecondsRemaining?: number;
  resultData?: {
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
  };
}

export function useCampaignHcps(campaignId: string) {
  return useQuery({
    queryKey: ['campaigns', campaignId, 'hcps'],
    queryFn: async () => {
      const response = await apiClient.get<{ items: CampaignHcp[] }>(`/api/v1/campaigns/${campaignId}/hcps`);
      return response.items;
    },
    enabled: !!campaignId,
  });
}

export function useDistributionStats(campaignId: string) {
  return useQuery({
    queryKey: ['campaigns', campaignId, 'distribution-stats'],
    queryFn: () => apiClient.get<DistributionStats>(`/api/v1/campaigns/${campaignId}/distribution/stats`),
    enabled: !!campaignId,
  });
}

export interface SurveyStatusItem {
  campaignHcpId: string;
  hcpId: string;
  npi: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  specialty: string | null;
  subSpecialty: string | null;
  city: string | null;
  state: string | null;
  status: 'completed' | 'in_progress' | 'opened' | 'unsubscribed' | 'invited' | 'not_invited';
  statusDate: string | null;
  lastQuestion: number;       // 0 if none, 1-indexed question number
  totalQuestions: number;     // total questions in the campaign
  surveyToken?: string;       // only present for PLATFORM_ADMIN
  optOutId: string | null;    // active opt-out id if HCP is opted out
  optOutScope: 'CAMPAIGN' | 'GLOBAL' | null; // scope of active opt-out
}

interface SurveyStatusResponse {
  items: SurveyStatusItem[];
  pagination: { page: number; limit: number; total: number; pages: number };
  totalQuestions: number;
}

export interface OptOutItem {
  id: string;
  hcpId: string | null;
  npi: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
  scope: 'CAMPAIGN' | 'GLOBAL';
  campaignId: string | null;
  campaignName: string | null;
  reason: string | null;
  optedOutAt: string;
  optedOutVia: string;
  resubscribedAt: string | null;
  resubscribedVia: string | null;
}

export function useOptOutHcp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ hcpId, scope, campaignId, reason }: {
      hcpId: string;
      scope: 'CAMPAIGN' | 'GLOBAL';
      campaignId?: string;
      reason: string;
    }) =>
      apiClient.post<{ optOut: OptOutItem; alreadyOptedOut: boolean }>(
        `/api/v1/admin/opt-outs/hcp/${hcpId}`,
        { scope, campaignId, reason }
      ),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', vars.campaignId, 'survey-status'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'opt-outs'] });
    },
  });
}

export function useResubscribeHcp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ optOutId, reason }: { optOutId: string; reason?: string }) =>
      apiClient.post<OptOutItem>(`/api/v1/admin/opt-outs/${optOutId}/resubscribe`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'opt-outs'] });
    },
  });
}

export function useOptOuts(params: {
  page?: number;
  limit?: number;
  search?: string;
  scope?: string;
  status?: string;
  campaignId?: string;
  sortBy?: string;
  sortOrder?: string;
}) {
  return useQuery({
    queryKey: ['admin', 'opt-outs', params],
    queryFn: () =>
      apiClient.get<{ items: OptOutItem[]; pagination: { page: number; limit: number; total: number; pages: number } }>(
        `/api/v1/admin/opt-outs`,
        params as Record<string, string | number | undefined>
      ),
  });
}

export function useSurveyStatus(
  campaignId: string,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: string;
  }
) {
  return useQuery({
    queryKey: ['campaigns', campaignId, 'survey-status', params],
    queryFn: () => apiClient.get<SurveyStatusResponse>(
      `/api/v1/campaigns/${campaignId}/survey-status`,
      params as Record<string, string | number | undefined>
    ),
    enabled: !!campaignId,
  });
}

export function useAssignHcps() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ campaignId, hcpIds }: { campaignId: string; hcpIds: string[] }) =>
      apiClient.post<{ added: number; skipped: number }>(`/api/v1/campaigns/${campaignId}/hcps`, { hcpIds }),
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'hcps'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'distribution-stats'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId] });
    },
  });
}

export function useRemoveHcp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ campaignId, hcpId }: { campaignId: string; hcpId: string }) =>
      apiClient.delete(`/api/v1/campaigns/${campaignId}/hcps/${hcpId}`),
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'hcps'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'distribution-stats'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId] });
    },
  });
}

export function useSendInvitations() {
  return useMutation({
    mutationFn: (campaignId: string) =>
      apiClient.post<SendStartResult>(`/api/v1/campaigns/${campaignId}/distribution/send-invitations`),
  });
}

export function useSendReminders() {
  return useMutation({
    mutationFn: ({ campaignId, maxReminders }: { campaignId: string; maxReminders?: number }) =>
      apiClient.post<SendStartResult>(
        `/api/v1/campaigns/${campaignId}/distribution/send-reminders`,
        maxReminders !== undefined ? { maxReminders } : undefined
      ),
  });
}

/**
 * Poll email send progress every 2 seconds.
 * Stops polling when status is 'completed' or 'failed', then invalidates caches.
 */
export function useEmailProgress(campaignId: string, progressId: string | null) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['email-progress', progressId],
    queryFn: () =>
      apiClient.get<EmailProgress>(`/api/v1/campaigns/${campaignId}/distribution/progress/${progressId}`),
    enabled: !!progressId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'completed' || status === 'failed') {
        // Invalidate distribution data once done
        queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'hcps'] });
        queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'distribution-stats'] });
        return false; // stop polling
      }
      return 2000; // poll every 2s
    },
  });
}
