'use client';

import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { useDashboard, useDashboardStats } from '@/hooks/use-dashboards';
import {
  ResponseRateCard,
  CompletionFunnel,
  TopKolsTable,
  ScoreDistribution,
  GeographicHeatMap,
  SegmentScoreBreakdown,
  DynamicChart,
} from '@/components/dashboard';
import { AlertCircle } from 'lucide-react';

interface CustomComponentConfig {
  chartType: 'bar' | 'pie' | 'line' | 'table';
  title: string;
  dataSource: 'question_responses' | 'hcp_attributes';
  questionId?: string;
  groupBy?: 'specialty' | 'region' | 'state' | 'years_in_practice';
  metric: 'count' | 'average' | 'sum';
}

export default function ClientDashboardPage() {
  const params = useParams();
  const campaignId = params.id as string;
  const { data: dashboard, isLoading: dashboardLoading } = useDashboard(campaignId);
  const { data: stats, isLoading: statsLoading } = useDashboardStats(campaignId);

  const isLoading = dashboardLoading || statsLoading;

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="h-96 animate-pulse bg-muted rounded" />
      </div>
    );
  }

  if (!dashboard?.isPublished) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-16 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Dashboard Not Available</h2>
            <p className="text-muted-foreground">
              The dashboard for this campaign has not been published yet.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const renderComponent = (component: {
    componentKey: string;
    configJson: Record<string, unknown> | null;
  }) => {
    const key = component.componentKey;

    if (key.startsWith('custom_') && component.configJson) {
      return (
        <DynamicChart
          campaignId={campaignId}
          config={component.configJson as unknown as CustomComponentConfig}
          title={(component.configJson as { title?: string }).title || 'Custom Chart'}
        />
      );
    }

    switch (key) {
      case 'response_rate':
        return <ResponseRateCard campaignId={campaignId} />;
      case 'completion_funnel':
        return <CompletionFunnel campaignId={campaignId} />;
      case 'top_kols_table':
        return <TopKolsTable campaignId={campaignId} />;
      case 'score_distribution':
        return <ScoreDistribution campaignId={campaignId} />;
      case 'geographic_heat_map':
        return <GeographicHeatMap campaignId={campaignId} />;
      case 'segment_score_breakdown':
        return <SegmentScoreBreakdown campaignId={campaignId} />;
      default:
        return null;
    }
  };

  // Group visible components by section
  const visibleComponents = dashboard.components.filter((c) => c.isVisible);
  const componentsBySection = visibleComponents.reduce((acc, component) => {
    const section = component.sectionTitle;
    if (!acc[section]) acc[section] = [];
    acc[section].push(component);
    return acc;
  }, {} as Record<string, typeof dashboard.components>);

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{dashboard.name}</h1>
        <p className="text-muted-foreground">
          Campaign Analytics Dashboard
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats?.totalSent ?? 0}</div>
            <p className="text-sm text-muted-foreground">Surveys Sent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats?.totalCompleted ?? 0}</div>
            <p className="text-sm text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats?.responseRate ?? 0}%</div>
            <p className="text-sm text-muted-foreground">Response Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {stats?.averageScore?.toFixed(1) ?? '-'}
            </div>
            <p className="text-sm text-muted-foreground">Avg Score</p>
          </CardContent>
        </Card>
      </div>

      {/* Dashboard Sections */}
      {Object.entries(componentsBySection).map(([section, components]) => (
        <div key={section}>
          <h2 className="text-xl font-semibold mb-4">{section}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {components.map((component) => {
              const rendered = renderComponent(component);
              return rendered ? (
                <div key={component.id}>{rendered}</div>
              ) : null;
            })}
          </div>
        </div>
      ))}

      {visibleComponents.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">
              No dashboard components are currently visible.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
