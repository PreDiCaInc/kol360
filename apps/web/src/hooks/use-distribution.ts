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
    mutationFn: (campaignId: string) =>
      apiClient.post<SendStartResult>(`/api/v1/campaigns/${campaignId}/distribution/send-reminders`),
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
