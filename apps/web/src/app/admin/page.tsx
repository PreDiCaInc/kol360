'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Building2,
  Users,
  BarChart3,
  Stethoscope,
  TrendingUp,
  Activity,
  FileText,
  ClipboardList,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  Mail,
  Eye,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApiClient } from '@/hooks/use-api-client';

interface DashboardStats {
  clients: {
    total: number;
    active: number;
    lite: number;
  };
  campaigns: {
    total: number;
    active: number;
    draft: number;
    closed: number;
    published: number;
  };
  hcps: {
    total: number;
    newThisWeek: number;
  };
  responses: {
    total: number;
    completed: number;
    pending: number;
    completionRate: number;
  };
  nominations: {
    total: number;
    matched: number;
    unmatched: number;
    pendingReview: number;
  };
  users: {
    total: number;
    pendingApproval: number;
  };
}

interface ActiveCampaign {
  id: string;
  name: string;
  clientName: string;
  status: string;
  responseRate: number;
  responsesCompleted: number;
  totalHcps: number;
  surveyCloseDate: string | null;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const api = useApiClient();
  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN';
  const isClientAdmin = user?.role === 'CLIENT_ADMIN';

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activeCampaigns, setActiveCampaigns] = useState<ActiveCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        // Fetch dashboard stats
        const [statsData, campaignsData] = await Promise.all([
          api.get<DashboardStats>('/api/v1/dashboard/stats').catch(() => null),
          api.get<{ campaigns: ActiveCampaign[] }>('/api/v1/campaigns', { status: 'ACTIVE', limit: 5 }).catch(() => null),
        ]);

        if (statsData) {
          setStats(statsData);
        }

        if (campaignsData) {
          setActiveCampaigns(campaignsData.campaigns || []);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [api]);

  // Platform Admin Dashboard
  if (isPlatformAdmin) {
    return (
      <div className="p-6 space-y-6">
        {/* Welcome Section */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Platform Overview
            </h1>
            <p className="text-muted-foreground mt-1">
              Cross-client operational dashboard for {user?.firstName || 'Admin'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/admin/campaigns">
                <BarChart3 className="h-4 w-4 mr-2" />
                All Campaigns
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/clients">
                <Building2 className="h-4 w-4 mr-2" />
                Manage Clients
              </Link>
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="card-hover">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.campaigns.active ?? '-'}</div>
              <p className="text-xs text-muted-foreground">
                {stats?.campaigns.draft ?? 0} draft, {stats?.campaigns.closed ?? 0} closed
              </p>
            </CardContent>
          </Card>

          <Card className="card-hover">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total HCPs</CardTitle>
              <Stethoscope className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.hcps.total?.toLocaleString() ?? '-'}</div>
              <p className="text-xs text-muted-foreground">
                +{stats?.hcps.newThisWeek ?? 0} new this week
              </p>
            </CardContent>
          </Card>

          <Card className="card-hover">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Response Rate</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.responses.completionRate ?? 0}%</div>
              <p className="text-xs text-muted-foreground">
                {stats?.responses.completed ?? 0} completed
              </p>
            </CardContent>
          </Card>

          <Card className="card-hover">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Matches</CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">
                {stats?.nominations.unmatched ?? '-'}
              </div>
              <p className="text-xs text-muted-foreground">
                Nominations awaiting review
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Alerts & Action Items */}
        {((stats?.users.pendingApproval ?? 0) > 0 || (stats?.nominations.unmatched ?? 0) > 0) && (
          <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-5 w-5" />
                Action Required
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(stats?.users.pendingApproval ?? 0) > 0 && (
                <div className="flex items-center justify-between p-3 bg-background rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-amber-600" />
                    <div>
                      <p className="font-medium">{stats?.users.pendingApproval} users pending approval</p>
                      <p className="text-sm text-muted-foreground">Review and approve new user registrations</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/admin/users?status=pending">Review</Link>
                  </Button>
                </div>
              )}
              {(stats?.nominations.unmatched ?? 0) > 0 && (
                <div className="flex items-center justify-between p-3 bg-background rounded-lg border">
                  <div className="flex items-center gap-3">
                    <ClipboardList className="h-5 w-5 text-amber-600" />
                    <div>
                      <p className="font-medium">{stats?.nominations.unmatched} unmatched nominations</p>
                      <p className="text-sm text-muted-foreground">Match nominations to HCPs in the database</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/admin/nominations?status=unmatched">Match</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Active Campaigns Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Active Campaigns</CardTitle>
              <CardDescription>Real-time campaign status across all clients</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/campaigns">
                View all <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {activeCampaigns.length > 0 ? (
              <div className="space-y-4">
                {activeCampaigns.map((campaign) => (
                  <div
                    key={campaign.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{campaign.name}</p>
                        <Badge variant="outline" className="text-xs">
                          {campaign.clientName}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {campaign.responsesCompleted} / {campaign.totalHcps} responses
                        {campaign.surveyCloseDate && (
                          <span className="ml-2">
                            • Closes {new Date(campaign.surveyCloseDate).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-lg font-semibold">{campaign.responseRate}%</p>
                        <p className="text-xs text-muted-foreground">Response rate</p>
                      </div>
                      <Button variant="ghost" size="icon" asChild>
                        <Link href={`/admin/campaigns/${campaign.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No active campaigns</p>
                <p className="text-sm mt-1">Campaigns will appear here when they are active</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Access Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Link href="/admin/clients">
            <Card className="card-hover cursor-pointer h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Clients</CardTitle>
                    <CardDescription className="text-xs">
                      {stats?.clients.total ?? 0} total • {stats?.clients.lite ?? 0} lite
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/admin/hcps">
            <Card className="card-hover cursor-pointer h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <Stethoscope className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">HCP Database</CardTitle>
                    <CardDescription className="text-xs">
                      Search and manage healthcare professionals
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/admin/survey-templates">
            <Card className="card-hover cursor-pointer h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-violet-500/10 rounded-lg">
                    <FileText className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Survey Templates</CardTitle>
                    <CardDescription className="text-xs">
                      Configure questions and sections
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/admin/users">
            <Card className="card-hover cursor-pointer h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <Users className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Users</CardTitle>
                    <CardDescription className="text-xs">
                      {stats?.users.total ?? 0} total • {stats?.users.pendingApproval ?? 0} pending
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>
    );
  }

  // Client Admin Dashboard
  if (isClientAdmin) {
    return (
      <div className="p-6 space-y-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">
            Welcome back, {user?.firstName || 'User'}
          </h1>
          <p className="text-muted-foreground mt-1">
            Here's what's happening with your KOL assessments today.
          </p>
        </div>

        {/* Client Admin Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="card-hover">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.campaigns.active ?? '-'}</div>
              <p className="text-xs text-muted-foreground">
                View campaign details
              </p>
            </CardContent>
          </Card>

          <Card className="card-hover">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">HCPs Available</CardTitle>
              <Stethoscope className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.hcps.total?.toLocaleString() ?? '-'}</div>
              <p className="text-xs text-muted-foreground">
                In your disease areas
              </p>
            </CardContent>
          </Card>

          <Card className="card-hover">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Response Rate</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.responses.completionRate ?? 0}%</div>
              <p className="text-xs text-muted-foreground">
                Average across campaigns
              </p>
            </CardContent>
          </Card>

          <Card className="card-hover">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Team Members</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.users.total ?? '-'}</div>
              <p className="text-xs text-muted-foreground">
                In your organization
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions for Client Admin */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Link href="/admin/client-dashboard">
            <Card className="card-hover cursor-pointer h-full bg-gradient-primary text-white">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <TrendingUp className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg text-white">View Dashboard</CardTitle>
                    <CardDescription className="text-white/80">
                      KOL rankings and insights
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/admin/client-hcps">
            <Card className="card-hover cursor-pointer h-full">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <Stethoscope className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Your HCPs</CardTitle>
                    <CardDescription>
                      View HCPs in your disease areas
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/admin/users">
            <Card className="card-hover cursor-pointer h-full">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <Users className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Manage Team</CardTitle>
                    <CardDescription>
                      Add and manage user accounts
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>
    );
  }

  // Default/Team Member view
  return (
    <div className="p-6 space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">
          Welcome back, {user?.firstName || 'User'}
        </h1>
        <p className="text-muted-foreground mt-1">
          Here's what's happening with your KOL assessments today.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Account</CardTitle>
          <CardDescription>Current session information</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="font-medium text-muted-foreground">Email</dt>
              <dd className="mt-1">{user?.email}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Role</dt>
              <dd className="mt-1 capitalize">{user?.role?.replace(/_/g, ' ').toLowerCase()}</dd>
            </div>
            {user?.tenantId && (
              <div>
                <dt className="font-medium text-muted-foreground">Organization</dt>
                <dd className="mt-1">Client Tenant</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
