'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCompletionFunnel } from '@/hooks/use-dashboards';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface CompletionFunnelProps {
  campaignId: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

export function CompletionFunnel({ campaignId }: CompletionFunnelProps) {
  const { data: funnel, isLoading } = useCompletionFunnel(campaignId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Completion Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 animate-pulse bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  const data = [
    { name: 'Sent', value: funnel?.sent ?? 0 },
    { name: 'Opened', value: funnel?.opened ?? 0 },
    { name: 'Started', value: funnel?.started ?? 0 },
    { name: 'Completed', value: funnel?.completed ?? 0 },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Completion Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={80} />
              <Tooltip />
              <Bar dataKey="value" fill="#8884d8">
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
