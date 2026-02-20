'use client';

import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/auth/require-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Users, FlaskConical, Loader2 } from 'lucide-react';
import { useDashboardDiseaseAreas } from '@/hooks/use-insights-report';

export default function DashboardsPage() {
  const router = useRouter();
  const { data, isLoading } = useDashboardDiseaseAreas();
  const diseaseAreas = data?.items || [];

  return (
    <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Insights Dashboard</h1>
          <p className="text-muted-foreground">
            Select a disease area to view KOL analytics and leader rankings
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : diseaseAreas.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <BarChart3 className="w-16 h-16 text-muted-foreground mb-6" />
              <h3 className="text-lg font-medium mb-2">No Disease Areas Available</h3>
              <p className="text-muted-foreground text-center max-w-md">
                No disease areas with campaign data are available yet.
                Once campaigns are created, insights will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {diseaseAreas.map((da) => (
              <Card
                key={da.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => router.push(`/admin/dashboards/${da.id}`)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">{da.name}</h3>
                      <Badge variant="secondary" className="mt-1">
                        {da.therapeuticArea}
                      </Badge>
                    </div>
                    <FlaskConical className="h-5 w-5 text-muted-foreground shrink-0" />
                  </div>
                  <div className="flex items-center gap-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-4 w-4" />
                      <span>{da.kolCount} KOLs</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <BarChart3 className="h-4 w-4" />
                      <span>{da.campaignCount} Campaigns</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </RequireAuth>
  );
}
