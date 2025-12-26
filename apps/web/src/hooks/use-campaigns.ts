import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { CreateCampaignInput, UpdateCampaignInput, CampaignStatus, EmailTemplatesInput, LandingPageTemplatesInput } from '@kol360/shared';

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
  // Workflow step confirmations
  scoreConfigConfirmedAt: string | null;
  templatesConfirmedAt: string | null;
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

// Email Templates
export interface EmailTemplates {
  invitationEmailSubject: string | null;
  invitationEmailBody: string | null;
  reminderEmailSubject: string | null;
  reminderEmailBody: string | null;
}

export function useEmailTemplates(campaignId: string) {
  return useQuery({
    queryKey: ['campaigns', campaignId, 'email-templates'],
    queryFn: () => apiClient.get<EmailTemplates>(`/api/v1/campaigns/${campaignId}/email-templates`),
    enabled: !!campaignId,
  });
}

export function useUpdateEmailTemplates() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ campaignId, data }: { campaignId: string; data: EmailTemplatesInput }) =>
      apiClient.put<EmailTemplates>(`/api/v1/campaigns/${campaignId}/email-templates`, data),
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'email-templates'] });
    },
  });
}

// Landing Page Templates
export interface LandingPageTemplates {
  surveyWelcomeTitle: string | null;
  surveyWelcomeMessage: string | null;
  surveyThankYouTitle: string | null;
  surveyThankYouMessage: string | null;
  surveyAlreadyDoneTitle: string | null;
  surveyAlreadyDoneMessage: string | null;
}

export function useLandingPageTemplates(campaignId: string) {
  return useQuery({
    queryKey: ['campaigns', campaignId, 'landing-page-templates'],
    queryFn: () => apiClient.get<LandingPageTemplates>(`/api/v1/campaigns/${campaignId}/landing-page-templates`),
    enabled: !!campaignId,
  });
}

export function useUpdateLandingPageTemplates() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ campaignId, data }: { campaignId: string; data: LandingPageTemplatesInput }) =>
      apiClient.put<LandingPageTemplates>(`/api/v1/campaigns/${campaignId}/landing-page-templates`, data),
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'landing-page-templates'] });
    },
  });
}

// Survey Preview
interface QuestionOption {
  text: string;
  requiresText: boolean;
}

export interface SurveyPreviewQuestion {
  id: string;
  questionId: string;
  text: string;
  type: string;
  section: string | null;
  isRequired: boolean;
  options: QuestionOption[] | null;
  minEntries: number | null;
  defaultEntries: number | null;
  nominationType: string | null;
}

export interface SurveyPreviewData {
  campaignName: string;
  honorariumAmount: number | null;
  welcomeTitle: string | null;
  welcomeMessage: string | null;
  thankYouTitle: string | null;
  thankYouMessage: string | null;
  questions: SurveyPreviewQuestion[];
  sections: Record<string, SurveyPreviewQuestion[]>;
  totalQuestions: number;
}

export function useSurveyPreview(campaignId: string) {
  return useQuery({
    queryKey: ['campaigns', campaignId, 'survey-preview'],
    queryFn: () => apiClient.get<SurveyPreviewData>(`/api/v1/campaigns/${campaignId}/survey-preview`),
    enabled: !!campaignId,
  });
}

// Campaign Audit Log
export interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

export interface AuditLogResponse {
  items: AuditLogEntry[];
}

export function useCampaignAuditLog(campaignId: string) {
  return useQuery({
    queryKey: ['campaigns', campaignId, 'audit-log'],
    queryFn: () => apiClient.get<AuditLogResponse>(`/api/v1/campaigns/${campaignId}/audit-log`),
    enabled: !!campaignId,
  });
}

// Confirm workflow step
export function useConfirmWorkflowStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ campaignId, step }: { campaignId: string; step: 'scores' | 'templates' }) =>
      apiClient.post<{ success: boolean; step: string; confirmedAt: string }>(
        `/api/v1/campaigns/${campaignId}/confirm-step`,
        { step }
      ),
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId] });
    },
  });
}
