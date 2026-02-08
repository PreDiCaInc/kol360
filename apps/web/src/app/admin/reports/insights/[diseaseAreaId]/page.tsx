'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
import { useInsightsSummary, useInsightsFilterOptions } from '@/hooks/use-insights-report';
import { useDiseaseAreas } from '@/hooks/use-hcps';

// Tab components (will be implemented in subsequent phases)
import { KolExplorerTab } from '@/components/insights/tabs/kol-explorer';
import { LeaderRankingsTab } from '@/components/insights/tabs/leader-rankings';
import { KolProfileTab } from '@/components/insights/tabs/kol-profile';
import { SociometricSummaryTab } from '@/components/insights/tabs/sociometric-summary';
import { RespondentAnalyticsTab } from '@/components/insights/tabs/respondent-analytics';

export default function InsightsReportPage() {
  const params = useParams();
  const router = useRouter();
  const diseaseAreaId = params.diseaseAreaId as string;

  const [activeTab, setActiveTab] = useState('kol-explorer');

  // Fetch disease areas for selector
  const { data: diseaseAreas = [] } = useDiseaseAreas();
  const currentDiseaseArea = diseaseAreas.find((da) => da.id === diseaseAreaId);

  // Fetch summary stats
  const { data: summary, isLoading: summaryLoading } = useInsightsSummary(diseaseAreaId);

  const handleDiseaseAreaChange = (newDiseaseAreaId: string) => {
    router.push(`/admin/reports/insights/${newDiseaseAreaId}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">KOL 360 Insights Report</h1>
            <p className="text-muted-foreground">
              Comprehensive KOL analytics and leader rankings
            </p>
          </div>
        </div>

        {/* Disease Area Selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Disease Area:</span>
          <Select value={diseaseAreaId} onValueChange={handleDiseaseAreaChange}>
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
        <TabsList className="grid w-full grid-cols-5">
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
          <KolExplorerTab diseaseAreaId={diseaseAreaId} />
        </TabsContent>

        <TabsContent value="leader-rankings" className="mt-6">
          <LeaderRankingsTab diseaseAreaId={diseaseAreaId} />
        </TabsContent>

        <TabsContent value="kol-profile" className="mt-6">
          <KolProfileTab diseaseAreaId={diseaseAreaId} />
        </TabsContent>

        <TabsContent value="sociometric-summary" className="mt-6">
          <SociometricSummaryTab diseaseAreaId={diseaseAreaId} />
        </TabsContent>

        <TabsContent value="respondent-analytics" className="mt-6">
          <RespondentAnalyticsTab diseaseAreaId={diseaseAreaId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
