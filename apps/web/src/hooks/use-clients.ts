import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { CreateClientInput, UpdateClientInput } from '@kol360/shared';

interface Client {
  id: string;
  name: string;
  type: 'FULL' | 'LITE';
  isLite: boolean;
  logoUrl: string | null;
  primaryColor: string;
  isActive: boolean;
  /// Per-client allowed email-domain allowlist (v1.17.9). Empty = no
  /// restriction (opt-in). bio-exec.com is always allowed regardless,
  /// hardcoded in apps/api/src/services/user.service.ts.
  emailDomains: string[];
  createdAt: string;
  updatedAt: string;
  _count?: {
    users: number;
    campaigns: number;
  };
}

export function useClients(includeInactive = false) {
  return useQuery({
    queryKey: ['clients', { includeInactive }],
    queryFn: () => apiClient.get<{ items: Client[] }>('/api/v1/clients', { includeInactive }, { skipImpersonation: true }),
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: ['clients', id],
    queryFn: () => apiClient.get<Client>(`/api/v1/clients/${id}`, undefined, { skipImpersonation: true }),
    enabled: !!id,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateClientInput) =>
      apiClient.post<Client>('/api/v1/clients', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateClientInput }) =>
      apiClient.put<Client>(`/api/v1/clients/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['clients', variables.id] });
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/v1/clients/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}
