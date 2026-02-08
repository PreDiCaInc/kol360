'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useRespondentAnalytics } from '@/hooks/use-insights-report';
import { Loader2, Users, CheckCircle, TrendingUp } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';

interface Props {
  diseaseAreaId: string;
}

const COLORS = [
  '#0088FE',
  '#00C49F',
  '#FFBB28',
  '#FF8042',
  '#8884D8',
  '#82CA9D',
  '#FFC658',
  '#8DD1E1',
  '#FF6B6B',
  '#A4DE6C',
];

// Filter helper to exclude "Unknown" values from demographic charts
// Unknown typically indicates missing data and clutters visualizations
const filterUnknown = <T extends { name: string }>(items: T[]): T[] =>
  items.filter((d) => d.name !== 'Unknown');

export function RespondentAnalyticsTab({ diseaseAreaId }: Props) {
  const { data, isLoading, error } = useRespondentAnalytics(diseaseAreaId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="h-96 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="h-96 flex items-center justify-center text-muted-foreground">
          Failed to load respondent analytics
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Respondents
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.totalRespondents.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Completed Surveys
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.completedSurveys.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Response Rate
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.responseRate.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Completion Over Time */}
      {data.completionOverTime.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Survey Completion Over Time</CardTitle>
            <CardDescription>Daily completions and cumulative total</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.completionOverTime}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(val) => new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip
                    labelFormatter={(val) => new Date(val).toLocaleDateString()}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="count" fill="#8884d8" name="Daily" />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="cumulative"
                    stroke="#82ca9d"
                    strokeWidth={2}
                    dot={false}
                    name="Cumulative"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Demographics Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* By Specialty */}
        <Card>
          <CardHeader>
            <CardTitle>Respondents by Specialty</CardTitle>
            <CardDescription>Top specialties of survey respondents</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {filterUnknown(data.bySpecialty).length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={filterUnknown(data.bySpecialty).slice(0, 8)} layout="vertical" margin={{ left: 100 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No specialty data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* By State */}
        <Card>
          <CardHeader>
            <CardTitle>Respondents by State</CardTitle>
            <CardDescription>Geographic distribution of respondents</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {filterUnknown(data.byState).length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={filterUnknown(data.byState).slice(0, 10)} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="name" width={35} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#10B981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No state data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Demographics Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* By Practice Setting */}
        <Card>
          <CardHeader>
            <CardTitle>Practice Setting</CardTitle>
            <CardDescription>Distribution by practice type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {filterUnknown(data.byPracticeSetting).length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={filterUnknown(data.byPracticeSetting).slice(0, 6)}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, percent }) =>
                        `${name} (${((percent || 0) * 100).toFixed(0)}%)`
                      }
                    >
                      {data.byPracticeSetting.slice(0, 6).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No practice setting data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* By Survey Status */}
        <Card>
          <CardHeader>
            <CardTitle>Survey Status</CardTitle>
            <CardDescription>Response status breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {data.bySurveyStatus.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.bySurveyStatus}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, percent }) =>
                        `${name} (${((percent || 0) * 100).toFixed(0)}%)`
                      }
                    >
                      {data.bySurveyStatus.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No survey status data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Decile Distributions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Market Decile */}
        <Card>
          <CardHeader>
            <CardTitle>Market Decile Distribution</CardTitle>
            <CardDescription>Respondents by market ranking (1=highest)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              {data.byMarketDecile.some(d => d.count > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.byMarketDecile}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No decile data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Product 1 Decile */}
        <Card>
          <CardHeader>
            <CardTitle>Product Decile Distribution</CardTitle>
            <CardDescription>Respondents by product ranking (1=highest)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              {data.byProduct1Decile.some(d => d.count > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.byProduct1Decile}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No decile data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Additional Distributions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Years in Practice */}
        <Card>
          <CardHeader>
            <CardTitle>Years in Practice</CardTitle>
            <CardDescription>Experience level of respondents</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              {data.byYearsInPractice.some(d => d.count > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.byYearsInPractice}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#EC4899" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No years in practice data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Prescribing Behavior */}
        <Card>
          <CardHeader>
            <CardTitle>Prescribing Behavior</CardTitle>
            <CardDescription>Respondent prescribing patterns</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              {filterUnknown(data.byPrescribingBehavior).length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={filterUnknown(data.byPrescribingBehavior)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#06B6D4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No prescribing behavior data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
