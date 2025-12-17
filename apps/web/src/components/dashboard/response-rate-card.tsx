'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDashboardStats } from '@/hooks/use-dashboards';

interface ResponseRateCardProps {
  campaignId: string;
}

export function ResponseRateCard({ campaignId }: ResponseRateCardProps) {
  const { data: stats, isLoading } = useDashboardStats(campaignId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Response Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 animate-pulse bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  const responseRate = stats?.responseRate ?? 0;
  const totalCompleted = stats?.totalCompleted ?? 0;
  const totalSent = stats?.totalSent ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Response Rate</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center">
          <div className="text-5xl font-bold text-primary">{responseRate}%</div>
          <p className="text-sm text-muted-foreground mt-2">
            {totalCompleted} of {totalSent} completed
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
