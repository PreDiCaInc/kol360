import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { CreateHcpInput, UpdateHcpInput } from '@kol360/shared';

interface HcpAlias {
  id: string;
  aliasName: string;
  createdAt: string;
}

export interface Specialty {
  id: string;
  name: string;
  code: string;
  category: string | null;
  isActive: boolean;
  _count?: { hcps: number };
}

interface HcpSpecialty {
  id: string;
  isPrimary: boolean;
  specialty: Specialty;
}

// Phase 3 PR B: compositeScore + scoreSurvey removed from this shape — they
// were dropped from the HcpDiseaseAreaScore DB columns (vestigial, replaced
// by HcpAnalysisScore per-(client, DA)). The 8 objective columns remain.
interface HcpDiseaseAreaScore {
  id: string;
  scorePublications?: number | null;
  scoreClinicalTrials?: number | null;
  scoreTradePubs?: number | null;
  scoreOrgLeadership?: number | null;
  scoreOrgAwards?: number | null;
  scoreConference?: number | null;
  scoreSocialMedia?: number | null;
  scoreMediaPodcasts?: number | null;
  diseaseArea: {
    id: string;
    name: string;
    code: string | null;
  };
}

interface Hcp {
  id: string;
  beId: string;
  npi: string | null;
  isSurveyTaker: boolean;
  isNominated: boolean;
  firstName: string;
  lastName: string;
  email: string | null;
  specialty: string | null;  // Legacy field
  subSpecialty: string | null;
  city: string | null;
  state: string | null;
  yearsInPractice: number | null;
  createdAt: string;
  updatedAt: string;
  aliases: HcpAlias[];
  specialties?: HcpSpecialty[];  // New multi-specialty relation
  // Multi-select sub-specialty (unified with DiseaseArea — see 20260519 migration).
  diseaseAreas?: { id: string; isPrimary: boolean; diseaseArea: { id: string; name: string; code: string } }[];
  diseaseAreaScores?: HcpDiseaseAreaScore[];  // For scores page
  optOuts?: OptOut[];
  _count?: {
    campaignHcps: number;
    nominationsReceived: number;
  };
}

interface HcpDetailDiseaseAreaScore extends HcpDiseaseAreaScore {
  awareness: number;
  adoption: number;
  sentiment: number;
  finalScore: number;
}

interface OptOut {
  id: string;
  scope: 'CAMPAIGN' | 'GLOBAL';
  campaignId: string | null;
  optedOutAt: string;
  optedOutVia?: string;
  reason: string | null;
  campaign?: { id: string; name: string } | null;
}

interface HcpDetail extends Omit<Hcp, 'diseaseAreaScores'> {
  diseaseAreaScores: HcpDetailDiseaseAreaScore[];
  campaignScores: {
    id: string;
    totalScore: number;
    campaign: {
      id: string;
      name: string;
      diseaseArea: { name: string };
    };
  }[];
  campaignHcps: {
    campaign: { id: string; name: string; status: string };
  }[];
  optOuts?: OptOut[];
}

interface HcpsListResponse {
  items: Hcp[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface HcpsQuery {
  query?: string;
  specialty?: string;
  state?: string;
  diseaseAreaIds?: string[];
  optOutStatus?: 'any' | 'global' | 'campaign' | 'none';
  page?: number;
  limit?: number;
}

interface ImportResult {
  total: number;
  created: number;
  updated: number;
  errors: { row: number; error: string }[];
}

interface AliasImportResult {
  total: number;
  created: number;
  skipped: number;
  errors: { row: number; error: string }[];
}

interface FiltersResponse {
  specialties: Specialty[];
  states: string[];
}

export function useHcps(query: HcpsQuery = {}) {
  const { page = 1, limit = 50, diseaseAreaIds, ...filters } = query;

  // Serialize multi-value diseaseAreaIds as a comma-delimited string so the
  // apiClient (which expects scalar query values) can forward it cleanly.
  const daParam = diseaseAreaIds && diseaseAreaIds.length > 0
    ? diseaseAreaIds.join(',')
    : undefined;

  return useQuery({
    queryKey: ['hcps', { page, limit, diseaseAreaIds, ...filters }],
    queryFn: () =>
      apiClient.get<HcpsListResponse>('/api/v1/hcps', {
        page,
        limit,
        ...filters,
        diseaseAreaIds: daParam,
      }),
  });
}

export function useHcp(id: string) {
  return useQuery({
    queryKey: ['hcps', id],
    queryFn: () => apiClient.get<HcpDetail>(`/api/v1/hcps/${id}`),
    enabled: !!id,
  });
}

export function useHcpFilters() {
  return useQuery({
    queryKey: ['hcps', 'filters'],
    queryFn: () => apiClient.get<FiltersResponse>('/api/v1/hcps/filters'),
  });
}

export function useCreateHcp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateHcpInput) =>
      apiClient.post<Hcp>('/api/v1/hcps', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hcps'] });
    },
  });
}

export function useUpdateHcp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateHcpInput }) =>
      apiClient.put<Hcp>(`/api/v1/hcps/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['hcps'] });
      queryClient.invalidateQueries({ queryKey: ['hcps', variables.id] });
    },
  });
}

export function useImportHcps() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/hcps/import`,
        {
          method: 'POST',
          body: formData,
          headers: {
            Authorization: `Bearer ${await getToken()}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Import failed');
      }

      return response.json() as Promise<ImportResult>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hcps'] });
    },
  });
}

export function useAddHcpAlias() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ hcpId, aliasName }: { hcpId: string; aliasName: string }) =>
      apiClient.post<HcpAlias>(`/api/v1/hcps/${hcpId}/aliases`, { aliasName }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['hcps', variables.hcpId] });
    },
  });
}

export function useRemoveHcpAlias() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ hcpId, aliasId }: { hcpId: string; aliasId: string }) =>
      apiClient.delete(`/api/v1/hcps/${hcpId}/aliases/${aliasId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['hcps', variables.hcpId] });
    },
  });
}

export function useImportHcpAliases() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/hcps/aliases/import`,
        {
          method: 'POST',
          body: formData,
          headers: {
            Authorization: `Bearer ${await getToken()}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Import failed');
      }

      return response.json() as Promise<AliasImportResult>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hcps'] });
    },
  });
}

// Disease area hooks
export interface DiseaseArea {
  id: string;
  name: string;
  code: string | null;
  therapeuticArea: string | null;
  isActive: boolean;
}

export function useDiseaseAreas() {
  return useQuery({
    queryKey: ['disease-areas'],
    queryFn: () => apiClient.get<{ items: DiseaseArea[] }>('/api/v1/disease-areas'),
    select: (data) => data.items,
  });
}

// Specialty management hooks
export function useSpecialties() {
  return useQuery({
    queryKey: ['specialties'],
    queryFn: () => apiClient.get<Specialty[]>('/api/v1/specialties'),
  });
}

export function useSetHcpSpecialties() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      hcpId,
      specialtyIds,
      primarySpecialtyId,
    }: {
      hcpId: string;
      specialtyIds: string[];
      primarySpecialtyId?: string;
    }) =>
      apiClient.put<HcpSpecialty[]>(`/api/v1/hcps/${hcpId}/specialties`, {
        specialtyIds,
        primarySpecialtyId,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['hcps'] });
      queryClient.invalidateQueries({ queryKey: ['hcps', variables.hcpId] });
    },
  });
}

export function useAddHcpSpecialty() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      hcpId,
      specialtyId,
      isPrimary,
    }: {
      hcpId: string;
      specialtyId: string;
      isPrimary?: boolean;
    }) =>
      apiClient.post<HcpSpecialty>(`/api/v1/hcps/${hcpId}/specialties`, {
        specialtyId,
        isPrimary,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['hcps'] });
      queryClient.invalidateQueries({ queryKey: ['hcps', variables.hcpId] });
    },
  });
}

export function useRemoveHcpSpecialty() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ hcpId, specialtyId }: { hcpId: string; specialtyId: string }) =>
      apiClient.delete(`/api/v1/hcps/${hcpId}/specialties/${specialtyId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['hcps'] });
      queryClient.invalidateQueries({ queryKey: ['hcps', variables.hcpId] });
    },
  });
}

// useRecalculateDiseaseAreaComposites removed in Phase 3 PR A.
//
// The /api/v1/hcps/recalculate-composites endpoint used hardcoded weights
// (10/15/10/10/10/10/5/5/25) ignoring every client config — the exact bug
// KOL Analysis was built to fix (motivation #2 in the original plan). The
// endpoint + service method + this hook are all gone. For per-(client, DA)
// composite recompute with per-analysis weights, use the Recalculate button
// on /admin/kol-analysis/<id>.

// Helper to get auth token
let tokenFn: (() => Promise<string | null>) | null = null;

export function setHcpTokenFn(fn: () => Promise<string | null>) {
  tokenFn = fn;
}

async function getToken(): Promise<string> {
  if (tokenFn) {
    const token = await tokenFn();
    if (token) return token;
  }
  throw new Error('No auth token available');
}

// v1.17.43 — influencer-type classification import (preview + apply).
// Mirrors useImportHcps's auth pattern (await getToken() against the
// live Cognito session, not a hand-rolled localStorage probe). The
// hand-rolled approach in InfluencerTypeImportDialog v1.17.42 read
// from localStorage 'id_token' / 'access_token' keys the app doesn't
// actually use, so the Authorization header was always dropped and
// the backend rejected with 'Missing or invalid authorization header'.

export interface InfluencerTypeImportResult {
  totalRows: number;
  matched: number;
  unmatchedNpi: number;
  unmatchedDiseaseArea: number;
  invalidType: number;
  countsByType: Record<string, number>;
  errorRows: Array<{ row: number; npi: string; rawType: string; reason: string }>;
}

async function postInfluencerTypeFile(
  endpoint: 'preview' | 'import',
  args: { file: File; diseaseAreaId: string },
): Promise<InfluencerTypeImportResult> {
  const formData = new FormData();
  formData.append('file', args.file);
  formData.append('diseaseAreaId', args.diseaseAreaId);
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/v1/hcps/influencer-types/${endpoint}`,
    {
      method: 'POST',
      body: formData,
      headers: { Authorization: `Bearer ${await getToken()}` },
    },
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error((data as { message?: string }).message || `Import ${endpoint} failed`);
  }
  return data as InfluencerTypeImportResult;
}

export function useInfluencerTypePreview() {
  return useMutation({
    mutationFn: (args: { file: File; diseaseAreaId: string }) =>
      postInfluencerTypeFile('preview', args),
  });
}

export function useInfluencerTypeImport() {
  return useMutation({
    mutationFn: (args: { file: File; diseaseAreaId: string }) =>
      postInfluencerTypeFile('import', args),
  });
}
