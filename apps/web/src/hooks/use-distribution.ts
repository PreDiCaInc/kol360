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
}

interface DistributionStats {
  total: number;
  invited: number;
  notInvited: number;
  inProgress: number;
  completed: number;
  completionRate: number;
}

interface SendResult {
  sent: number;
  failed?: number;
  errors: string[];
}

export function useCampaignHcps(campaignId: string) {
  return useQuery({
    queryKey: ['campaigns', campaignId, 'hcps'],
    queryFn: () => apiClient.get<CampaignHcp[]>(`/api/v1/campaigns/${campaignId}/hcps`),
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
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (campaignId: string) =>
      apiClient.post<SendResult>(`/api/v1/campaigns/${campaignId}/distribution/send`),
    onSuccess: (_, campaignId) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'hcps'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'distribution-stats'] });
    },
  });
}

export function useSendReminders() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (campaignId: string) =>
      apiClient.post<SendResult>(`/api/v1/campaigns/${campaignId}/distribution/remind`),
    onSuccess: (_, campaignId) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'hcps'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'distribution-stats'] });
    },
  });
}
