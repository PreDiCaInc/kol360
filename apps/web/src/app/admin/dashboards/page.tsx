'use client';

import { RequireAuth } from '@/components/auth/require-auth';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { BarChart3, Construction } from 'lucide-react';

export default function DashboardsPage() {
  return (
    <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Dashboards</h1>
          <p className="text-muted-foreground">
            Analytics and reporting dashboards
          </p>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="relative mb-6">
              <BarChart3 className="w-16 h-16 text-muted-foreground" />
              <Construction className="w-8 h-8 text-amber-500 absolute -bottom-1 -right-1" />
            </div>
            <h3 className="text-lg font-medium mb-2">Coming Soon</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Comprehensive dashboards for KOL analytics, campaign performance,
              and engagement metrics will be available here.
            </p>
          </CardContent>
        </Card>
      </div>
    </RequireAuth>
  );
}
