import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

interface SettingsResponse {
  email: {
    sendExternalEmail: boolean;
    emailMockMode: boolean;
    sesFromEmail: string;
    sesFromName: string;
  };
  security: {
    healthCheckToken: string;
  };
  system: {
    appUrl: string;
    environment: string;
  };
}

interface UpdateSettingsInput {
  healthCheckToken?: string;
  sendExternalEmail?: boolean;
  emailMockMode?: boolean;
  sesFromEmail?: string;
  sesFromName?: string;
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.get<SettingsResponse>('/api/v1/settings'),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateSettingsInput) =>
      apiClient.put<{ message: string; note: string }>('/api/v1/settings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}
