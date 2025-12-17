'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useScoreDistribution } from '@/hooks/use-dashboards';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface ScoreDistributionProps {
  campaignId: string;
}

export function ScoreDistribution({ campaignId }: ScoreDistributionProps) {
  const { data: distribution, isLoading } = useScoreDistribution(campaignId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Score Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 animate-pulse bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  const data = distribution?.ranges.map((range: { min: number; max: number; count: number }) => ({
    name: `${range.min}-${range.max}`,
    count: range.count,
  })) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Score Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#8884d8" name="HCPs" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
