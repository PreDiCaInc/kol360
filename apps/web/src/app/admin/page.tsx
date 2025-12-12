'use client';

import { useAuth } from '@/lib/auth/auth-provider';
import { RequireAuth } from '@/components/auth/require-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function AdminDashboardContent() {
  const { user, signOut } = useAuth();

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
                  <dd>{user?.role}</dd>
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
              <Button variant="outline" className="w-full justify-start" disabled>
                Manage Clients
              </Button>
              <Button variant="outline" className="w-full justify-start" disabled>
                Manage Users
              </Button>
              <Button variant="outline" className="w-full justify-start" disabled>
                View Campaigns
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
