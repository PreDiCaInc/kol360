import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

interface MatchedHcp {
  id: string;
  npi: string;
  firstName: string;
  lastName: string;
}

interface NominatorHcp {
  firstName: string;
  lastName: string;
}

interface NominationQuestion {
  id: string;
  questionTextSnapshot: string;
  question: {
    id: string;
    type: string;
  };
}

interface Nomination {
  id: string;
  rawNameEntered: string;
  matchStatus: 'UNMATCHED' | 'MATCHED' | 'NEW_HCP' | 'EXCLUDED';
  matchedAt: string | null;
  matchedBy: string | null;
  matchedHcp: MatchedHcp | null;
  nominatorHcp: NominatorHcp;
  question: NominationQuestion;
}

interface NominationsListResponse {
  items: Nomination[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface NominationsQuery {
  status?: string;
  page?: number;
  limit?: number;
}

interface NominationStats {
  UNMATCHED?: number;
  MATCHED?: number;
  NEW_HCP?: number;
  EXCLUDED?: number;
}

interface HcpSuggestion {
  hcp: {
    id: string;
    npi: string;
    firstName: string;
    lastName: string;
    specialty: string | null;
    city: string | null;
    state: string | null;
    aliases: Array<{ id: string; aliasName: string }>;
  };
  score: number;
}

interface BulkMatchResult {
  matched: number;
  total: number;
  errors: string[];
}

export function useNominations(campaignId: string, query: NominationsQuery = {}) {
  const { page = 1, limit = 50, status } = query;

  return useQuery({
    queryKey: ['campaigns', campaignId, 'nominations', { page, limit, status }],
    queryFn: () =>
      apiClient.get<NominationsListResponse>(`/api/v1/campaigns/${campaignId}/nominations`, {
        page,
        limit,
        status,
      }),
    enabled: !!campaignId,
  });
}

export function useNominationStats(campaignId: string) {
  return useQuery({
    queryKey: ['campaigns', campaignId, 'nominations', 'stats'],
    queryFn: () =>
      apiClient.get<NominationStats>(`/api/v1/campaigns/${campaignId}/nominations/stats`),
    enabled: !!campaignId,
  });
}

export function useNominationSuggestions(campaignId: string, nominationId: string | null) {
  return useQuery({
    queryKey: ['campaigns', campaignId, 'nominations', nominationId, 'suggestions'],
    queryFn: () =>
      apiClient.get<HcpSuggestion[]>(
        `/api/v1/campaigns/${campaignId}/nominations/${nominationId}/suggestions`
      ),
    enabled: !!campaignId && !!nominationId,
  });
}

export function useMatchNomination() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      campaignId,
      nominationId,
      hcpId,
      addAlias,
    }: {
      campaignId: string;
      nominationId: string;
      hcpId: string;
      addAlias: boolean;
    }) =>
      apiClient.post(`/api/v1/campaigns/${campaignId}/nominations/${nominationId}/match`, {
        hcpId,
        addAlias,
      }),
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'nominations'] });
    },
  });
}

export function useCreateHcpFromNomination() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      campaignId,
      nominationId,
      hcpData,
    }: {
      campaignId: string;
      nominationId: string;
      hcpData: {
        npi: string;
        firstName: string;
        lastName: string;
        email?: string | null;
        specialty?: string | null;
        city?: string | null;
        state?: string | null;
      };
    }) =>
      apiClient.post(
        `/api/v1/campaigns/${campaignId}/nominations/${nominationId}/create-hcp`,
        hcpData
      ),
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'nominations'] });
      queryClient.invalidateQueries({ queryKey: ['hcps'] });
    },
  });
}

export function useExcludeNomination() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      campaignId,
      nominationId,
    }: {
      campaignId: string;
      nominationId: string;
    }) =>
      apiClient.post(`/api/v1/campaigns/${campaignId}/nominations/${nominationId}/exclude`, {}),
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'nominations'] });
    },
  });
}

export function useBulkAutoMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (campaignId: string) =>
      apiClient.post<BulkMatchResult>(`/api/v1/campaigns/${campaignId}/nominations/bulk-match`, {}),
    onSuccess: (_, campaignId) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'nominations'] });
    },
  });
}
