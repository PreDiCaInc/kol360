'use client';

import { useState, useCallback } from 'react';
import { ArrowLeft, Users, UserCheck, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useInsightsSummary, useDashboardDiseaseAreas } from '@/hooks/use-insights-report';
import { useClients } from '@/hooks/use-clients';
import { useAuth } from '@/lib/auth/auth-provider';

// Tab components
import { IntroductionTab } from '@/components/insights/tabs/introduction-tab';
import { LeaderRankingsTab } from '@/components/insights/tabs/leader-rankings';
import { SociometricSummaryTab } from '@/components/insights/tabs/sociometric-summary';
import { SociometricTablesTab } from '@/components/insights/tabs/sociometric-tables-tab';
import { KolExplorerTab } from '@/components/insights/tabs/kol-explorer';
import { DemographicsTab } from '@/components/insights/tabs/demographics-tab';

import '@/components/insights/print-styles.css';

interface InsightsDashboardProps {
  diseaseAreaId: string;
  onDiseaseAreaChange: (id: string) => void;
  onBack: () => void;
}

export function InsightsDashboard({ diseaseAreaId, onDiseaseAreaChange, onBack }: InsightsDashboardProps) {
  const [activeTab, setActiveTab] = useState('introduction');
  const [selectedKolId, setSelectedKolId] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string>('all');

  const { user } = useAuth();
  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN';

  // Fetch clients for PLATFORM_ADMIN client selector
  const { data: clientsData } = useClients();
  const clients = clientsData?.items || [];

  // Fetch disease areas for selector (scoped to user's access)
  const { data: diseaseAreasData } = useDashboardDiseaseAreas();
  const diseaseAreas = diseaseAreasData?.items || [];
  const currentDiseaseArea = diseaseAreas.find((da) => da.id === diseaseAreaId);

  // Determine effective clientId for campaign-scoped data
  // PLATFORM_ADMIN: uses selected client (undefined if "all")
  // CLIENT_ADMIN: uses their own tenantId (always set)
  const effectiveClientId = isPlatformAdmin
    ? (selectedClientId === 'all' ? undefined : selectedClientId)
    : user?.tenantId;

  // Fetch summary stats
  const { data: summary, isLoading: summaryLoading } = useInsightsSummary(diseaseAreaId, effectiveClientId);

  // Cross-tab KOL navigation: switches to KOL Insights tab and opens profile view
  const handleKolSelect = useCallback((kolId: string) => {
    setSelectedKolId(kolId);
    setActiveTab('kol-insights');
  }, []);

  // Reset selected KOL when switching away from KOL Insights tab
  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    if (tab !== 'kol-insights') {
      setSelectedKolId(null);
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Print Header */}
      <div className="print-header print-only">
        <h1>KOL 360 Insights Report</h1>
        <p className="print-date">
          {currentDiseaseArea?.name || 'Disease Area'} - Generated on {new Date().toLocaleDateString()}
        </p>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Insights Dashboard</h1>
            <p className="text-muted-foreground">
              Comprehensive KOL analytics and leader rankings
            </p>
          </div>
        </div>

        {/* Selectors */}
        <div className="flex items-center gap-4">
          {/* Client Selector (PLATFORM_ADMIN only) */}
          {isPlatformAdmin && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Client:</span>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Disease Area Selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Disease Area:</span>
            <Select value={diseaseAreaId} onValueChange={onDiseaseAreaChange}>
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="Select disease area" />
              </SelectTrigger>
              <SelectContent>
                {diseaseAreas.map((da) => (
                  <SelectItem key={da.id} value={da.id}>
                    {da.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-l-4 border-l-blue-500 shadow-md hover:shadow-lg transition-shadow rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-blue-50 dark:bg-blue-950">
                <Users className="h-4 w-4 text-blue-500" />
              </div>
              Total KOLs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-blue-600 dark:text-blue-400">
              {summaryLoading ? '...' : (summary?.totalKols ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500 shadow-md hover:shadow-lg transition-shadow rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950">
                <UserCheck className="h-4 w-4 text-emerald-500" />
              </div>
              Total Respondents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
              {summaryLoading ? '...' : (summary?.totalRespondents ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500 shadow-md hover:shadow-lg transition-shadow rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-amber-50 dark:bg-amber-950">
                <MessageSquare className="h-4 w-4 text-amber-500" />
              </div>
              Total Nominations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-amber-600 dark:text-amber-400">
              {summaryLoading ? '...' : (summary?.totalNominations ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-6 print:hidden h-12">
          <TabsTrigger value="introduction">Introduction</TabsTrigger>
          <TabsTrigger value="demographics">Demographics</TabsTrigger>
          <TabsTrigger value="kol360-leaders">KOL360 Leaders</TabsTrigger>
          <TabsTrigger value="sociometric-leaders">Sociometric Leaders</TabsTrigger>
          <TabsTrigger value="sociometric-tables">Sociometric Tables</TabsTrigger>
          <TabsTrigger value="kol-insights">KOL Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="introduction" className="mt-6">
          <IntroductionTab diseaseAreaId={diseaseAreaId} />
        </TabsContent>

        <TabsContent value="demographics" className="mt-6">
          <DemographicsTab diseaseAreaId={diseaseAreaId} clientId={effectiveClientId} />
        </TabsContent>

        <TabsContent value="kol360-leaders" className="mt-6">
          <LeaderRankingsTab diseaseAreaId={diseaseAreaId} onKolSelect={handleKolSelect} clientId={effectiveClientId} />
        </TabsContent>

        <TabsContent value="sociometric-leaders" className="mt-6">
          <SociometricSummaryTab diseaseAreaId={diseaseAreaId} onKolSelect={handleKolSelect} clientId={effectiveClientId} />
        </TabsContent>

        <TabsContent value="sociometric-tables" className="mt-6">
          <SociometricTablesTab diseaseAreaId={diseaseAreaId} onKolSelect={handleKolSelect} clientId={effectiveClientId} />
        </TabsContent>

        <TabsContent value="kol-insights" className="mt-6">
          <KolExplorerTab diseaseAreaId={diseaseAreaId} initialKolId={selectedKolId} clientId={effectiveClientId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
