'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

// Type definitions for dashboard data
interface DashboardStats {
  totalSent: number;
  totalOpened: number;
  totalStarted: number;
  totalCompleted: number;
  responseRate: number;
  averageScore: number | null;
  medianScore: number | null;
  minScore: number | null;
  maxScore: number | null;
  totalHcps: number;
  hcpsBySpecialty: Array<{ specialty: string; count: number }>;
  hcpsByState: Array<{ state: string; count: number }>;
}

interface CompletionFunnel {
  sent: number;
  opened: number;
  started: number;
  completed: number;
}

interface ScoreDistribution {
  ranges: Array<{ min: number; max: number; count: number }>;
}

interface TopKol {
  id: string;
  npi: string;
  firstName: string;
  lastName: string;
  specialty: string | null;
  state: string | null;
  compositeScore: number | null;
  surveyScore: number | null;
  nominationCount: number;
}

interface SegmentScores {
  segments: Array<{ name: string; averageScore: number | null; weight: number }>;
}

interface CustomChartData {
  labels: string[];
  data: number[];
  total: number;
}

interface AddComponentInput {
  componentType: 'STANDARD' | 'CUSTOM';
  componentKey: string;
  configJson?: Record<string, unknown> | null;
  sectionTitle: string;
  displayOrder?: number;
  isVisible?: boolean;
}

interface UpdateComponentInput {
  configJson?: Record<string, unknown> | null;
  sectionTitle?: string;
  displayOrder?: number;
  isVisible?: boolean;
}

interface DashboardComponent {
  id: string;
  dashboardId: string;
  componentType: 'STANDARD' | 'CUSTOM';
  componentKey: string;
  configJson: Record<string, unknown> | null;
  sectionTitle: string;
  displayOrder: number;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Dashboard {
  id: string;
  clientId: string;
  campaignId: string;
  name: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  components: DashboardComponent[];
}

// Dashboard config hooks
export function useDashboard(campaignId: string) {
  return useQuery({
    queryKey: ['dashboard', campaignId],
    queryFn: () =>
      apiClient.get<Dashboard>(`/api/v1/campaigns/${campaignId}/dashboard`),
    enabled: !!campaignId,
  });
}

export function useUpdateDashboard(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dashboardId, data }: { dashboardId: string; data: { name?: string; isPublished?: boolean } }) =>
      apiClient.patch<Dashboard>(`/api/v1/dashboards/${dashboardId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', campaignId] });
    },
  });
}

export function usePublishDashboard(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dashboardId: string) =>
      apiClient.post<Dashboard>(`/api/v1/dashboards/${dashboardId}/publish`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', campaignId] });
    },
  });
}

export function useUnpublishDashboard(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dashboardId: string) =>
      apiClient.post<Dashboard>(`/api/v1/dashboards/${dashboardId}/unpublish`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', campaignId] });
    },
  });
}

// Component management hooks
export function useAddComponent(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dashboardId, data }: { dashboardId: string; data: AddComponentInput }) =>
      apiClient.post<DashboardComponent>(`/api/v1/dashboards/${dashboardId}/components`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', campaignId] });
    },
  });
}

export function useUpdateComponent(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ componentId, data }: { componentId: string; data: UpdateComponentInput }) =>
      apiClient.patch<DashboardComponent>(`/api/v1/components/${componentId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', campaignId] });
    },
  });
}

export function useRemoveComponent(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (componentId: string) =>
      apiClient.delete(`/api/v1/components/${componentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', campaignId] });
    },
  });
}

export function useToggleComponent(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (componentId: string) =>
      apiClient.post<DashboardComponent>(`/api/v1/components/${componentId}/toggle`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', campaignId] });
    },
  });
}

export function useReorderComponents(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dashboardId, componentIds }: { dashboardId: string; componentIds: string[] }) =>
      apiClient.post<Dashboard>(`/api/v1/dashboards/${dashboardId}/reorder`, { componentIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', campaignId] });
    },
  });
}

// Dashboard data hooks
export function useDashboardStats(campaignId: string) {
  return useQuery({
    queryKey: ['dashboard-stats', campaignId],
    queryFn: () =>
      apiClient.get<DashboardStats>(`/api/v1/campaigns/${campaignId}/dashboard/stats`),
    enabled: !!campaignId,
  });
}

export function useCompletionFunnel(campaignId: string) {
  return useQuery({
    queryKey: ['dashboard-funnel', campaignId],
    queryFn: () =>
      apiClient.get<CompletionFunnel>(`/api/v1/campaigns/${campaignId}/dashboard/funnel`),
    enabled: !!campaignId,
  });
}

export function useScoreDistribution(campaignId: string) {
  return useQuery({
    queryKey: ['dashboard-score-distribution', campaignId],
    queryFn: () =>
      apiClient.get<ScoreDistribution>(`/api/v1/campaigns/${campaignId}/dashboard/score-distribution`),
    enabled: !!campaignId,
  });
}

export function useTopKols(campaignId: string, limit = 10) {
  return useQuery({
    queryKey: ['dashboard-top-kols', campaignId, limit],
    queryFn: () =>
      apiClient.get<TopKol[]>(`/api/v1/campaigns/${campaignId}/dashboard/top-kols`, { limit }),
    enabled: !!campaignId,
  });
}

export function useSegmentScores(campaignId: string) {
  return useQuery({
    queryKey: ['dashboard-segment-scores', campaignId],
    queryFn: () =>
      apiClient.get<SegmentScores>(`/api/v1/campaigns/${campaignId}/dashboard/segment-scores`),
    enabled: !!campaignId,
  });
}

export function useCustomChartData(
  campaignId: string,
  config: { questionId?: string; groupBy?: string; metric?: string }
) {
  return useQuery({
    queryKey: ['dashboard-custom-chart', campaignId, config],
    queryFn: () =>
      apiClient.get<CustomChartData>(`/api/v1/campaigns/${campaignId}/dashboard/custom-chart`, {
        questionId: config.questionId,
        groupBy: config.groupBy,
        metric: config.metric,
      }),
    enabled: !!campaignId && !!config.questionId,
  });
}
