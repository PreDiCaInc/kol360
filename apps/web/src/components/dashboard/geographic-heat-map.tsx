'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDashboardStats } from '@/hooks/use-dashboards';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface GeographicHeatMapProps {
  campaignId: string;
}

export function GeographicHeatMap({ campaignId }: GeographicHeatMapProps) {
  const { data: stats, isLoading } = useDashboardStats(campaignId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Geographic Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 animate-pulse bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  // Take top 10 states
  const data = stats?.hcpsByState.slice(0, 10) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Geographic Distribution (Top 10 States)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="state" type="category" width={40} />
              <Tooltip />
              <Bar dataKey="count" fill="#82ca9d" name="HCPs" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
