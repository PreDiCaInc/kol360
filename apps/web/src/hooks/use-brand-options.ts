import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { BrandOptionInput } from '@kol360/shared';

/**
 * v1.17.79 — Brand-Affinity Grid (Phase 1 UI) hooks.
 *
 * Spec: docs/findings/brand-affinity-grid-nomination-plan-2026-07-08.md
 */

export interface BrandOption {
  id: string;
  campaignId: string;
  brandName: string;
  displayOrder: number;
  createdAt: string;
}

export interface BrandOptionsResponse {
  brandOptions: BrandOption[];
  brandsFrozenAt: string | null;
}

export function useBrandOptions(campaignId: string) {
  return useQuery({
    queryKey: ['campaigns', campaignId, 'brand-options'],
    queryFn: () =>
      apiClient.get<BrandOptionsResponse>(
        `/api/v1/campaigns/${campaignId}/brand-options`
      ),
    enabled: !!campaignId,
  });
}

/**
 * Full-replacement upsert. Server normalizes displayOrder to 0..N-1 in
 * payload order. Returns 409 { brandsFrozenAt } once the campaign has
 * received its first survey response — caller should surface a clear
 * "contact support to change" message on that path.
 */
export function useUpsertBrandOptions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      campaignId,
      brands,
    }: {
      campaignId: string;
      brands: BrandOptionInput[];
    }) =>
      apiClient.put<{ brandOptions: BrandOption[] }>(
        `/api/v1/campaigns/${campaignId}/brand-options`,
        { brands }
      ),
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({
        queryKey: ['campaigns', campaignId, 'brand-options'],
      });
      // Nomination-question toggles gate on brand-count, so refresh
      // survey-preview too.
      queryClient.invalidateQueries({
        queryKey: ['campaigns', campaignId, 'survey-preview'],
      });
    },
  });
}

/**
 * PATCH per-question useBrandGrid on a specific SurveyQuestion. Idempotent;
 * server no-ops on same-value writes but the audit log still fires (that's
 * a minor cosmetic issue and doesn't hurt correctness — clients should
 * short-circuit at the UI layer to avoid extra writes).
 */
export function useUpdateSurveyQuestionBrandGrid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      campaignId,
      surveyQuestionId,
      useBrandGrid,
    }: {
      campaignId: string;
      surveyQuestionId: string;
      useBrandGrid: boolean;
    }) =>
      apiClient.patch<{ id: string; useBrandGrid: boolean }>(
        `/api/v1/campaigns/${campaignId}/survey-questions/${surveyQuestionId}`,
        { useBrandGrid }
      ),
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({
        queryKey: ['campaigns', campaignId, 'survey-preview'],
      });
    },
  });
}
