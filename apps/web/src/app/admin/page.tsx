'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-provider';
import { RequireAuth } from '@/components/auth/require-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Users, BarChart3, Stethoscope } from 'lucide-react';

function AdminDashboardContent() {
  const { user, signOut } = useAuth();
  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN';

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">KOL360 Admin</h1>
          <Button variant="outline" onClick={signOut}>
            Sign Out
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Welcome</CardTitle>
              <CardDescription>You are signed in</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="font-medium text-gray-500">Email</dt>
                  <dd>{user?.email}</dd>
                </div>
                <div>
                  <dt className="font-medium text-gray-500">Role</dt>
                  <dd className="capitalize">{user?.role?.replace(/_/g, ' ').toLowerCase()}</dd>
                </div>
                {user?.tenantId && (
                  <div>
                    <dt className="font-medium text-gray-500">Tenant ID</dt>
                    <dd>{user.tenantId}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Manage your platform</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {isPlatformAdmin && (
                <Link href="/admin/clients">
                  <Button variant="outline" className="w-full justify-start">
                    <Building2 className="w-4 h-4 mr-2" />
                    Manage Clients
                  </Button>
                </Link>
              )}
              <Link href="/admin/users">
                <Button variant="outline" className="w-full justify-start">
                  <Users className="w-4 h-4 mr-2" />
                  Manage Users
                </Button>
              </Link>
              <Link href="/admin/hcps">
                <Button variant="outline" className="w-full justify-start">
                  <Stethoscope className="w-4 h-4 mr-2" />
                  HCP Database
                </Button>
              </Link>
              <Button variant="outline" className="w-full justify-start" disabled>
                <BarChart3 className="w-4 h-4 mr-2" />
                View Campaigns (Coming Soon)
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth>
      <AdminDashboardContent />
    </RequireAuth>
  );
}
