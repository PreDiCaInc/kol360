import { z } from 'zod';

// Standard component keys available in the platform
export const STANDARD_COMPONENTS = [
  'response_rate',
  'completion_funnel',
  'top_kols_table',
  'score_distribution',
  'geographic_heat_map',
  'segment_score_breakdown',
  'score_trend',
] as const;

export type StandardComponentKey = typeof STANDARD_COMPONENTS[number];

// Chart types for custom visualizations
export const chartTypeSchema = z.enum(['bar', 'pie', 'line', 'table']);
export type ChartType = z.infer<typeof chartTypeSchema>;

// Grouping dimensions for custom charts
export const groupBySchema = z.enum(['specialty', 'region', 'state', 'years_in_practice']);
export type GroupBy = z.infer<typeof groupBySchema>;

// Metrics for custom charts
export const metricSchema = z.enum(['count', 'average', 'sum']);
export type Metric = z.infer<typeof metricSchema>;

// Custom component configuration
export const customComponentConfigSchema = z.object({
  chartType: chartTypeSchema,
  title: z.string().min(1),
  dataSource: z.enum(['question_responses', 'hcp_attributes']),
  questionId: z.string().optional(),
  groupBy: groupBySchema.optional(),
  metric: metricSchema.default('count'),
});

export type CustomComponentConfig = z.infer<typeof customComponentConfigSchema>;

// Dashboard component schema
export const dashboardComponentSchema = z.object({
  id: z.string().cuid().optional(),
  componentType: z.enum(['STANDARD', 'CUSTOM']),
  componentKey: z.string().min(1),
  configJson: customComponentConfigSchema.optional().nullable(),
  sectionTitle: z.string().min(1),
  displayOrder: z.number().int().min(0).default(0),
  isVisible: z.boolean().default(true),
});

export type DashboardComponent = z.infer<typeof dashboardComponentSchema>;

// Create dashboard schema
export const createDashboardSchema = z.object({
  campaignId: z.string().cuid(),
  name: z.string().min(1).max(100),
  components: z.array(dashboardComponentSchema).default([]),
});

export type CreateDashboardInput = z.infer<typeof createDashboardSchema>;

// Update dashboard schema
export const updateDashboardSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isPublished: z.boolean().optional(),
  components: z.array(dashboardComponentSchema).optional(),
});

export type UpdateDashboardInput = z.infer<typeof updateDashboardSchema>;

// Add component schema
export const addComponentSchema = z.object({
  componentType: z.enum(['STANDARD', 'CUSTOM']),
  componentKey: z.string().min(1),
  configJson: customComponentConfigSchema.optional().nullable(),
  sectionTitle: z.string().min(1),
  displayOrder: z.number().int().min(0).default(0),
  isVisible: z.boolean().default(true),
});

export type AddComponentInput = z.infer<typeof addComponentSchema>;

// Update component schema
export const updateComponentSchema = z.object({
  configJson: customComponentConfigSchema.optional().nullable(),
  sectionTitle: z.string().min(1).optional(),
  displayOrder: z.number().int().min(0).optional(),
  isVisible: z.boolean().optional(),
});

export type UpdateComponentInput = z.infer<typeof updateComponentSchema>;

// Standard sections with default components
export const DEFAULT_DASHBOARD_SECTIONS = [
  {
    title: 'Response Overview',
    components: ['response_rate', 'completion_funnel'],
  },
  {
    title: 'KOL Rankings',
    components: ['top_kols_table', 'score_distribution'],
  },
  {
    title: 'Geographic Analysis',
    components: ['geographic_heat_map'],
  },
  {
    title: 'Score Analysis',
    components: ['segment_score_breakdown', 'score_trend'],
  },
];

// Dashboard stats response
export const dashboardStatsSchema = z.object({
  // Response stats
  totalSent: z.number(),
  totalOpened: z.number(),
  totalStarted: z.number(),
  totalCompleted: z.number(),
  responseRate: z.number(), // percentage

  // Score stats
  averageScore: z.number().nullable(),
  medianScore: z.number().nullable(),
  minScore: z.number().nullable(),
  maxScore: z.number().nullable(),

  // HCP stats
  totalHcps: z.number(),
  hcpsBySpecialty: z.array(z.object({
    specialty: z.string(),
    count: z.number(),
  })),
  hcpsByState: z.array(z.object({
    state: z.string(),
    count: z.number(),
  })),
});

export type DashboardStats = z.infer<typeof dashboardStatsSchema>;

// Score distribution data
export const scoreDistributionSchema = z.object({
  ranges: z.array(z.object({
    min: z.number(),
    max: z.number(),
    count: z.number(),
  })),
});

export type ScoreDistribution = z.infer<typeof scoreDistributionSchema>;

// Top KOLs data
export const topKolSchema = z.object({
  id: z.string(),
  npi: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  specialty: z.string().nullable(),
  state: z.string().nullable(),
  compositeScore: z.number().nullable(),
  surveyScore: z.number().nullable(),
  nominationCount: z.number(),
});

export type TopKol = z.infer<typeof topKolSchema>;

// Completion funnel data
export const completionFunnelSchema = z.object({
  sent: z.number(),
  opened: z.number(),
  started: z.number(),
  completed: z.number(),
});

export type CompletionFunnel = z.infer<typeof completionFunnelSchema>;

// Segment scores data
export const segmentScoresSchema = z.object({
  segments: z.array(z.object({
    name: z.string(),
    averageScore: z.number().nullable(),
    weight: z.number(),
  })),
});

export type SegmentScores = z.infer<typeof segmentScoresSchema>;

// Custom chart data
export const customChartDataSchema = z.object({
  labels: z.array(z.string()),
  data: z.array(z.number()),
  total: z.number(),
});

export type CustomChartData = z.infer<typeof customChartDataSchema>;
