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

interface Hcp {
  id: string;
  npi: string;
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
  diseaseAreaScores?: {
    compositeScore: number | null;
    diseaseArea: { id: string; name: string; code: string };
  }[];
  _count?: {
    campaignHcps: number;
    nominationsReceived: number;
  };
}

interface HcpDetail extends Omit<Hcp, 'diseaseAreaScores'> {
  diseaseAreaScores: {
    id: string;
    awareness: number;
    adoption: number;
    sentiment: number;
    finalScore: number;
    compositeScore: number | null;
    diseaseArea: { id: string; name: string; code: string };
  }[];
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
}

interface DiseaseArea {
  id: string;
  name: string;
  code: string;
}

interface HcpsListResponse {
  items: Hcp[];
  diseaseAreas: DiseaseArea[];
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
  const { page = 1, limit = 50, ...filters } = query;

  return useQuery({
    queryKey: ['hcps', { page, limit, ...filters }],
    queryFn: () => apiClient.get<HcpsListResponse>('/api/v1/hcps', { page, limit, ...filters }),
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
