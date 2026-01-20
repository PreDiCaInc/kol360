'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useHcps, useHcpFilters, useDiseaseAreas, useRecalculateDiseaseAreaComposites } from '@/hooks/use-hcps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, ChevronLeft, ChevronRight, AlertTriangle, RefreshCw, BarChart3, ArrowLeft, Upload, ClipboardList, Calculator, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { SegmentScoreImportDialog } from '@/components/hcps/segment-score-import-dialog';

// 8 segment score columns + Survey + Composite (Overview tab)
const OVERVIEW_SCORE_COLUMNS = [
  { key: 'scorePublications', label: 'Research & Pubs' },
  { key: 'scoreClinicalTrials', label: 'Clinical Trials' },
  { key: 'scoreTradePubs', label: 'Trade Pubs' },
  { key: 'scoreOrgLeadership', label: 'Org Leadership' },
  { key: 'scoreOrgAwareness', label: 'Org Awareness' },
  { key: 'scoreConference', label: 'Conference' },
  { key: 'scoreSocialMedia', label: 'Social Media' },
  { key: 'scoreMediaPodcasts', label: 'Media/Podcasts' },
  { key: 'scoreSurvey', label: 'Survey' },
  { key: 'compositeScore', label: 'Composite' },
] as const;

// 6 nomination type columns + Survey Score + Composite (Survey tab)
const SURVEY_SCORE_COLUMNS = [
  { key: 'scoreDiscussionLeaders', countKey: 'countDiscussionLeaders', label: 'Discussion Leaders' },
  { key: 'scoreReferralLeaders', countKey: 'countReferralLeaders', label: 'Referral Leaders' },
  { key: 'scoreAdviceLeaders', countKey: 'countAdviceLeaders', label: 'Advice Leaders' },
  { key: 'scoreNationalLeader', countKey: 'countNationalLeader', label: 'National Leader' },
  { key: 'scoreRisingStar', countKey: 'countRisingStar', label: 'Rising Star' },
  { key: 'scoreSocialLeader', countKey: 'countSocialLeader', label: 'Social Leader' },
  { key: 'scoreSurvey', countKey: 'totalNominationCount', label: 'Survey Score' },
  { key: 'compositeScore', countKey: null, label: 'Composite' },
] as const;

type OverviewScoreKey = typeof OVERVIEW_SCORE_COLUMNS[number]['key'];
type SurveyScoreKey = typeof SURVEY_SCORE_COLUMNS[number]['key'];
type SurveyCountKey = typeof SURVEY_SCORE_COLUMNS[number]['countKey'];

// Helper to get specialty display name
function getSpecialtyDisplay(hcp: { specialty?: string | null; specialties?: { isPrimary: boolean; specialty: { name: string } }[] }) {
  if (hcp.specialties && hcp.specialties.length > 0) {
    return hcp.specialties.map(s => s.specialty.name);
  }
  if (hcp.specialty) {
    return [hcp.specialty];
  }
  return [];
}

interface DiseaseAreaScore {
  id: string;
  compositeScore: number | null;
  scorePublications?: number | null;
  scoreClinicalTrials?: number | null;
  scoreTradePubs?: number | null;
  scoreOrgLeadership?: number | null;
  scoreOrgAwareness?: number | null;
  scoreConference?: number | null;
  scoreSocialMedia?: number | null;
  scoreMediaPodcasts?: number | null;
  scoreSurvey?: number | null;
  totalNominationCount?: number;
  scoreDiscussionLeaders?: number | null;
  countDiscussionLeaders?: number;
  scoreReferralLeaders?: number | null;
  countReferralLeaders?: number;
  scoreAdviceLeaders?: number | null;
  countAdviceLeaders?: number;
  scoreNationalLeader?: number | null;
  countNationalLeader?: number;
  scoreRisingStar?: number | null;
  countRisingStar?: number;
  scoreSocialLeader?: number | null;
  countSocialLeader?: number;
  diseaseArea: { id: string; name: string; code: string | null };
}

export default function HcpScoresPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = searchParams.get('tab') === 'survey' ? 'survey' : 'overview';

  const [activeTab, setActiveTab] = useState<'overview' | 'survey'>(initialTab);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDiseaseAreaId, setSelectedDiseaseAreaId] = useState<string | null>(null);
  const [filters, setFilters] = useState<{
    query?: string;
    specialty?: string;
    state?: string;
    page: number;
  }>({ page: 1 });

  const { data, isLoading, isError, error, refetch } = useHcps({
    ...filters,
    query: filters.query,
  });
  const { data: filterOptions } = useHcpFilters();
  const { data: diseaseAreas = [] } = useDiseaseAreas();
  const recalculateComposites = useRecalculateDiseaseAreaComposites();

  // Set default disease area when loaded
  const activeDiseaseAreaId = selectedDiseaseAreaId || diseaseAreas[0]?.id;

  const handleRecalculateComposites = async () => {
    if (!activeDiseaseAreaId) return;
    try {
      await recalculateComposites.mutateAsync(activeDiseaseAreaId);
      refetch();
    } catch (error) {
      console.error('Recalculate composites failed:', error);
    }
  };

  const hcps = data?.items || [];
  const pagination = data?.pagination;

  const getOverviewScoreValue = (
    scores: DiseaseAreaScore[] | undefined,
    scoreKey: OverviewScoreKey
  ): string => {
    if (!scores || !activeDiseaseAreaId) return '—';
    const daScore = scores.find((s) => s.diseaseArea.id === activeDiseaseAreaId);
    if (!daScore) return '—';
    const value = daScore[scoreKey as keyof DiseaseAreaScore];
    if (value === null || value === undefined) return '—';
    return Number(value).toFixed(1);
  };

  const getSurveyScoreValue = (
    scores: DiseaseAreaScore[] | undefined,
    scoreKey: SurveyScoreKey,
    countKey: SurveyCountKey
  ): { score: string; count: number | null } => {
    if (!scores || !activeDiseaseAreaId) return { score: '—', count: null };
    const daScore = scores.find((s) => s.diseaseArea.id === activeDiseaseAreaId);
    if (!daScore) return { score: '—', count: null };
    const value = daScore[scoreKey as keyof DiseaseAreaScore];
    const count = countKey ? (daScore[countKey as keyof DiseaseAreaScore] as number | undefined) : null;
    if (value === null || value === undefined) return { score: '—', count: count ?? null };
    return { score: Number(value).toFixed(1), count: count ?? null };
  };

  const handleSearch = () => {
    setFilters((prev) => ({ ...prev, query: searchQuery, page: 1 }));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as 'overview' | 'survey');
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'survey') {
      params.set('tab', 'survey');
    } else {
      params.delete('tab');
    }
    router.push(`/admin/hcps/scores?${params.toString()}`);
  };

  const selectedDiseaseArea = diseaseAreas.find(da => da.id === activeDiseaseAreaId);

  return (
    <div className="p-6 lg:p-8 fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link href="/admin/hcps">
                <Button variant="ghost" size="sm" className="gap-1 -ml-2">
                  <ArrowLeft className="w-4 h-4" />
                  HCPs
                </Button>
              </Link>
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">HCP Scores</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {activeTab === 'overview' ? 'Segment scores by disease area' : 'Nomination scores from survey responses'}
            </p>
          </div>
          {/* Inline Stats */}
          {!isLoading && pagination && (
            <div className="flex items-center gap-3 ml-4">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
                activeTab === 'survey'
                  ? 'bg-amber-500/10 border-amber-500/20'
                  : 'bg-primary/10 border-primary/20'
              }`}>
                <BarChart3 className={`w-4 h-4 ${activeTab === 'survey' ? 'text-amber-600' : 'text-primary'}`} />
                <span className="text-sm font-medium">{pagination.total.toLocaleString()} HCPs</span>
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleRecalculateComposites}
            disabled={!activeDiseaseAreaId || recalculateComposites.isPending}
          >
            {recalculateComposites.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Calculator className="w-4 h-4 mr-2" />
            )}
            Recalculate Composites
          </Button>
          <Button variant="outline" onClick={() => setShowImportDialog(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Import {activeTab === 'survey' ? 'Survey' : 'Segment'} Scores
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="mb-6">
        <TabsList>
          <TabsTrigger value="overview" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="survey" className="gap-2">
            <ClipboardList className="w-4 h-4" />
            Survey Scores
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Disease Area Selector + Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        {/* Disease Area Selector - Primary Filter */}
        <Select
          value={activeDiseaseAreaId || ''}
          onValueChange={(value) => setSelectedDiseaseAreaId(value)}
        >
          <SelectTrigger className={`w-56 bg-card ${activeTab === 'survey' ? 'border-amber-500/30' : 'border-primary/30'}`}>
            <SelectValue placeholder="Select Disease Area" />
          </SelectTrigger>
          <SelectContent>
            {diseaseAreas.map((da) => (
              <SelectItem key={da.id} value={da.id}>
                {da.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1 flex gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by NPI or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-9"
            />
          </div>
          <Button variant="outline" onClick={handleSearch} className="shrink-0">
            Search
          </Button>
        </div>

        <div className="flex flex-wrap gap-3">
          <Select
            value={filters.specialty || 'all'}
            onValueChange={(value) =>
              setFilters((prev) => ({
                ...prev,
                specialty: value === 'all' ? undefined : value,
                page: 1,
              }))
            }
          >
            <SelectTrigger className="w-48 bg-card">
              <SelectValue placeholder="All Specialties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Specialties</SelectItem>
              {filterOptions?.specialties?.map((specialty) => (
                <SelectItem key={specialty.id} value={specialty.name}>
                  {specialty.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.state || 'all'}
            onValueChange={(value) =>
              setFilters((prev) => ({
                ...prev,
                state: value === 'all' ? undefined : value,
                page: 1,
              }))
            }
          >
            <SelectTrigger className="w-36 bg-card">
              <SelectValue placeholder="All States" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {filterOptions?.states.map((state) => (
                <SelectItem key={state} value={state}>
                  {state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Show selected disease area name */}
      {selectedDiseaseArea && (
        <div className="mb-4 text-sm text-muted-foreground">
          Showing {activeTab === 'survey' ? 'survey ' : ''}scores for: <span className="font-medium text-foreground">{selectedDiseaseArea.name}</span>
        </div>
      )}

      {isLoading ? (
        <div className="bg-card rounded-xl border border-border/60 overflow-hidden">
          <div className="p-4 border-b border-border/60">
            <div className="h-4 w-24 skeleton rounded" />
          </div>
          {[...Array(8)].map((_, i) => (
            <div key={i} className="p-4 border-b border-border/40 last:border-0">
              <div className="flex items-center gap-4">
                <div className="h-4 w-24 skeleton rounded font-mono" />
                <div className="h-4 w-32 skeleton rounded" />
                <div className="h-5 w-20 skeleton rounded-full" />
                <div className="h-4 w-16 skeleton rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <Card className="border-destructive">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
            <h3 className="text-lg font-medium mb-2">Failed to load scores</h3>
            <p className="text-muted-foreground mb-4 text-center max-w-md">
              {error instanceof Error ? error.message : 'Unable to connect to the server.'}
            </p>
            <Button onClick={() => refetch()} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : !activeDiseaseAreaId ? (
        <div className="bg-card rounded-xl border border-border/60 p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">Select a Disease Area</h3>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
            Choose a disease area from the dropdown above to view HCP scores.
          </p>
        </div>
      ) : hcps.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/60 p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No scores found</h3>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
            {filters.query || filters.specialty || filters.state
              ? 'Try adjusting your search filters.'
              : activeTab === 'survey'
              ? 'Survey scores will appear here after surveys are completed.'
              : 'Import segment scores using the Import Scores button above.'}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto bg-card rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap sticky left-0 bg-card z-10">NPI</TableHead>
                  <TableHead className="whitespace-nowrap">Name</TableHead>
                  <TableHead className="whitespace-nowrap">Specialty</TableHead>
                  <TableHead className="whitespace-nowrap">Location</TableHead>
                  {/* Score columns based on active tab */}
                  {activeTab === 'overview' ? (
                    OVERVIEW_SCORE_COLUMNS.map((col) => (
                      <TableHead
                        key={col.key}
                        className="text-center whitespace-nowrap min-w-[80px]"
                      >
                        {col.label}
                      </TableHead>
                    ))
                  ) : (
                    SURVEY_SCORE_COLUMNS.map((col) => (
                      <TableHead
                        key={col.key}
                        className="text-center whitespace-nowrap min-w-[100px]"
                      >
                        {col.label}
                      </TableHead>
                    ))
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {hcps.map((hcp) => (
                  <TableRow key={hcp.id}>
                    <TableCell className="font-mono text-muted-foreground sticky left-0 bg-card">{hcp.npi}</TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/hcps/${hcp.id}`}
                        className="font-medium text-primary hover:text-primary/80 transition-colors"
                      >
                        {hcp.firstName} {hcp.lastName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const specialties = getSpecialtyDisplay(hcp);
                        return specialties.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {specialties.slice(0, 2).map((spec, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {spec}
                              </Badge>
                            ))}
                            {specialties.length > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{specialties.length - 2}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {hcp.city && hcp.state
                        ? `${hcp.city}, ${hcp.state}`
                        : hcp.state || '—'}
                    </TableCell>
                    {/* Score values based on active tab */}
                    {activeTab === 'overview' ? (
                      OVERVIEW_SCORE_COLUMNS.map((col) => {
                        const scoreStr = getOverviewScoreValue(hcp.diseaseAreaScores as DiseaseAreaScore[] | undefined, col.key);
                        const hasScore = scoreStr !== '—';
                        return (
                          <TableCell
                            key={col.key}
                            className={`text-center ${hasScore ? 'font-medium' : 'text-muted-foreground'}`}
                          >
                            {hasScore ? (
                              <span className={`inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded ${
                                col.key === 'compositeScore'
                                  ? 'bg-emerald-500/10 text-emerald-600'
                                  : col.key === 'scoreSurvey'
                                  ? 'bg-amber-500/10 text-amber-600'
                                  : 'bg-primary/10 text-primary'
                              }`}>
                                {scoreStr}
                              </span>
                            ) : (
                              scoreStr
                            )}
                          </TableCell>
                        );
                      })
                    ) : (
                      SURVEY_SCORE_COLUMNS.map((col) => {
                        const { score, count } = getSurveyScoreValue(
                          hcp.diseaseAreaScores as DiseaseAreaScore[] | undefined,
                          col.key,
                          col.countKey
                        );
                        const hasScore = score !== '—';
                        return (
                          <TableCell
                            key={col.key}
                            className={`text-center ${hasScore ? 'font-medium' : 'text-muted-foreground'}`}
                          >
                            {hasScore ? (
                              <div className="flex flex-col items-center">
                                <span className={`inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded ${
                                  col.key === 'compositeScore'
                                    ? 'bg-emerald-500/10 text-emerald-600'
                                    : col.key === 'scoreSurvey'
                                    ? 'bg-amber-500/10 text-amber-600'
                                    : 'bg-primary/10 text-primary'
                                }`}>
                                  {score}
                                </span>
                                {count !== null && count > 0 && (
                                  <span className="text-xs text-muted-foreground mt-0.5">
                                    ({count})
                                  </span>
                                )}
                              </div>
                            ) : (
                              score
                            )}
                          </TableCell>
                        );
                      })
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6 pt-4 border-t border-border/60">
              <div className="text-sm text-muted-foreground">
                Showing {hcps.length} of {pagination.total.toLocaleString()} HCPs
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => setFilters((prev) => ({ ...prev, page: prev.page - 1 }))}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm px-3">
                  Page {pagination.page} of {pagination.pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.pages}
                  onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <SegmentScoreImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        scoreType={activeTab === 'survey' ? 'survey' : 'segment'}
      />
    </div>
  );
}
