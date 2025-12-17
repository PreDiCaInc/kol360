import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { ScoreConfigInput } from '@kol360/shared';

interface ScoreConfig {
  id: string;
  campaignId: string;
  weightPublications: number;
  weightClinicalTrials: number;
  weightTradePubs: number;
  weightOrgLeadership: number;
  weightOrgAwareness: number;
  weightConference: number;
  weightSocialMedia: number;
  weightMediaPodcasts: number;
  weightSurvey: number;
  createdAt: string;
  updatedAt: string;
}

export function useScoreConfig(campaignId: string) {
  return useQuery({
    queryKey: ['score-config', campaignId],
    queryFn: () => apiClient.get<ScoreConfig>(`/api/v1/campaigns/${campaignId}/score-config`),
    enabled: !!campaignId,
  });
}

export function useUpdateScoreConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ campaignId, data }: { campaignId: string; data: ScoreConfigInput }) =>
      apiClient.put<ScoreConfig>(`/api/v1/campaigns/${campaignId}/score-config`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['score-config', variables.campaignId] });
    },
  });
}

export function useResetScoreConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (campaignId: string) =>
      apiClient.post<ScoreConfig>(`/api/v1/campaigns/${campaignId}/score-config/reset`, {}),
    onSuccess: (_, campaignId) => {
      queryClient.invalidateQueries({ queryKey: ['score-config', campaignId] });
    },
  });
}
