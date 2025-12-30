'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-provider';
import { usePlatformStats } from '@/hooks/use-dashboards';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
} from 'lucide-react';

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
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading } = usePlatformStats();
  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN';
  const isClientAdmin = user?.role === 'CLIENT_ADMIN';

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
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Activity className="h-4 w-4 text-emerald-500" />
            <span>All systems operational</span>
          </div>
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
            description="Search and manage healthcare professionals"
          />

          <QuickActionCard
            href="/admin/campaigns"
            icon={<BarChart3 className="h-6 w-6 text-violet-600" />}
            iconBg="bg-violet-500/10"
            title="Campaigns"
            description="Create and manage KOL assessment campaigns"
          />

          <QuickActionCard
            href="/admin/survey-templates"
            icon={<FileText className="h-6 w-6 text-amber-600" />}
            iconBg="bg-amber-500/10"
            title="Survey Templates"
            description="Configure survey questions and sections"
          />

          <Link href="/admin/dashboards" className="group">
            <Card className="h-full gradient-primary text-white border-0 hover:shadow-xl hover:shadow-primary/20 transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20 transition-transform duration-300 group-hover:scale-110">
                    <TrendingUp className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-white">
                        View Analytics
                      </h3>
                      <Sparkles className="h-4 w-4 text-white/70" />
                    </div>
                    <p className="text-sm text-white/80 mt-1">
                      Interactive dashboards and insights
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* Account Info Card */}
      <Card className="border-border/60">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <span className="text-sm font-semibold text-primary">
                {user?.email?.substring(0, 2).toUpperCase() || 'U'}
              </span>
            </div>
            <div>
              <CardTitle className="text-base">Your Account</CardTitle>
              <CardDescription>Current session information</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</p>
              <p className="text-sm font-medium">{user?.email}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Role</p>
              <p className="text-sm font-medium capitalize">{user?.role?.replace(/_/g, ' ').toLowerCase()}</p>
            </div>
            {user?.tenantId && (
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
