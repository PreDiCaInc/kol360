import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

export type AnalysisCalcStatus = 'idle' | 'running' | 'done' | 'error';

export interface AnalysisWeights {
  weightPublications: number;
  weightClinicalTrials: number;
  weightTradePubs: number;
  weightOrgLeadership: number;
  weightOrgAwards: number;
  weightConference: number;
  weightSocialMedia: number;
  weightMediaPodcasts: number;
  weightSurvey: number;
}

export interface KolAnalysisListItem {
  id: string;
  name: string;
  calcStatus: AnalysisCalcStatus;
  lastCalculatedAt: string | null;
  clientId: string;
  diseaseAreaId: string;
  client: { id: string; name: string };
  diseaseArea: { id: string; name: string };
  _count: { campaigns: number; scores: number };
}

export interface KolAnalysisDetail {
  id: string;
  name: string;
  calcStatus: AnalysisCalcStatus;
  calcError: string | null;
  lastCalculatedAt: string | null;
  weightsJson: AnalysisWeights;
  client: { id: string; name: string };
  diseaseArea: { id: string; name: string };
  campaigns: Array<{
    id: string;
    campaignId: string;
    included: boolean;
    campaign: { id: string; name: string; status: string };
  }>;
  _count: { scores: number };
}

export function useKolAnalyses() {
  return useQuery({
    queryKey: ['kol-analyses'],
    queryFn: () =>
      apiClient.get<{ items: KolAnalysisListItem[] }>('/api/v1/admin/kol-analyses'),
    select: (d) => d.items,
  });
}

export function useKolAnalysis(id: string) {
  return useQuery({
    queryKey: ['kol-analyses', id],
    queryFn: () => apiClient.get<KolAnalysisDetail>(`/api/v1/admin/kol-analyses/${id}`),
    enabled: !!id,
  });
}

export function useUpdateKolAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      name,
      weights,
    }: {
      id: string;
      name?: string;
      weights?: AnalysisWeights;
    }) => apiClient.put(`/api/v1/admin/kol-analyses/${id}`, { name, weights }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['kol-analyses', id] });
      qc.invalidateQueries({ queryKey: ['kol-analyses'] });
    },
  });
}

export function useUpdateKolAnalysisCampaigns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      campaigns,
    }: {
      id: string;
      campaigns: Array<{ campaignId: string; included: boolean }>;
    }) => apiClient.put(`/api/v1/admin/kol-analyses/${id}/campaigns`, { campaigns }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['kol-analyses', id] });
      qc.invalidateQueries({ queryKey: ['kol-analyses', id, 'available-campaigns'] });
      qc.invalidateQueries({ queryKey: ['kol-analyses'] });
    },
  });
}

export interface AvailableCampaign {
  id: string;
  name: string;
  status: string;
  clientId: string;
  clientName: string;
  crossClient: boolean;
}

export function useCreateKolAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { clientId: string; diseaseAreaId: string; name: string }) =>
      apiClient.post<{ id: string }>('/api/v1/admin/kol-analyses', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kol-analyses'] }),
  });
}

export function useAvailableCampaigns(analysisId: string) {
  return useQuery({
    queryKey: ['kol-analyses', analysisId, 'available-campaigns'],
    queryFn: () =>
      apiClient.get<{ items: AvailableCampaign[] }>(
        `/api/v1/admin/kol-analyses/${analysisId}/available-campaigns`
      ),
    select: (d) => d.items,
    enabled: !!analysisId,
  });
}

export function useRecalculateKolAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<{ processed: number }>(
        `/api/v1/admin/kol-analyses/${id}/recalculate`
      ),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['kol-analyses', id] });
      qc.invalidateQueries({ queryKey: ['kol-analyses'] });
    },
  });
}
