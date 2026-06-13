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
    nominationType: string | null;
  };
}

interface Nomination {
  id: string;
  rawNameEntered: string;
  matchStatus: 'UNMATCHED' | 'MATCHED' | 'REVIEW_NEEDED' | 'NEW_HCP' | 'EXCLUDED';
  matchType: 'exact' | 'primary' | 'alias' | 'partial' | null;
  matchConfidence: number | null;
  matchedAt: string | null;
  matchedBy: string | null;
  matchedHcp: MatchedHcp | null;
  nominatorHcp: NominatorHcp;
  question: NominationQuestion;
  excludeReason: string | null;
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
  search?: string;
  searchMode?: 'contains' | 'exact';
  nominationType?: string;
  page?: number;
  limit?: number;
}

interface NominationStats {
  UNMATCHED?: number;
  MATCHED?: number;
  REVIEW_NEEDED?: number;
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
  matchType: 'exact' | 'primary' | 'alias' | 'partial';
  isNameMatch: boolean; // true if matched on actual name (not alias)
}

interface BulkMatchResult {
  matched: number;
  total: number;
  errors: string[];
}

export interface TopSuggestion {
  hcpId: string;
  firstName: string;
  lastName: string;
  npi: string | null;
  score: number;
  matchType: 'exact' | 'primary' | 'alias' | 'partial';
  isNameMatch: boolean;
}

export interface BulkAcceptResult {
  accepted: number;
  skipped: number;
  errors: { nominationId: string; error: string }[];
}

export function useNominations(campaignId: string, query: NominationsQuery = {}) {
  const { page = 1, limit = 50, status, search, searchMode, nominationType } = query;

  return useQuery({
    queryKey: ['campaigns', campaignId, 'nominations', { page, limit, status, search, searchMode, nominationType }],
    queryFn: () =>
      apiClient.get<NominationsListResponse>(`/api/v1/campaigns/${campaignId}/nominations`, {
        page,
        limit,
        status,
        search: search || undefined,
        searchMode: searchMode || undefined,
        nominationType: nominationType || undefined,
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

/**
 * v1.17.6: optional previewRawName query param drives the inline
 * "Match to existing" UI in the rename dialog. When provided, the
 * suggestions search uses that name instead of the saved
 * `nomination.rawNameEntered`. Caller is responsible for debouncing
 * the value to avoid a request per keystroke.
 */
export function useNominationSuggestions(
  campaignId: string,
  nominationId: string | null,
  previewRawName?: string
) {
  const qs = previewRawName
    ? `?previewRawName=${encodeURIComponent(previewRawName)}`
    : '';
  return useQuery({
    queryKey: ['campaigns', campaignId, 'nominations', nominationId, 'suggestions', previewRawName ?? null],
    queryFn: () =>
      apiClient.get<HcpSuggestion[]>(
        `/api/v1/campaigns/${campaignId}/nominations/${nominationId}/suggestions${qs}`
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
      matchType,
      matchConfidence,
    }: {
      campaignId: string;
      nominationId: string;
      hcpId: string;
      addAlias: boolean;
      matchType?: 'exact' | 'primary' | 'alias' | 'partial';
      matchConfidence?: number;
    }) =>
      apiClient.post(`/api/v1/campaigns/${campaignId}/nominations/${nominationId}/match`, {
        hcpId,
        addAlias,
        matchType,
        matchConfidence,
      }),
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'nominations'] });
    },
  });
}

// v1.17.34: re-point an already-matched nomination to a different HCP.
// Distinct from useMatchNomination so the audit row says
// 'nomination.rematched' on the server side.
export function useRematchNomination() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      campaignId,
      nominationId,
      newHcpId,
      addAlias,
      reason,
    }: {
      campaignId: string;
      nominationId: string;
      newHcpId: string;
      addAlias?: boolean;
      reason?: string;
    }) =>
      apiClient.post(`/api/v1/campaigns/${campaignId}/nominations/${nominationId}/rematch`, {
        newHcpId,
        addAlias: addAlias ?? false,
        ...(reason ? { reason } : {}),
      }),
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'nominations'] });
      queryClient.invalidateQueries({ queryKey: ['hcps'] });
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
        specialty?: 'Optometry' | 'Ophthalmology' | null;
        diseaseAreaIds?: string[];
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
      reason,
    }: {
      campaignId: string;
      nominationId: string;
      reason?: string;
    }) =>
      apiClient.post(`/api/v1/campaigns/${campaignId}/nominations/${nominationId}/exclude`, {
        reason,
      }),
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'nominations'] });
    },
  });
}

export function useBulkExcludeNominations() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      campaignId,
      nominationIds,
      reason,
    }: {
      campaignId: string;
      nominationIds: string[];
      reason?: string;
    }) =>
      apiClient.post<{ count: number }>(
        `/api/v1/campaigns/${campaignId}/nominations/bulk-exclude`,
        { nominationIds, reason }
      ),
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'nominations'] });
    },
  });
}

/**
 * Batch-fetch the top suggestion for a set of nomination ids on the visible
 * page. Returns a `{ [nominationId]: TopSuggestion | null }` map. Keyed on the
 * sorted id list so re-renders with the same page don't refetch.
 */
export function useNominationTopSuggestions(
  campaignId: string,
  nominationIds: string[]
) {
  const sortedKey = [...nominationIds].sort().join(',');
  return useQuery({
    queryKey: ['campaigns', campaignId, 'nominations', 'top-suggestions', sortedKey],
    queryFn: () =>
      apiClient.post<Record<string, TopSuggestion | null>>(
        `/api/v1/campaigns/${campaignId}/nominations/top-suggestions`,
        { nominationIds }
      ),
    enabled: !!campaignId && nominationIds.length > 0,
    // Top suggestions only change when HCPs or aliases change; cache for 30s
    // so paging back-and-forth doesn't re-hit the heavy suggestion compute.
    staleTime: 30_000,
  });
}

export function useBulkAcceptNominations() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      campaignId,
      nominationIds,
    }: {
      campaignId: string;
      nominationIds: string[];
    }) =>
      apiClient.post<BulkAcceptResult>(
        `/api/v1/campaigns/${campaignId}/nominations/bulk-accept`,
        { nominationIds }
      ),
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

export function useUpdateNominationRawName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      campaignId,
      nominationId,
      rawNameEntered,
    }: {
      campaignId: string;
      nominationId: string;
      rawNameEntered: string;
    }) =>
      apiClient.patch<Nomination>(
        `/api/v1/campaigns/${campaignId}/nominations/${nominationId}`,
        { rawNameEntered }
      ),
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'nominations'] });
    },
  });
}
