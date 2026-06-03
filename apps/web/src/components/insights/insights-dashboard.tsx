'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
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
  // Insights is analysis-backed: one curated analysis per (client, disease
  // area). PLATFORM_ADMIN must pick a client (no "all"); a cross-client view
  // is a dedicated aggregate-client analysis.
  const [selectedClientId, setSelectedClientId] = useState<string>('');

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
    ? (selectedClientId || undefined)
    : user?.tenantId;

  // PLATFORM_ADMIN with no client chosen yet — prompt selection.
  const needsClientSelection = isPlatformAdmin && !selectedClientId;

  // Fetch summary stats
  const { data: summary, isLoading: summaryLoading } = useInsightsSummary(diseaseAreaId, effectiveClientId);

  // Cross-tab KOL navigation: switches to KOL Insights tab and opens profile view
  const handleKolSelect = useCallback((kolId: string) => {
    setSelectedKolId(kolId);
    setActiveTab('total-weighted-score');
  }, []);

  // Reset selected KOL when switching away from KOL Insights tab
  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    if (tab !== 'total-weighted-score') {
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
                  <SelectValue placeholder="Select a client…" />
                </SelectTrigger>
                <SelectContent>
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

      {needsClientSelection ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <h3 className="text-lg font-semibold">Select a client</h3>
            <p className="text-muted-foreground mt-1">
              Insights are scoped to a curated KOL analysis per client &amp;
              disease area. Choose a client above to view its dashboard.
            </p>
          </CardContent>
        </Card>
      ) : !summaryLoading && summary?.notConfigured ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <h3 className="text-lg font-semibold">No analysis configured</h3>
            <p className="text-muted-foreground mt-1">
              There is no KOL analysis for this client &amp; disease area yet.
              Create one and add campaigns in{' '}
              <Link href="/admin/kol-analysis" className="text-blue-600 hover:underline">
                KOL Analyses
              </Link>
              , then recalculate.
            </p>
          </CardContent>
        </Card>
      ) : (
      <>
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
        <TabsList className="grid w-full grid-cols-5 print:hidden h-12">
          <TabsTrigger value="introduction">Introduction</TabsTrigger>
          <TabsTrigger value="demographics">Demographics</TabsTrigger>
          <TabsTrigger value="dynamic-benchmarking">Benchmarking</TabsTrigger>
          <TabsTrigger value="sociometric-leaders">Sociometric Leaders</TabsTrigger>
          <TabsTrigger value="total-weighted-score">Total Weighted Score</TabsTrigger>
        </TabsList>

        <TabsContent value="introduction" className="mt-6">
          <IntroductionTab diseaseAreaId={diseaseAreaId} />
        </TabsContent>

        <TabsContent value="demographics" className="mt-6">
          <DemographicsTab diseaseAreaId={diseaseAreaId} clientId={effectiveClientId} />
        </TabsContent>

        <TabsContent value="dynamic-benchmarking" className="mt-6">
          <LeaderRankingsTab diseaseAreaId={diseaseAreaId} onKolSelect={handleKolSelect} clientId={effectiveClientId} />
        </TabsContent>

        <TabsContent value="sociometric-leaders" className="mt-6">
          <SociometricSummaryTab diseaseAreaId={diseaseAreaId} onKolSelect={handleKolSelect} clientId={effectiveClientId} />
          <div className="mt-8">
            <h2 className="text-xl font-bold mb-4">Per-Category Leader Tables</h2>
            <SociometricTablesTab diseaseAreaId={diseaseAreaId} onKolSelect={handleKolSelect} clientId={effectiveClientId} />
          </div>
        </TabsContent>

        <TabsContent value="total-weighted-score" className="mt-6">
          <KolExplorerTab diseaseAreaId={diseaseAreaId} initialKolId={selectedKolId} clientId={effectiveClientId} />
        </TabsContent>
      </Tabs>
      </>
      )}
    </div>
  );
}
