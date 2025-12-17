'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSegmentScores } from '@/hooks/use-dashboards';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface SegmentScoreBreakdownProps {
  campaignId: string;
}

export function SegmentScoreBreakdown({ campaignId }: SegmentScoreBreakdownProps) {
  const { data: segments, isLoading } = useSegmentScores(campaignId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Score Segments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 animate-pulse bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  const data = segments?.segments.map((segment: { name: string; averageScore: number | null; weight: number }) => ({
    name: segment.name,
    score: segment.averageScore ?? 0,
    weight: segment.weight,
  })) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Score Segments (Avg Score & Weight)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} />
              <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="score" fill="#8884d8" name="Avg Score" />
              <Bar dataKey="weight" fill="#82ca9d" name="Weight %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
