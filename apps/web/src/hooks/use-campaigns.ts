import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { CreateCampaignInput, UpdateCampaignInput, CampaignStatus } from '@kol360/shared';

interface Client {
  id: string;
  name: string;
}

interface DiseaseArea {
  id: string;
  name: string;
}

interface SurveyTemplate {
  id: string;
  name: string;
}

interface Campaign {
  id: string;
  clientId: string;
  client: Client;
  diseaseAreaId: string;
  diseaseArea: DiseaseArea;
  surveyTemplateId: string | null;
  surveyTemplate: SurveyTemplate | null;
  name: string;
  description: string | null;
  status: CampaignStatus;
  honorariumAmount: number | null;
  surveyOpenDate: string | null;
  surveyCloseDate: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    campaignHcps: number;
    surveyResponses: number;
  };
}

interface CampaignListResponse {
  items: Campaign[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface CampaignListParams {
  clientId?: string;
  status?: CampaignStatus;
  page?: number;
  limit?: number;
}

export function useCampaigns(params: CampaignListParams = {}) {
  const queryParams = new URLSearchParams();
  if (params.clientId) queryParams.set('clientId', params.clientId);
  if (params.status) queryParams.set('status', params.status);
  if (params.page) queryParams.set('page', params.page.toString());
  if (params.limit) queryParams.set('limit', params.limit.toString());

  const queryString = queryParams.toString();

  return useQuery({
    queryKey: ['campaigns', params],
    queryFn: () =>
      apiClient.get<CampaignListResponse>(
        `/api/v1/campaigns${queryString ? `?${queryString}` : ''}`
      ),
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: ['campaigns', id],
    queryFn: () => apiClient.get<Campaign>(`/api/v1/campaigns/${id}`),
    enabled: !!id,
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCampaignInput) =>
      apiClient.post<Campaign>('/api/v1/campaigns', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCampaignInput }) =>
      apiClient.put<Campaign>(`/api/v1/campaigns/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns', variables.id] });
    },
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/v1/campaigns/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

export function useActivateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<Campaign>(`/api/v1/campaigns/${id}/activate`, {}),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns', id] });
    },
  });
}

export function useCloseCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<Campaign>(`/api/v1/campaigns/${id}/close`, {}),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns', id] });
    },
  });
}

export function useReopenCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<Campaign>(`/api/v1/campaigns/${id}/reopen`, {}),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns', id] });
    },
  });
}

export function usePublishCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<Campaign>(`/api/v1/campaigns/${id}/publish`, {}),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns', id] });
    },
  });
}
