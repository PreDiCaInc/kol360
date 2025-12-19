import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import {
  useHcps,
  useHcp,
  useHcpFilters,
  useCreateHcp,
  useUpdateHcp,
  useAddHcpAlias,
  useRemoveHcpAlias,
} from '../use-hcps';

// Mock the API client
vi.mock('@/lib/api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { apiClient } from '@/lib/api';

const mockHcp = {
  id: 'hcp-1',
  npi: '1234567890',
  firstName: 'John',
  lastName: 'Smith',
  email: 'john.smith@hospital.com',
  specialty: 'Cardiology',
  subSpecialty: 'Interventional',
  city: 'New York',
  state: 'NY',
  yearsInPractice: 15,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  aliases: [
    { id: 'alias-1', aliasName: 'J. Smith', createdAt: '2024-01-01T00:00:00Z' },
  ],
  _count: { campaignHcps: 3, nominationsReceived: 25 },
};

const createTestWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useHcps hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useHcps', () => {
    it('should fetch HCPs list with default pagination', async () => {
      const mockResponse = {
        items: [mockHcp],
        pagination: { page: 1, limit: 50, total: 1, pages: 1 },
      };

      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useHcps(), {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.items).toHaveLength(1);
      expect(result.current.data?.items[0].npi).toBe('1234567890');
    });

    it('should pass query parameters correctly', async () => {
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        items: [],
        pagination: { page: 1, limit: 50, total: 0, pages: 0 },
      });

      renderHook(
        () =>
          useHcps({
            query: 'Smith',
            specialty: 'Cardiology',
            state: 'NY',
            page: 2,
            limit: 25,
          }),
        { wrapper: createTestWrapper() }
      );

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith('/api/v1/hcps', {
          page: 2,
          limit: 25,
          query: 'Smith',
          specialty: 'Cardiology',
          state: 'NY',
        });
      });
    });

    it('should handle empty search results', async () => {
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        items: [],
        pagination: { page: 1, limit: 50, total: 0, pages: 0 },
      });

      const { result } = renderHook(
        () => useHcps({ query: 'nonexistent' }),
        { wrapper: createTestWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.items).toHaveLength(0);
    });
  });

  describe('useHcp', () => {
    it('should fetch single HCP by id', async () => {
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockHcp);

      const { result } = renderHook(() => useHcp('hcp-1'), {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.firstName).toBe('John');
      expect(result.current.data?.lastName).toBe('Smith');
      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/hcps/hcp-1');
    });

    it('should not fetch when id is empty', () => {
      renderHook(() => useHcp(''), { wrapper: createTestWrapper() });

      expect(apiClient.get).not.toHaveBeenCalled();
    });
  });

  describe('useHcpFilters', () => {
    it('should fetch available filters', async () => {
      const mockFilters = {
        specialties: ['Cardiology', 'Oncology', 'Neurology'],
        states: ['NY', 'CA', 'TX'],
      };

      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockFilters);

      const { result } = renderHook(() => useHcpFilters(), {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.specialties).toContain('Cardiology');
      expect(result.current.data?.states).toContain('NY');
    });
  });

  describe('useCreateHcp', () => {
    it('should create a new HCP', async () => {
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockHcp);

      const { result } = renderHook(() => useCreateHcp(), {
        wrapper: createTestWrapper(),
      });

      result.current.mutate({
        npi: '1234567890',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@hospital.com',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/hcps', {
        npi: '1234567890',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@hospital.com',
      });
    });
  });

  describe('useUpdateHcp', () => {
    it('should update an HCP', async () => {
      (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockHcp,
        specialty: 'Oncology',
      });

      const { result } = renderHook(() => useUpdateHcp(), {
        wrapper: createTestWrapper(),
      });

      result.current.mutate({
        id: 'hcp-1',
        data: { specialty: 'Oncology' },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiClient.put).toHaveBeenCalledWith('/api/v1/hcps/hcp-1', {
        specialty: 'Oncology',
      });
    });
  });

  describe('useAddHcpAlias', () => {
    it('should add an alias to an HCP', async () => {
      const newAlias = {
        id: 'alias-2',
        aliasName: 'Johnny Smith',
        createdAt: '2024-06-15T00:00:00Z',
      };

      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue(newAlias);

      const { result } = renderHook(() => useAddHcpAlias(), {
        wrapper: createTestWrapper(),
      });

      result.current.mutate({
        hcpId: 'hcp-1',
        aliasName: 'Johnny Smith',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/hcps/hcp-1/aliases', {
        aliasName: 'Johnny Smith',
      });
    });
  });

  describe('useRemoveHcpAlias', () => {
    it('should remove an alias from an HCP', async () => {
      (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const { result } = renderHook(() => useRemoveHcpAlias(), {
        wrapper: createTestWrapper(),
      });

      result.current.mutate({
        hcpId: 'hcp-1',
        aliasId: 'alias-1',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiClient.delete).toHaveBeenCalledWith(
        '/api/v1/hcps/hcp-1/aliases/alias-1'
      );
    });
  });
});
