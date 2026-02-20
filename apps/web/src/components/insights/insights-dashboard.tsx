'use client';

import { useState, useCallback } from 'react';
import { ArrowLeft, Users, Trophy, User, Search, BarChart3 } from 'lucide-react';
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

// Tab components
import { KolExplorerTab } from '@/components/insights/tabs/kol-explorer';
import { LeaderRankingsTab } from '@/components/insights/tabs/leader-rankings';
import { KolProfileTab } from '@/components/insights/tabs/kol-profile';
import { SociometricSummaryTab } from '@/components/insights/tabs/sociometric-summary';
import { RespondentAnalyticsTab } from '@/components/insights/tabs/respondent-analytics';

// Global filters and print styles
import { GlobalFilters, GlobalFilterState, globalFiltersToApiFormat } from '@/components/insights/global-filters';
import '@/components/insights/print-styles.css';

interface InsightsDashboardProps {
  diseaseAreaId: string;
  onDiseaseAreaChange: (id: string) => void;
  onBack: () => void;
}

export function InsightsDashboard({ diseaseAreaId, onDiseaseAreaChange, onBack }: InsightsDashboardProps) {
  const [activeTab, setActiveTab] = useState('kol-explorer');
  const [selectedKolId, setSelectedKolId] = useState<string | null>(null);
  const [globalFilters, setGlobalFilters] = useState<GlobalFilterState>({
    states: [],
    specialties: [],
    influencerType: null,
  });

  const handleKolSelect = useCallback((kolId: string) => {
    setSelectedKolId(kolId);
    setActiveTab('kol-profile');
  }, []);

  const handleGlobalFilterChange = useCallback((filters: GlobalFilterState) => {
    setGlobalFilters(filters);
  }, []);

  // Fetch disease areas for selector (scoped to user's access)
  const { data: diseaseAreasData } = useDashboardDiseaseAreas();
  const diseaseAreas = diseaseAreasData?.items || [];
  const currentDiseaseArea = diseaseAreas.find((da) => da.id === diseaseAreaId);

  // Fetch summary stats
  const { data: summary, isLoading: summaryLoading } = useInsightsSummary(diseaseAreaId);

  // Convert global filters to API format for passing to tabs
  const apiFilters = globalFiltersToApiFormat(globalFilters);

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
            <h1 className="text-2xl font-bold">Insights Dashboard</h1>
            <p className="text-muted-foreground">
              Comprehensive KOL analytics and leader rankings
            </p>
          </div>
        </div>

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

      {/* Global Filters */}
      <GlobalFilters
        diseaseAreaId={diseaseAreaId}
        onFilterChange={handleGlobalFilterChange}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total KOLs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryLoading ? '...' : (summary?.totalKols ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Respondents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryLoading ? '...' : (summary?.totalRespondents ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Nominations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryLoading ? '...' : (summary?.totalNominations ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Composite Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryLoading
                ? '...'
                : summary?.averageCompositeScore
                  ? summary.averageCompositeScore.toFixed(1)
                  : 'N/A'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5 print:hidden">
          <TabsTrigger value="kol-explorer" className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">KOL Explorer</span>
          </TabsTrigger>
          <TabsTrigger value="leader-rankings" className="flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            <span className="hidden sm:inline">Leader Rankings</span>
          </TabsTrigger>
          <TabsTrigger value="kol-profile" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">KOL Profile</span>
          </TabsTrigger>
          <TabsTrigger value="sociometric-summary" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Sociometric</span>
          </TabsTrigger>
          <TabsTrigger value="respondent-analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Analytics</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kol-explorer" className="mt-6">
          <KolExplorerTab
            diseaseAreaId={diseaseAreaId}
            onKolSelect={handleKolSelect}
            globalFilters={apiFilters}
          />
        </TabsContent>

        <TabsContent value="leader-rankings" className="mt-6">
          <LeaderRankingsTab
            diseaseAreaId={diseaseAreaId}
            onKolSelect={handleKolSelect}
            globalFilters={apiFilters}
          />
        </TabsContent>

        <TabsContent value="kol-profile" className="mt-6">
          <KolProfileTab
            diseaseAreaId={diseaseAreaId}
            initialKolId={selectedKolId}
            globalFilters={apiFilters}
          />
        </TabsContent>

        <TabsContent value="sociometric-summary" className="mt-6">
          <SociometricSummaryTab
            diseaseAreaId={diseaseAreaId}
            onKolSelect={handleKolSelect}
            globalFilters={apiFilters}
          />
        </TabsContent>

        <TabsContent value="respondent-analytics" className="mt-6">
          <RespondentAnalyticsTab
            diseaseAreaId={diseaseAreaId}
            globalFilters={apiFilters}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
