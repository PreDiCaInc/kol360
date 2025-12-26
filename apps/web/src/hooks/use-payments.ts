import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, api } from '@/lib/api';

interface Payment {
  id: string;
  hcpId: string;
  responseId: string;
  amount: string;
  currency: string;
  status: string;
  statusUpdatedAt: string | null;
  exportedAt: string | null;
  createdAt: string;
  hcp: {
    npi: string;
    firstName: string;
    lastName: string;
    email: string | null;
  };
  response: {
    completedAt: string | null;
  };
  statusHistory: Array<{
    id: string;
    oldStatus: string;
    newStatus: string;
    changedAt: string;
  }>;
}

interface PaymentListResponse {
  items: Payment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface PaymentStats {
  byStatus: Record<string, { count: number; amount: number }>;
  total: { count: number; amount: number };
}

export function usePayments(
  campaignId: string,
  params?: { status?: string; page?: number; limit?: number }
) {
  return useQuery<PaymentListResponse>({
    queryKey: ['payments', campaignId, params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params?.status) searchParams.set('status', params.status);
      if (params?.page) searchParams.set('page', params.page.toString());
      if (params?.limit) searchParams.set('limit', params.limit.toString());

      const url = `/api/v1/campaigns/${campaignId}/payments${searchParams.toString() ? `?${searchParams}` : ''}`;
      return apiClient.get<PaymentListResponse>(url);
    },
    enabled: !!campaignId,
  });
}

export function usePaymentStats(campaignId: string) {
  return useQuery<PaymentStats>({
    queryKey: ['payment-stats', campaignId],
    queryFn: async () => {
      return apiClient.get<PaymentStats>(`/api/v1/campaigns/${campaignId}/payments/stats`);
    },
    enabled: !!campaignId,
  });
}

export function useExportPayments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      // Use the api function with responseType: 'blob' for file downloads
      const blob = await api<Blob>(`/api/v1/campaigns/${campaignId}/export/payments`, {
        method: 'POST',
        responseType: 'blob',
      });

      // Download the file
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payments-${campaignId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      return { success: true };
    },
    onSuccess: (_, campaignId) => {
      queryClient.invalidateQueries({ queryKey: ['payments', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['payment-stats', campaignId] });
    },
  });
}

export function useReExportPayments() {
  return useMutation({
    mutationFn: async (campaignId: string) => {
      // Re-export without changing status - just download the file again
      const blob = await api<Blob>(`/api/v1/campaigns/${campaignId}/export/payments/reexport`, {
        method: 'POST',
        responseType: 'blob',
      });

      // Download the file
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payments-reexport-${campaignId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      return { success: true };
    },
  });
}

interface ImportResult {
  processed: number;
  updated: number;
  errors: Array<{ row: number; error: string }>;
}

export function useImportPaymentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ campaignId, file }: { campaignId: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);

      // Use api function with custom headers for multipart
      return api<ImportResult>(`/api/v1/campaigns/${campaignId}/payments/import-status`, {
        method: 'POST',
        body: formData as unknown as string, // FormData will be sent properly
        headers: {}, // Let browser set Content-Type for FormData
      });
    },
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ['payments', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['payment-stats', campaignId] });
    },
  });
}
