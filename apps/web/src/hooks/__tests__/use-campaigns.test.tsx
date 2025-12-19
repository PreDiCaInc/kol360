import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import {
  useCampaigns,
  useCampaign,
  useCreateCampaign,
  useUpdateCampaign,
  useDeleteCampaign,
  useActivateCampaign,
  useCloseCampaign,
  useReopenCampaign,
  usePublishCampaign,
} from '../use-campaigns';

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

const mockCampaign = {
  id: 'campaign-1',
  clientId: 'client-1',
  client: { id: 'client-1', name: 'Test Client' },
  diseaseAreaId: 'da-1',
  diseaseArea: { id: 'da-1', name: 'Cardiology' },
  name: 'Test Campaign',
  description: 'A test campaign',
  status: 'ACTIVE' as const,
  surveyTemplateId: null,
  surveyTemplate: null,
  honorariumAmount: 100,
  surveyOpenDate: '2024-01-01T00:00:00Z',
  surveyCloseDate: '2024-12-31T00:00:00Z',
  publishedAt: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  _count: { campaignHcps: 10, surveyResponses: 5 },
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

describe('useCampaigns hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useCampaigns', () => {
    it('should fetch campaigns list', async () => {
      const mockResponse = {
        items: [mockCampaign],
        pagination: { page: 1, limit: 20, total: 1, pages: 1 },
      };

      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useCampaigns(), {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.items).toHaveLength(1);
      expect(result.current.data?.items[0].name).toBe('Test Campaign');
    });

    it('should pass filter parameters', async () => {
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        items: [],
        pagination: { page: 1, limit: 20, total: 0, pages: 0 },
      });

      renderHook(
        () =>
          useCampaigns({
            clientId: 'client-1',
            status: 'ACTIVE',
            page: 2,
            limit: 50,
          }),
        { wrapper: createTestWrapper() }
      );

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith(
          expect.stringContaining('clientId=client-1')
        );
      });
    });

    it('should handle empty response', async () => {
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        items: [],
        pagination: { page: 1, limit: 20, total: 0, pages: 0 },
      });

      const { result } = renderHook(() => useCampaigns(), {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.items).toHaveLength(0);
    });
  });

  describe('useCampaign', () => {
    it('should fetch single campaign by id', async () => {
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockCampaign);

      const { result } = renderHook(() => useCampaign('campaign-1'), {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.name).toBe('Test Campaign');
      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/campaigns/campaign-1');
    });

    it('should not fetch when id is empty', () => {
      renderHook(() => useCampaign(''), { wrapper: createTestWrapper() });

      expect(apiClient.get).not.toHaveBeenCalled();
    });
  });

  describe('useCreateCampaign', () => {
    it('should create a new campaign', async () => {
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockCampaign);

      const { result } = renderHook(() => useCreateCampaign(), {
        wrapper: createTestWrapper(),
      });

      result.current.mutate({
        clientId: 'client-1',
        diseaseAreaId: 'da-1',
        name: 'New Campaign',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/campaigns', {
        clientId: 'client-1',
        diseaseAreaId: 'da-1',
        name: 'New Campaign',
      });
    });
  });

  describe('useUpdateCampaign', () => {
    it('should update a campaign', async () => {
      (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockCampaign,
        name: 'Updated Campaign',
      });

      const { result } = renderHook(() => useUpdateCampaign(), {
        wrapper: createTestWrapper(),
      });

      result.current.mutate({
        id: 'campaign-1',
        data: { name: 'Updated Campaign' },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiClient.put).toHaveBeenCalledWith('/api/v1/campaigns/campaign-1', {
        name: 'Updated Campaign',
      });
    });
  });

  describe('useDeleteCampaign', () => {
    it('should delete a campaign', async () => {
      (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const { result } = renderHook(() => useDeleteCampaign(), {
        wrapper: createTestWrapper(),
      });

      result.current.mutate('campaign-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/campaigns/campaign-1');
    });
  });

  describe('useActivateCampaign', () => {
    it('should activate a campaign', async () => {
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockCampaign,
        status: 'ACTIVE',
      });

      const { result } = renderHook(() => useActivateCampaign(), {
        wrapper: createTestWrapper(),
      });

      result.current.mutate('campaign-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/campaigns/campaign-1/activate',
        {}
      );
    });
  });

  describe('useCloseCampaign', () => {
    it('should close a campaign', async () => {
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockCampaign,
        status: 'CLOSED',
      });

      const { result } = renderHook(() => useCloseCampaign(), {
        wrapper: createTestWrapper(),
      });

      result.current.mutate('campaign-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/campaigns/campaign-1/close',
        {}
      );
    });
  });

  describe('useReopenCampaign', () => {
    it('should reopen a campaign', async () => {
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockCampaign,
        status: 'ACTIVE',
      });

      const { result } = renderHook(() => useReopenCampaign(), {
        wrapper: createTestWrapper(),
      });

      result.current.mutate('campaign-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/campaigns/campaign-1/reopen',
        {}
      );
    });
  });

  describe('usePublishCampaign', () => {
    it('should publish a campaign', async () => {
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockCampaign,
        status: 'PUBLISHED',
        publishedAt: '2024-06-15T00:00:00Z',
      });

      const { result } = renderHook(() => usePublishCampaign(), {
        wrapper: createTestWrapper(),
      });

      result.current.mutate('campaign-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/campaigns/campaign-1/publish',
        {}
      );
    });
  });
});
