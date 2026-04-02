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
  InsightsFilterInput,
  LeaderRankingQueryInput,
  NominationType,
  DemographicsResponse,
  KolNominationMetadataResponse,
} from '@kol360/shared';

// Disease area card for the dashboard landing page
export interface DashboardDiseaseArea {
  id: string;
  name: string;
  therapeuticArea: string;
  code: string;
  campaignCount: number;
  kolCount: number;
}

/**
 * Get disease areas accessible to the current user, with campaign/KOL counts
 */
export function useDashboardDiseaseAreas() {
  return useQuery({
    queryKey: ['dashboard-disease-areas'],
    queryFn: () =>
      apiClient.get<{ items: DashboardDiseaseArea[] }>('/api/v1/insights/disease-areas'),
    staleTime: 60000,
  });
}

// Filter options response
interface FilterOptions {
  specialties: string[];
  states: string[];
  influencerTypes: string[];
}

/**
 * Get summary stats for a disease area
 */
export function useInsightsSummary(diseaseAreaId: string, clientId?: string) {
  const params = new URLSearchParams();
  if (clientId) params.append('clientId', clientId);
  const qs = params.toString();

  return useQuery({
    queryKey: ['insights-summary', diseaseAreaId, clientId],
    queryFn: () =>
      apiClient.get<InsightsSummary>(`/api/v1/insights/${diseaseAreaId}/summary${qs ? '?' + qs : ''}`),
    enabled: !!diseaseAreaId,
  });
}

/**
 * Get KOL Explorer data - paginated list of all KOLs with their scores
 */
export function useKolExplorer(
  diseaseAreaId: string,
  filters: Partial<InsightsFilterInput> = {}
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
  options: Partial<Omit<LeaderRankingQueryInput, 'nominationType'>> = {},
  clientId?: string
) {
  const params = new URLSearchParams();
  params.append('nominationType', nominationType);
  if (clientId) params.append('clientId', clientId);
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  });

  return useQuery({
    queryKey: ['leader-rankings', diseaseAreaId, nominationType, options, clientId],
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
export function useKolProfile(diseaseAreaId: string, hcpId: string | null, clientId?: string) {
  const params = new URLSearchParams();
  if (clientId) params.append('clientId', clientId);
  const qs = params.toString();

  return useQuery({
    queryKey: ['kol-profile', diseaseAreaId, hcpId, clientId],
    queryFn: () =>
      apiClient.get<KolProfileWithNominators>(
        `/api/v1/insights/${diseaseAreaId}/kol-profile/${hcpId}${qs ? '?' + qs : ''}`
      ),
    enabled: !!diseaseAreaId && !!hcpId,
    staleTime: 60000,
  });
}

/**
 * Get sociometric summary - master table with all nomination counts
 */
export function useSociometricSummary(
  diseaseAreaId: string,
  filters: Partial<InsightsFilterInput> = {},
  clientId?: string
) {
  const params = new URLSearchParams();
  if (clientId) params.append('clientId', clientId);
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  });

  return useQuery({
    queryKey: ['sociometric-summary', diseaseAreaId, filters, clientId],
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
 * Get demographics data (aggregated from survey response answers)
 */
export function useDemographics(diseaseAreaId: string, clientId?: string, filters?: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  if (clientId) params.append('clientId', clientId);
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params.append(key, String(value));
    });
  }
  const qs = params.toString();

  return useQuery({
    queryKey: ['insights', 'demographics', diseaseAreaId, clientId, filters],
    queryFn: () =>
      apiClient.get<DemographicsResponse>(
        `/api/v1/insights/${diseaseAreaId}/demographics${qs ? '?' + qs : ''}`
      ),
    enabled: !!diseaseAreaId,
    staleTime: 60_000,
  });
}

/**
 * Get KOL nomination metadata (nominator survey answers for a specific KOL)
 */
export function useKolNominationMetadata(diseaseAreaId: string, hcpId: string | null, clientId?: string) {
  const params = new URLSearchParams();
  if (clientId) params.append('clientId', clientId);
  const qs = params.toString();

  return useQuery({
    queryKey: ['insights', 'kol-nomination-metadata', diseaseAreaId, hcpId, clientId],
    queryFn: () =>
      apiClient.get<KolNominationMetadataResponse>(
        `/api/v1/insights/${diseaseAreaId}/kol-nomination-metadata/${hcpId}${qs ? '?' + qs : ''}`
      ),
    enabled: !!diseaseAreaId && !!hcpId,
    staleTime: 60_000,
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
