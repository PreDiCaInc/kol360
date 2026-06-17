'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-provider';
import { useImpersonation } from '@/lib/impersonation-context';
import { usePlatformStats } from '@/hooks/use-dashboards';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Building2,
  Users,
  BarChart3,
  Stethoscope,
  TrendingUp,
  Activity,
  FileText,
  ClipboardList,
  ArrowUpRight,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Eye,
} from 'lucide-react';

interface HealthCheck {
  name: string;
  status: 'ok' | 'error';
  latency_ms?: number;
  error?: string;
}

interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  checks: HealthCheck[];
}

function SystemStatus() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await fetch('/api/health/status');
        const data = await response.json();
        setHealth(data);
      } catch {
        setHealth({ status: 'error', checks: [{ name: 'Frontend', status: 'error', error: 'Failed to check' }] });
      } finally {
        setLoading(false);
      }
    };

    fetchHealth();
    // Refresh every 60 seconds
    const interval = setInterval(fetchHealth, 60000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = () => {
    if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    if (!health) return <AlertCircle className="h-4 w-4 text-amber-500" />;
    if (health.status === 'ok') return <Activity className="h-4 w-4 text-emerald-500" />;
    if (health.status === 'degraded') return <AlertCircle className="h-4 w-4 text-amber-500" />;
    return <XCircle className="h-4 w-4 text-red-500" />;
  };

  const getStatusText = () => {
    if (loading) return 'Checking systems...';
    if (!health) return 'Status unknown';
    if (health.status === 'ok') return 'All systems operational';
    if (health.status === 'degraded') return 'Some systems degraded';
    return 'System issues detected';
  };

  const getStatusColor = () => {
    if (loading || !health) return 'text-muted-foreground';
    if (health.status === 'ok') return 'text-emerald-600 dark:text-emerald-400';
    if (health.status === 'degraded') return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={`flex items-center gap-2 text-sm ${getStatusColor()} hover:opacity-80 transition-opacity cursor-pointer`}>
          {getStatusIcon()}
          <span>{getStatusText()}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="px-4 py-3 border-b">
          <h4 className="font-medium text-sm">System Status</h4>
          <p className="text-xs text-muted-foreground mt-0.5">Real-time health checks</p>
        </div>
        <div className="p-2">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : health?.checks ? (
            <div className="space-y-1">
              {health.checks.map((check) => (
                <div
                  key={check.name}
                  className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    {check.status === 'ok' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="text-sm">{check.name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {check.status === 'ok' && check.latency_ms
                      ? `${check.latency_ms}ms`
                      : check.error || (check.status === 'ok' ? 'OK' : 'Error')}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Unable to fetch status</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  change: string;
  changeType: 'positive' | 'neutral';
  icon: React.ReactNode;
  accent: string;
  href?: string;
}

function StatCard({ title, value, change, changeType, icon, accent, href }: StatCardProps) {
  const cardContent = (
    <Card className="stat-card hover-lift group cursor-pointer">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">{title}</p>
            <p className="text-3xl font-semibold tracking-tight">{value}</p>
            <div className="flex items-center gap-1.5">
              {changeType === 'positive' && (
                <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <ArrowUpRight className="h-3 w-3" />
                  {change}
                </span>
              )}
              {changeType === 'neutral' && (
                <span className="text-xs text-muted-foreground">{change}</span>
              )}
            </div>
          </div>
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${accent} transition-transform duration-300 group-hover:scale-110`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href}>{cardContent}</Link>;
  }

  return cardContent;
}

interface QuickActionCardProps {
  href: string;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
}

function QuickActionCard({ href, icon, iconBg, title, description }: QuickActionCardProps) {
  return (
    <Link href={href} className="group">
      <Card className="h-full border-border/60 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconBg} transition-transform duration-300 group-hover:scale-110`}>
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                  {title}
                </h3>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
              </div>
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const { isImpersonating, clientName, stopImpersonating } = useImpersonation();
  const { data: stats, isLoading: statsLoading } = usePlatformStats();
  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN' && !isImpersonating;
  const isClientAdmin = user?.role === 'CLIENT_ADMIN' || isImpersonating;

  // Non-PLATFORM_ADMIN users (CLIENT_ADMIN / TEAM_MEMBER) don't have a
  // dashboard at this URL — sidebar only lists "KOL Insights" for them.
  // Redirect to /admin/dashboards so they land somewhere meaningful.
  useEffect(() => {
    if (!user) return;
    if (user.role !== 'PLATFORM_ADMIN') {
      router.replace('/admin/dashboards');
    }
  }, [user, router]);

  if (user && user.role !== 'PLATFORM_ADMIN') {
    return null;
  }

  const formatNumber = (num: number | undefined) => {
    if (num === undefined) return '—';
    return num.toLocaleString();
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="p-6 lg:p-8 space-y-8 fade-in">
      {/* Welcome Section */}
      <div className="relative">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary mb-1">{getGreeting()}</p>
            <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight text-foreground">
              Welcome back, {user?.firstName || 'there'}
            </h1>
            <p className="text-muted-foreground mt-2 text-base">
              Here&apos;s an overview of your KOL assessment activities
            </p>
          </div>
          <SystemStatus />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 stagger-children">
        <StatCard
          title="Active Campaigns"
          value={statsLoading ? '...' : formatNumber(stats?.activeCampaigns)}
          change="Currently running"
          changeType="neutral"
          icon={<BarChart3 className="h-6 w-6 text-primary" />}
          accent="bg-primary/10"
          href="/admin/campaigns"
        />
        <StatCard
          title="HCPs in Database"
          value={statsLoading ? '...' : formatNumber(stats?.totalHcps)}
          change="Total healthcare professionals"
          changeType="neutral"
          icon={<Stethoscope className="h-6 w-6 text-blue-600" />}
          accent="bg-blue-500/10"
          href="/admin/hcps"
        />
        <StatCard
          title="Survey Responses"
          value={statsLoading ? '...' : formatNumber(stats?.completedResponses)}
          change="Completed surveys"
          changeType="neutral"
          icon={<FileText className="h-6 w-6 text-violet-600" />}
          accent="bg-violet-500/10"
          href="/admin/campaigns"
        />
        <StatCard
          title="Pending Matches"
          value={statsLoading ? '...' : formatNumber(stats?.pendingNominations)}
          change="Nominations awaiting review"
          changeType="neutral"
          icon={<ClipboardList className="h-6 w-6 text-amber-600" />}
          accent="bg-amber-500/10"
          href="/admin/campaigns"
        />
      </div>

      {/* Quick Actions */}
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Quick Actions</h2>
        </div>
        
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 stagger-children">
          {isPlatformAdmin && (
            <QuickActionCard
              href="/admin/clients"
              icon={<Building2 className="h-6 w-6 text-primary" />}
              iconBg="bg-primary/10"
              title="Manage Clients"
              description="View and manage client organizations"
            />
          )}

          {(isPlatformAdmin || isClientAdmin) && (
            <QuickActionCard
              href="/admin/users"
              icon={<Users className="h-6 w-6 text-emerald-600" />}
              iconBg="bg-emerald-500/10"
              title="Manage Users"
              description="Add and manage user accounts"
            />
          )}

          <QuickActionCard
            href="/admin/hcps"
            icon={<Stethoscope className="h-6 w-6 text-blue-600" />}
            iconBg="bg-blue-500/10"
            title="HCP Database"
            description={isImpersonating ? "View healthcare professionals" : "Search and manage healthcare professionals"}
          />

          <QuickActionCard
            href="/admin/campaigns"
            icon={<BarChart3 className="h-6 w-6 text-violet-600" />}
            iconBg="bg-violet-500/10"
            title="Campaigns"
            description={isImpersonating ? "View KOL assessment campaigns" : "Create and manage KOL assessment campaigns"}
          />

          {isPlatformAdmin && (
            <QuickActionCard
              href="/admin/survey-templates"
              icon={<FileText className="h-6 w-6 text-amber-600" />}
              iconBg="bg-amber-500/10"
              title="Survey Templates"
              description="Configure survey questions and sections"
            />
          )}

          <div className="cursor-not-allowed" title="Coming soon">
            <Card className="h-full bg-muted/50 border border-muted text-muted-foreground opacity-60">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
                    <TrendingUp className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">
                        View Analytics
                      </h3>
                      <Sparkles className="h-4 w-4 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm mt-1">
                      Coming soon
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Account Info Card */}
      <Card className={isImpersonating ? 'border-amber-400/60' : 'border-border/60'}>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                isImpersonating ? 'bg-amber-500/10' : 'bg-primary/10'
              }`}>
                <span className={`text-sm font-semibold ${isImpersonating ? 'text-amber-600' : 'text-primary'}`}>
                  {user?.email?.substring(0, 2).toUpperCase() || 'U'}
                </span>
              </div>
              <div>
                <CardTitle className="text-base">Your Account</CardTitle>
                <CardDescription>Current session information</CardDescription>
              </div>
            </div>
            {isImpersonating && (
              <Button variant="outline" size="sm" onClick={stopImpersonating} className="border-amber-400 text-amber-600 hover:bg-amber-50">
                Stop Viewing
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</p>
              <p className="text-sm font-medium">{user?.email}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Role</p>
              <p className="text-sm font-medium capitalize">{user?.role?.replace(/_/g, ' ').toLowerCase()}</p>
            </div>
            {isImpersonating && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-amber-600 uppercase tracking-wider flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  Viewing As
                </p>
                <p className="text-sm font-medium text-amber-700">{clientName}</p>
              </div>
            )}
            {user?.tenantId && !isImpersonating && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Organization</p>
                <p className="text-sm font-medium">Client Tenant</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
