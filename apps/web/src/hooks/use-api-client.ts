import { apiClient } from '@/lib/api';

/**
 * Hook that returns the apiClient for making API calls.
 * This is a convenience wrapper that allows components to access
 * the API client without importing directly from @/lib/api.
 */
export function useApiClient() {
  return apiClient;
}
