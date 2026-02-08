'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type {
  InsightsSummary,
  KolExplorerResponse,
  LeaderRankingsResponse,
  KolProfileWithNominators,
  SociometricSummaryResponse,
  RespondentAnalytics,
  InsightsFilter,
  LeaderRankingQuery,
  NominationType,
} from '@kol360/shared';

// Filter options response
interface FilterOptions {
  specialties: string[];
  states: string[];
  influencerTypes: string[];
}

/**
 * Get summary stats for a disease area
 */
export function useInsightsSummary(diseaseAreaId: string) {
  return useQuery({
    queryKey: ['insights-summary', diseaseAreaId],
    queryFn: () =>
      apiClient.get<InsightsSummary>(`/api/v1/insights/${diseaseAreaId}/summary`),
    enabled: !!diseaseAreaId,
  });
}

/**
 * Get KOL Explorer data - paginated list of all KOLs with their scores
 */
export function useKolExplorer(
  diseaseAreaId: string,
  filters: Partial<InsightsFilter> = {}
) {
  // Build query params from filters
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  });

  return useQuery({
    queryKey: ['kol-explorer', diseaseAreaId, filters],
    queryFn: () =>
      apiClient.get<KolExplorerResponse>(
        `/api/v1/insights/${diseaseAreaId}/kol-explorer?${params.toString()}`
      ),
    enabled: !!diseaseAreaId,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Get leader rankings by nomination type
 */
export function useLeaderRankings(
  diseaseAreaId: string,
  nominationType: NominationType,
  options: Partial<Omit<LeaderRankingQuery, 'nominationType'>> = {}
) {
  const params = new URLSearchParams();
  params.append('nominationType', nominationType);
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  });

  return useQuery({
    queryKey: ['leader-rankings', diseaseAreaId, nominationType, options],
    queryFn: () =>
      apiClient.get<LeaderRankingsResponse>(
        `/api/v1/insights/${diseaseAreaId}/leader-rankings?${params.toString()}`
      ),
    enabled: !!diseaseAreaId,
    staleTime: 30000,
  });
}

/**
 * Get individual KOL profile with all scores, nomination counts, and nominator details
 */
export function useKolProfile(diseaseAreaId: string, hcpId: string | null) {
  return useQuery({
    queryKey: ['kol-profile', diseaseAreaId, hcpId],
    queryFn: () =>
      apiClient.get<KolProfileWithNominators>(
        `/api/v1/insights/${diseaseAreaId}/kol-profile/${hcpId}`
      ),
    enabled: !!diseaseAreaId && !!hcpId,
    staleTime: 60000, // 1 minute
  });
}

/**
 * Get sociometric summary - master table with all nomination counts
 */
export function useSociometricSummary(
  diseaseAreaId: string,
  filters: Partial<InsightsFilter> = {}
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  });

  return useQuery({
    queryKey: ['sociometric-summary', diseaseAreaId, filters],
    queryFn: () =>
      apiClient.get<SociometricSummaryResponse>(
        `/api/v1/insights/${diseaseAreaId}/sociometric-summary?${params.toString()}`
      ),
    enabled: !!diseaseAreaId,
    staleTime: 30000,
  });
}

/**
 * Get respondent analytics - demographics, distributions, completion trends
 */
export function useRespondentAnalytics(diseaseAreaId: string) {
  return useQuery({
    queryKey: ['respondent-analytics', diseaseAreaId],
    queryFn: () =>
      apiClient.get<RespondentAnalytics>(
        `/api/v1/insights/${diseaseAreaId}/respondent-analytics`
      ),
    enabled: !!diseaseAreaId,
    staleTime: 60000, // 1 minute
  });
}

/**
 * Get filter options (specialties, states available in this disease area)
 */
export function useInsightsFilterOptions(diseaseAreaId: string) {
  return useQuery({
    queryKey: ['insights-filter-options', diseaseAreaId],
    queryFn: () =>
      apiClient.get<FilterOptions>(
        `/api/v1/insights/${diseaseAreaId}/filter-options`
      ),
    enabled: !!diseaseAreaId,
    staleTime: 300000, // 5 minutes - filter options don't change often
  });
}
