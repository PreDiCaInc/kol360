'use client';

import { use, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useDashboard,
  useUpdateDashboard,
  usePublishDashboard,
  useUnpublishDashboard,
  useAddComponent,
  useToggleComponent,
  useRemoveComponent,
} from '@/hooks/use-dashboards';
import {
  ResponseRateCard,
  CompletionFunnel,
  TopKolsTable,
  ScoreDistribution,
  GeographicHeatMap,
  SegmentScoreBreakdown,
  DynamicChart,
} from '@/components/dashboard';
import {
  Eye,
  EyeOff,
  Trash2,
  Plus,
  Settings,
  BarChart3,
  PieChart,
  LineChart,
  Table,
} from 'lucide-react';

// Standard components available in the platform
const STANDARD_COMPONENTS = [
  'response_rate',
  'completion_funnel',
  'top_kols_table',
  'score_distribution',
  'geographic_heat_map',
  'segment_score_breakdown',
  'score_trend',
] as const;

interface CustomComponentConfig {
  chartType: 'bar' | 'pie' | 'line' | 'table';
  title: string;
  dataSource: 'question_responses' | 'hcp_attributes';
  questionId?: string;
  groupBy?: 'specialty' | 'region' | 'state' | 'years_in_practice';
  metric: 'count' | 'average' | 'sum';
}

const STANDARD_COMPONENT_LABELS: Record<string, string> = {
  response_rate: 'Response Rate Card',
  completion_funnel: 'Completion Funnel',
  top_kols_table: 'Top KOLs Table',
  score_distribution: 'Score Distribution',
  geographic_heat_map: 'Geographic Heat Map',
  segment_score_breakdown: 'Segment Score Breakdown',
  score_trend: 'Score Trend Over Time',
};

export default function DashboardBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: campaignId } = use(params);
  const { data: dashboard, isLoading } = useDashboard(campaignId);
  const updateDashboard = useUpdateDashboard(campaignId);
  const publishDashboard = usePublishDashboard(campaignId);
  const unpublishDashboard = useUnpublishDashboard(campaignId);
  const addComponent = useAddComponent(campaignId);
  const toggleComponent = useToggleComponent(campaignId);
  const removeComponent = useRemoveComponent(campaignId);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newComponent, setNewComponent] = useState({
    type: 'STANDARD' as 'STANDARD' | 'CUSTOM',
    componentKey: '',
    sectionTitle: '',
    chartType: 'bar' as 'bar' | 'pie' | 'line' | 'table',
    title: '',
    questionId: '',
    groupBy: '' as '' | 'specialty' | 'region' | 'state' | 'years_in_practice',
    metric: 'count' as 'count' | 'average' | 'sum',
  });

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="h-96 animate-pulse bg-muted rounded" />
      </div>
    );
  }

  const handlePublish = () => {
    if (dashboard) {
      if (dashboard.isPublished) {
        unpublishDashboard.mutate(dashboard.id);
      } else {
        publishDashboard.mutate(dashboard.id);
      }
    }
  };

  const handleAddComponent = () => {
    if (!dashboard) return;

    if (newComponent.type === 'STANDARD') {
      addComponent.mutate({
        dashboardId: dashboard.id,
        data: {
          componentType: 'STANDARD',
          componentKey: newComponent.componentKey,
          sectionTitle: newComponent.sectionTitle || 'Custom Section',
          isVisible: true,
        },
      });
    } else {
      const config: CustomComponentConfig = {
        chartType: newComponent.chartType,
        title: newComponent.title,
        dataSource: 'question_responses',
        questionId: newComponent.questionId || undefined,
        groupBy: newComponent.groupBy || undefined,
        metric: newComponent.metric,
      };

      addComponent.mutate({
        dashboardId: dashboard.id,
        data: {
          componentType: 'CUSTOM',
          componentKey: `custom_${Date.now()}`,
          configJson: config as unknown as Record<string, unknown>,
          sectionTitle: newComponent.sectionTitle || 'Custom Section',
          isVisible: true,
        },
      });
    }

    setAddDialogOpen(false);
    setNewComponent({
      type: 'STANDARD',
      componentKey: '',
      sectionTitle: '',
      chartType: 'bar',
      title: '',
      questionId: '',
      groupBy: '',
      metric: 'count',
    });
  };

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
        return (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Component "{key}" not implemented
            </CardContent>
          </Card>
        );
    }
  };

  // Group components by section
  const componentsBySection = dashboard?.components.reduce((acc, component) => {
    const section = component.sectionTitle;
    if (!acc[section]) acc[section] = [];
    acc[section].push(component);
    return acc;
  }, {} as Record<string, typeof dashboard.components>) ?? {};

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Configuration</h1>
          <p className="text-muted-foreground">
            Configure the dashboard for this campaign
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Published</span>
            <Switch
              checked={dashboard?.isPublished ?? false}
              onCheckedChange={handlePublish}
            />
          </div>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Component
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Dashboard Component</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Component Type</Label>
                  <Select
                    value={newComponent.type}
                    onValueChange={(value: 'STANDARD' | 'CUSTOM') =>
                      setNewComponent({ ...newComponent, type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="STANDARD">Standard Component</SelectItem>
                      <SelectItem value="CUSTOM">Custom Visualization</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {newComponent.type === 'STANDARD' ? (
                  <div className="space-y-2">
                    <Label>Component</Label>
                    <Select
                      value={newComponent.componentKey}
                      onValueChange={(value) =>
                        setNewComponent({ ...newComponent, componentKey: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select component" />
                      </SelectTrigger>
                      <SelectContent>
                        {STANDARD_COMPONENTS.map((key) => (
                          <SelectItem key={key} value={key}>
                            {STANDARD_COMPONENT_LABELS[key] || key}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Chart Type</Label>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { type: 'bar', icon: BarChart3, label: 'Bar' },
                          { type: 'pie', icon: PieChart, label: 'Pie' },
                          { type: 'line', icon: LineChart, label: 'Line' },
                          { type: 'table', icon: Table, label: 'Table' },
                        ].map(({ type, icon: Icon, label }) => (
                          <Button
                            key={type}
                            variant={newComponent.chartType === type ? 'default' : 'outline'}
                            className="flex-col h-16"
                            onClick={() =>
                              setNewComponent({
                                ...newComponent,
                                chartType: type as typeof newComponent.chartType,
                              })
                            }
                          >
                            <Icon className="w-5 h-5 mb-1" />
                            <span className="text-xs">{label}</span>
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input
                        value={newComponent.title}
                        onChange={(e) =>
                          setNewComponent({ ...newComponent, title: e.target.value })
                        }
                        placeholder="Chart title"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Question ID (optional)</Label>
                      <Input
                        value={newComponent.questionId}
                        onChange={(e) =>
                          setNewComponent({ ...newComponent, questionId: e.target.value })
                        }
                        placeholder="Question ID to visualize"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Group By</Label>
                      <Select
                        value={newComponent.groupBy}
                        onValueChange={(value) =>
                          setNewComponent({
                            ...newComponent,
                            groupBy: value as typeof newComponent.groupBy,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select grouping" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="specialty">Specialty</SelectItem>
                          <SelectItem value="state">State</SelectItem>
                          <SelectItem value="region">Region</SelectItem>
                          <SelectItem value="years_in_practice">Years in Practice</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Metric</Label>
                      <Select
                        value={newComponent.metric}
                        onValueChange={(value) =>
                          setNewComponent({
                            ...newComponent,
                            metric: value as typeof newComponent.metric,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="count">Count</SelectItem>
                          <SelectItem value="average">Average</SelectItem>
                          <SelectItem value="sum">Sum</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label>Section Title</Label>
                  <Input
                    value={newComponent.sectionTitle}
                    onChange={(e) =>
                      setNewComponent({ ...newComponent, sectionTitle: e.target.value })
                    }
                    placeholder="e.g., Response Overview"
                  />
                </div>

                <Button onClick={handleAddComponent} className="w-full">
                  Add Component
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Standard Sections Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Standard Sections
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {dashboard?.components
              .filter((c) => c.componentType === 'STANDARD')
              .map((component) => (
                <div
                  key={component.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleComponent.mutate(component.id)}
                    >
                      {component.isVisible ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-muted-foreground" />
                      )}
                    </Button>
                    <div>
                      <div className="font-medium">
                        {STANDARD_COMPONENT_LABELS[component.componentKey] ||
                          component.componentKey}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {component.sectionTitle}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Custom Components */}
      {dashboard?.components.some((c) => c.componentType === 'CUSTOM') && (
        <Card>
          <CardHeader>
            <CardTitle>Custom Visualizations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dashboard.components
                .filter((c) => c.componentType === 'CUSTOM')
                .map((component) => (
                  <div
                    key={component.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleComponent.mutate(component.id)}
                      >
                        {component.isVisible ? (
                          <Eye className="w-4 h-4" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-muted-foreground" />
                        )}
                      </Button>
                      <div>
                        <div className="font-medium">
                          {(component.configJson as { title?: string } | null)?.title ||
                            'Custom Chart'}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {(component.configJson as { chartType?: string } | null)?.chartType} chart
                          | {component.sectionTitle}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeComponent.mutate(component.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Dashboard Preview</h2>
        <div className="space-y-8">
          {Object.entries(componentsBySection).map(([section, components]) => (
            <div key={section}>
              <h3 className="text-lg font-medium mb-4">{section}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {components
                  .filter((c) => c.isVisible)
                  .map((component) => (
                    <div key={component.id}>{renderComponent(component)}</div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
