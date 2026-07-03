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
  /// Per-client allowed email-domain allowlist. Required since v1.17.17
  /// (min(1) at the Zod layer). Pre-v1.17.17 clients may still have
  /// empty arrays — those are grandfathered at the userService runtime
  /// check, but any edit through the form will force the admin to set
  /// at least one domain. bio-exec.com is always allowed regardless,
  /// hardcoded in apps/api/src/services/user.service.ts.
  emailDomains: string[];
  /// v1.17.68 — which country's HCPs this client's admin surfaces work on.
  /// Defaults 'US' for every existing client. Set 'CA' at client-create
  /// time to spin up a Canadian tenant (per pteam: use a separate Client
  /// row per country rather than mixing on one).
  defaultCountry?: 'US' | 'CA';
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

// v1.17.30 — GET /api/v1/clients/me. Returns the calling user's Client
// row, or null for PLATFORM_ADMIN (no tenant) / a deleted Client. The
// useCurrentClient() helper below combines this with the impersonation
// context to give the badge a single source of truth.
export function useClientMe(enabled = true) {
  return useQuery({
    queryKey: ['clients', 'me'],
    queryFn: () => apiClient.get<Client | null>('/api/v1/clients/me', undefined, { skipImpersonation: true }),
    enabled,
    staleTime: 5 * 60_000, // 5 min — client name/logo/color don't change often
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
