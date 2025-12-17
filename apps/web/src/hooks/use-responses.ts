import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

interface Hcp {
  id: string;
  npi: string;
  firstName: string;
  lastName: string;
  email: string | null;
  specialty?: string | null;
  city?: string | null;
  state?: string | null;
}

interface SurveyResponseAnswer {
  id: string;
  questionId: string;
  answerText: string | null;
  answerJson: unknown;
  question: {
    id: string;
    sortOrder: number;
    questionTextSnapshot: string;
    sectionName: string | null;
    isRequired: boolean;
    question: {
      id: string;
      type: string;
      options: unknown;
    };
  };
}

interface Nomination {
  id: string;
  rawNameEntered: string;
  matchStatus: string;
  matchedHcp: {
    id: string;
    firstName: string;
    lastName: string;
    npi: string;
  } | null;
}

interface Payment {
  id: string;
  amount: number;
  status: string;
  exportedAt: string | null;
  claimedAt: string | null;
}

interface ResponseListItem {
  id: string;
  campaignId: string;
  surveyToken: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  ipAddress: string | null;
  createdAt: string;
  respondentHcp: {
    id: string;
    npi: string;
    firstName: string;
    lastName: string;
    email: string | null;
  };
  _count: {
    nominations: number;
  };
}

interface ResponseDetail {
  id: string;
  campaignId: string;
  surveyToken: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  ipAddress: string | null;
  createdAt: string;
  respondentHcp: Hcp;
  campaign: {
    id: string;
    name: string;
    status: string;
  };
  answers: SurveyResponseAnswer[];
  nominations: Nomination[];
  payment: Payment | null;
}

interface ResponsesListResponse {
  items: ResponseListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface ResponsesQuery {
  status?: string;
  page?: number;
  limit?: number;
}

interface ResponseStats {
  PENDING?: number;
  OPENED?: number;
  IN_PROGRESS?: number;
  COMPLETED?: number;
  EXCLUDED?: number;
}

export function useResponses(campaignId: string, query: ResponsesQuery = {}) {
  const { page = 1, limit = 50, status } = query;

  return useQuery({
    queryKey: ['campaigns', campaignId, 'responses', { page, limit, status }],
    queryFn: () =>
      apiClient.get<ResponsesListResponse>(`/api/v1/campaigns/${campaignId}/responses`, {
        page,
        limit,
        status,
      }),
    enabled: !!campaignId,
  });
}

export function useResponseStats(campaignId: string) {
  return useQuery({
    queryKey: ['campaigns', campaignId, 'responses', 'stats'],
    queryFn: () =>
      apiClient.get<ResponseStats>(`/api/v1/campaigns/${campaignId}/responses/stats`),
    enabled: !!campaignId,
  });
}

export function useResponse(campaignId: string, responseId: string) {
  return useQuery({
    queryKey: ['campaigns', campaignId, 'responses', responseId],
    queryFn: () =>
      apiClient.get<ResponseDetail>(`/api/v1/campaigns/${campaignId}/responses/${responseId}`),
    enabled: !!campaignId && !!responseId,
  });
}

export function useUpdateAnswer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      campaignId,
      responseId,
      questionId,
      value,
    }: {
      campaignId: string;
      responseId: string;
      questionId: string;
      value: unknown;
    }) =>
      apiClient.put(`/api/v1/campaigns/${campaignId}/responses/${responseId}`, {
        questionId,
        value,
      }),
    onSuccess: (_, { campaignId, responseId }) => {
      queryClient.invalidateQueries({
        queryKey: ['campaigns', campaignId, 'responses', responseId],
      });
    },
  });
}

export function useExcludeResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      campaignId,
      responseId,
      reason,
    }: {
      campaignId: string;
      responseId: string;
      reason: string;
    }) =>
      apiClient.post(`/api/v1/campaigns/${campaignId}/responses/${responseId}/exclude`, {
        reason,
      }),
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'responses'] });
    },
  });
}

export function useIncludeResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      campaignId,
      responseId,
    }: {
      campaignId: string;
      responseId: string;
    }) =>
      apiClient.post(`/api/v1/campaigns/${campaignId}/responses/${responseId}/include`, {}),
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'responses'] });
    },
  });
}
