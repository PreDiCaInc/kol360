'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-provider';
import { useApiClient } from '@/hooks/use-api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft,
  TrendingUp,
  Users,
  Stethoscope,
  Award,
  BarChart3,
  Eye,
  X,
} from 'lucide-react';

interface ViewAsClientData {
  clientId: string;
  clientName: string;
  originalUrl: string;
}

interface DashboardData {
  client: {
    id: string;
    name: string;
    type: string;
  };
  diseaseAreas: Array<{
    id: string;
    name: string;
    therapeuticArea: string;
  }>;
  topKols: Array<{
    id: string;
    firstName: string;
    lastName: string;
    specialty: string | null;
    compositeScore: number;
    surveyScore: number;
    rank: number;
  }>;
  stats: {
    totalHcps: number;
    publishedCampaigns: number;
    avgCompositeScore: number;
  };
}

export default function ClientDashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const api = useApiClient();

  const [viewAsClient, setViewAsClient] = useState<ViewAsClientData | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDiseaseArea, setSelectedDiseaseArea] = useState<string | null>(null);

  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN';
  const isClientAdmin = user?.role === 'CLIENT_ADMIN';

  useEffect(() => {
    // Check for "View as Client" mode
    const storedData = sessionStorage.getItem('viewAsClient');
    if (storedData) {
      try {
        const parsed = JSON.parse(storedData);
        setViewAsClient(parsed);
      } catch (e) {
        console.error('Failed to parse viewAsClient data');
      }
    }
  }, []);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        // Determine which client to fetch data for
        const clientId = viewAsClient?.clientId || user?.tenantId;

        if (!clientId && !isPlatformAdmin) {
          setLoading(false);
          return;
        }

        // Fetch dashboard data
        const data = await api.get<DashboardData>(
          clientId
            ? `/api/v1/dashboards/client/${clientId}`
            : '/api/v1/dashboards/client/me'
        ).catch(() => null);

        if (data) {
          setDashboardData(data);
          if (data.diseaseAreas?.length > 0) {
            setSelectedDiseaseArea(data.diseaseAreas[0].id);
          }
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [api, viewAsClient, user, isPlatformAdmin]);

  const exitViewAsClient = () => {
    const originalUrl = viewAsClient?.originalUrl;
    sessionStorage.removeItem('viewAsClient');
    setViewAsClient(null);
    if (originalUrl) {
      router.push(originalUrl);
    } else {
      router.push('/admin/clients');
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-32 bg-muted rounded"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* View as Client Banner */}
      {viewAsClient && isPlatformAdmin && (
        <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-lg dark:bg-amber-950/20 dark:border-amber-800">
          <div className="flex items-center gap-3">
            <Eye className="h-5 w-5 text-amber-600" />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-200">
                Viewing as: {viewAsClient.clientName}
              </p>
              <p className="text-sm text-amber-600 dark:text-amber-400">
                You are viewing this dashboard as a client admin would see it
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={exitViewAsClient}
            className="border-amber-300 hover:bg-amber-100"
          >
            <X className="h-4 w-4 mr-2" />
            Exit View
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {viewAsClient?.clientName || dashboardData?.client?.name || 'Your'} Dashboard
          </h1>
          <p className="text-muted-foreground">
            KOL rankings and sociometric insights
          </p>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total KOLs</CardTitle>
            <Stethoscope className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardData?.stats?.totalHcps?.toLocaleString() || '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              In your disease areas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Published Studies</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardData?.stats?.publishedCampaigns || '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              Completed assessments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Composite Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardData?.stats?.avgCompositeScore?.toFixed(1) || '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all KOLs
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Disease Area Selector */}
      {dashboardData?.diseaseAreas && dashboardData.diseaseAreas.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {dashboardData.diseaseAreas.map((area) => (
            <Button
              key={area.id}
              variant={selectedDiseaseArea === area.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedDiseaseArea(area.id)}
            >
              {area.name}
            </Button>
          ))}
        </div>
      )}

      {/* Top KOLs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Top KOLs</CardTitle>
          <CardDescription>
            Healthcare professionals ranked by composite score (objective + sociometric)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dashboardData?.topKols && dashboardData.topKols.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rank</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Specialty</TableHead>
                  <TableHead className="text-right">Sociometric Score</TableHead>
                  <TableHead className="text-right">Composite Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboardData.topKols.map((kol, index) => (
                  <TableRow key={kol.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {index < 3 ? (
                          <Award
                            className={`h-5 w-5 ${
                              index === 0
                                ? 'text-yellow-500'
                                : index === 1
                                ? 'text-gray-400'
                                : 'text-amber-600'
                            }`}
                          />
                        ) : (
                          <span className="text-muted-foreground font-medium">
                            #{kol.rank || index + 1}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {kol.firstName} {kol.lastName}
                    </TableCell>
                    <TableCell>{kol.specialty || '-'}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">
                        {kol.surveyScore?.toFixed(1) || '-'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-semibold text-primary">
                        {kol.compositeScore?.toFixed(1) || '-'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Stethoscope className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No KOL data available</p>
              <p className="text-sm mt-1">
                Data will appear here once assessments are published
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions for Client Admin */}
      {isClientAdmin && !viewAsClient && (
        <div className="grid gap-4 md:grid-cols-2">
          <Link href="/admin/client-hcps">
            <Card className="card-hover cursor-pointer">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <Stethoscope className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">View All HCPs</CardTitle>
                    <CardDescription className="text-xs">
                      Browse healthcare professionals in your disease areas
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/admin/users">
            <Card className="card-hover cursor-pointer">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <Users className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Manage Team</CardTitle>
                    <CardDescription className="text-xs">
                      Add and manage user access
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>
        </div>
      )}
    </div>
  );
}
