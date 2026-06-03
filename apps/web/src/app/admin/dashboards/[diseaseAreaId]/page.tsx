'use client';

import { useParams, useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/auth/require-auth';
import { InsightsDashboard } from '@/components/insights/insights-dashboard';

export default function DashboardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const diseaseAreaId = params.diseaseAreaId as string;

  return (
    <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN', 'TEAM_MEMBER']}>
      <div className="p-6">
        <InsightsDashboard
          diseaseAreaId={diseaseAreaId}
          onDiseaseAreaChange={(id) => router.push(`/admin/dashboards/${id}`)}
          onBack={() => router.push('/admin/dashboards')}
        />
      </div>
    </RequireAuth>
  );
}
