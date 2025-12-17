'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

// Type definitions for lite client data
interface DiseaseArea {
  id: string;
  name: string;
  code: string;
  therapeuticArea: string;
  grantedAt: string;
  expiresAt: string | null;
}

interface HcpScores {
  publications: number | null;
  clinicalTrials: number | null;
  tradePubs: number | null;
  orgLeadership: number | null;
  orgAwareness: number | null;
  conference: number | null;
  socialMedia: number | null;
  mediaPodcasts: number | null;
  survey: number | null;
  composite: number | null;
}

interface Hcp {
  id: string;
  npi: string;
  firstName: string;
  lastName: string;
  specialty: string | null;
  subSpecialty: string | null;
  city: string | null;
  state: string | null;
  yearsInPractice: number | null;
}

interface HcpWithScores {
  hcp: Hcp;
  diseaseArea: { id: string; name: string; code: string };
  scores: HcpScores;
  nominationCount: number;
  lastCalculatedAt: string | null;
}

interface HcpScoresResponse {
  data: HcpWithScores[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface HcpScoresFilters {
  search?: string;
  specialty?: string;
  state?: string;
  minCompositeScore?: number;
  maxCompositeScore?: number;
  sortBy?: 'compositeScore' | 'lastName' | 'specialty' | 'state';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

interface DiseaseAreaStats {
  totalHcps: number;
  averageCompositeScore: number;
  segmentAverages: {
    publications: number;
    clinicalTrials: number;
    tradePubs: number;
    orgLeadership: number;
    orgAwareness: number;
    conference: number;
    socialMedia: number;
    mediaPodcasts: number;
    survey: number;
  };
  scoreDistribution: Array<{ min: number; max: number; count: number }>;
}

interface TopKol {
  rank: number;
  hcp: {
    id: string;
    npi: string;
    firstName: string;
    lastName: string;
    specialty: string | null;
    state: string | null;
  };
  compositeScore: number | null;
  nominationCount: number;
}

// Admin types
interface LiteClientWithAccess {
  id: string;
  name: string;
  type: 'LITE';
  isActive: boolean;
  liteClientDiseaseAreas: Array<{
    id: string;
    diseaseAreaId: string;
    isActive: boolean;
    expiresAt: string | null;
    grantedAt: string;
    diseaseArea: {
      id: string;
      name: string;
      code: string;
    };
  }>;
  _count: {
    users: number;
  };
}

// ==========================================
// LITE CLIENT HOOKS (for lite client users)
// ==========================================

/**
 * Get assigned disease areas for current lite client
 */
export function useAssignedDiseaseAreas() {
  return useQuery({
    queryKey: ['lite-disease-areas'],
    queryFn: () => apiClient.get<DiseaseArea[]>('/api/v1/lite/disease-areas'),
  });
}

/**
 * Get HCP scores for a specific disease area
 */
export function useHcpScores(diseaseAreaId: string, filters: HcpScoresFilters = {}) {
  return useQuery({
    queryKey: ['lite-hcp-scores', diseaseAreaId, filters],
    queryFn: () =>
      apiClient.get<HcpScoresResponse>(`/api/v1/lite/disease-areas/${diseaseAreaId}/scores`, {
        ...filters,
      }),
    enabled: !!diseaseAreaId,
  });
}

/**
 * Get disease area statistics
 */
export function useDiseaseAreaStats(diseaseAreaId: string) {
  return useQuery({
    queryKey: ['lite-disease-area-stats', diseaseAreaId],
    queryFn: () =>
      apiClient.get<DiseaseAreaStats>(`/api/v1/lite/disease-areas/${diseaseAreaId}/stats`),
    enabled: !!diseaseAreaId,
  });
}

/**
 * Get top KOLs for a disease area
 */
export function useLiteTopKols(diseaseAreaId: string, limit = 10) {
  return useQuery({
    queryKey: ['lite-top-kols', diseaseAreaId, limit],
    queryFn: () =>
      apiClient.get<TopKol[]>(`/api/v1/lite/disease-areas/${diseaseAreaId}/top-kols`, { limit }),
    enabled: !!diseaseAreaId,
  });
}

/**
 * Export HCP scores (returns a download URL or blob)
 */
export function useExportHcpScores(diseaseAreaId: string) {
  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/v1/lite/disease-areas/${diseaseAreaId}/export`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });
      if (!response.ok) {
        throw new Error('Export failed');
      }
      const blob = await response.blob();
      return blob;
    },
  });
}

// ==========================================
// ADMIN HOOKS (for platform admins)
// ==========================================

/**
 * Get all lite clients with their disease area assignments
 */
export function useLiteClients() {
  return useQuery({
    queryKey: ['admin-lite-clients'],
    queryFn: () => apiClient.get<LiteClientWithAccess[]>('/api/v1/admin/lite-clients'),
  });
}

/**
 * Grant disease area access to a lite client
 */
export function useGrantDiseaseAreaAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      clientId,
      diseaseAreaId,
      expiresAt,
    }: {
      clientId: string;
      diseaseAreaId: string;
      expiresAt?: string;
    }) =>
      apiClient.post(`/api/v1/admin/lite-clients/${clientId}/access`, {
        diseaseAreaId,
        expiresAt,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-lite-clients'] });
    },
  });
}

/**
 * Revoke disease area access from a lite client
 */
export function useRevokeDiseaseAreaAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      clientId,
      diseaseAreaId,
    }: {
      clientId: string;
      diseaseAreaId: string;
    }) => apiClient.delete(`/api/v1/admin/lite-clients/${clientId}/access/${diseaseAreaId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-lite-clients'] });
    },
  });
}
