import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { CreateUserInput, UpdateUserInput } from '@kol360/shared';

interface User {
  id: string;
  cognitoSub: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'PLATFORM_ADMIN' | 'CLIENT_ADMIN' | 'TEAM_MEMBER';
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'DISABLED';
  clientId: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  client?: {
    id: string;
    name: string;
  } | null;
}

interface UsersListResponse {
  items: User[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface UsersQuery {
  clientId?: string;
  role?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export function useUsers(query: UsersQuery = {}) {
  const { page = 1, limit = 20, ...filters } = query;

  return useQuery({
    queryKey: ['users', { page, limit, ...filters }],
    queryFn: () => apiClient.get<UsersListResponse>('/api/v1/users', { page, limit, ...filters }),
  });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: ['users', id],
    queryFn: () => apiClient.get<User>(`/api/v1/users/${id}`),
    enabled: !!id,
  });
}

export function useInviteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateUserInput) =>
      apiClient.post<User>('/api/v1/users/invite', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserInput }) =>
      apiClient.put<User>(`/api/v1/users/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['users', variables.id] });
    },
  });
}

export function useApproveUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<User>(`/api/v1/users/${id}/approve`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['users', id] });
    },
  });
}

export function useDisableUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<User>(`/api/v1/users/${id}/disable`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['users', id] });
    },
  });
}

export function useEnableUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<User>(`/api/v1/users/${id}/enable`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['users', id] });
    },
  });
}

// v1.17.60 — rotate the Cognito temp password + re-send the branded
// invite email. Only valid for PENDING_VERIFICATION users; the BE
// returns 400 INVALID_STATE for ACTIVE/DISABLED.
export function useResendInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<{ success: true }>(`/api/v1/users/${id}/resend-invite`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['users', id] });
    },
  });
}

// v1.17.67 — latest invite-delivery outcome per user, powers the
// "Last invite: Delivered / Sent / Bounced" chip on the users admin
// page. Returns null (`latestEvent: null`) for users who've never
// been sent an invite via the current send path — e.g. users
// created before v1.17.67 or via mock-mode. Refetch triggered by
// the resend-invite mutation via the users cache invalidation.
export interface LatestInviteEvent {
  id: string;
  messageType: 'user_invite' | 'user_invite_resent';
  status: string;
  statusReason: string | null;
  acceptedAt: string;
  deliveredAt: string | null;
  bouncedAt: string | null;
  complainedAt: string | null;
}

export function useLatestInviteEvent(userId: string | null) {
  return useQuery({
    queryKey: ['users', userId, 'latest-invite-event'],
    queryFn: () =>
      apiClient.get<{ latestEvent: LatestInviteEvent | null }>(
        `/api/v1/users/${userId}/latest-invite-event`,
      ),
    enabled: !!userId,
    staleTime: 30_000,
  });
}

// v1.17.60 — hard delete a user (Cognito + DB). BE blocks the caller
// from deleting their own account.
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete<void>(`/api/v1/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
