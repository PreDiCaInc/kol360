'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
// useRecalculateDiseaseAreaComposites removed in Phase 3 PR A — it backed a
// hardcoded-weights composite recalc that the KOL Analysis pipeline replaced.
import { useHcps, useHcpFilters, useDiseaseAreas } from '@/hooks/use-hcps';
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
// Calculator + Loader2 removed (only used by the deleted Recalculate Composites button).
import { Search, ChevronLeft, ChevronRight, AlertTriangle, RefreshCw, BarChart3, ArrowLeft, Upload, ClipboardList } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { SegmentScoreImportDialog } from '@/components/hcps/segment-score-import-dialog';
import { useAuth } from '@/lib/auth/auth-provider';
import { ColumnSelector } from '@/components/insights/column-selector';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { cn } from '@/lib/utils';

// 8 segment score columns + Survey + Composite (Overview tab)
const OVERVIEW_SCORE_COLUMNS = [
  { key: 'scorePublications', label: 'Research & Pubs' },
  { key: 'scoreClinicalTrials', label: 'Clinical Trials' },
  { key: 'scoreTradePubs', label: 'Trade Pubs' },
  { key: 'scoreOrgLeadership', label: 'Org Leadership' },
  { key: 'scoreOrgAwards', label: 'Org Awards' },
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
  { key: 'scoreNationalLeader', countKey: 'countNationalLeader', label: 'National Leaders' },
  { key: 'scoreRisingStar', countKey: 'countRisingStar', label: 'Rising Stars' },
  { key: 'scoreSocialLeader', countKey: 'countSocialLeader', label: 'Social Media Leaders' },
  { key: 'scoreRegionalLeader', countKey: 'countRegionalLeader', label: 'Regional Leaders' },
  { key: 'scoreBiasedLeader', countKey: 'countBiasedLeader', label: 'Biased Leaders' },
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
  scoreOrgAwards?: number | null;
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
  const { user, canWrite } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = searchParams.get('tab') === 'survey' ? 'survey' : 'overview';

  // v1.17.45 — PLATFORM_ADMIN-only. Data-team tool for raw-data
  // verification across clients; CLIENT_ADMIN's analytics surface is
  // Insights. Direct-URL nav redirects.
  useEffect(() => {
    if (user && user.role !== 'PLATFORM_ADMIN') {
      router.replace('/admin/hcps');
    }
  }, [user, router]);

  const [activeTab, setActiveTab] = useState<'overview' | 'survey'>(initialTab);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDiseaseAreaId, setSelectedDiseaseAreaId] = useState<string | null>(null);
  const [filters, setFilters] = useState<{
    query?: string;
    specialty?: string;
    state?: string;
    page: number;
    // v1.17.45 — server-side sort for Name / NPI / State / Specialty
    // (the simple Hcp-table columns). Score-column sort would need a
    // separate JOIN path on HcpDiseaseAreaScore — flagged as follow-up.
    sortBy?: 'name' | 'npi' | 'state' | 'specialty';
    sortOrder?: 'asc' | 'desc';
  }>({ page: 1, sortBy: 'name', sortOrder: 'asc' });

  const handleSort = (field: string) => {
    setFilters((prev) => {
      if (prev.sortBy !== field) {
        return { ...prev, sortBy: field as 'name' | 'npi' | 'state' | 'specialty', sortOrder: 'asc', page: 1 };
      }
      return { ...prev, sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc', page: 1 };
    });
  };

  // v1.17.45 — per-tab column visibility (localStorage-backed). Same
  // hook + UX as the Insights tables. Defaults to "everything visible";
  // user can hide whichever score columns they're not interested in.
  // 'npi' + 'name' aren't selectable — sticky anchors.
  const overviewColumnVisibility = useColumnVisibility(
    'hcp-scores.overview.columns',
    [],
  );
  const surveyColumnVisibility = useColumnVisibility(
    'hcp-scores.survey.columns',
    [],
  );
  const activeColumnVisibility =
    activeTab === 'overview' ? overviewColumnVisibility : surveyColumnVisibility;
  const isVisible = activeColumnVisibility.isVisible;
  const columnOptions =
    activeTab === 'overview'
      ? OVERVIEW_SCORE_COLUMNS.map((c) => ({ key: c.key, label: c.label }))
      : SURVEY_SCORE_COLUMNS.map((c) => ({ key: c.key, label: c.label }));

  const { data, isLoading, isError, error, refetch } = useHcps({
    ...filters,
    query: filters.query,
  });
  const { data: filterOptions } = useHcpFilters();
  const { data: diseaseAreas = [] } = useDiseaseAreas();

  // Set default disease area when loaded
  const activeDiseaseAreaId = selectedDiseaseAreaId || diseaseAreas[0]?.id;

  // handleRecalculateComposites removed in Phase 3 PR A — see Recalculate
  // button on /admin/kol-analysis/<id> for the modern, per-analysis recompute.

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
          {/* "Recalculate Composites" button removed in Phase 3 PR A — its
              endpoint used hardcoded weights (the bug KOL Analysis was built
              to fix). For per-analysis composite recompute, go to
              /admin/kol-analysis/<id> and click Recalculate. */}
          {/* v1.17.45 — column selector matches the Insights tables */}
          <ColumnSelector columns={columnOptions} visibility={activeColumnVisibility} />
          {canWrite && (
            <Button variant="outline" onClick={() => setShowImportDialog(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Import {activeTab === 'survey' ? 'Survey' : 'Segment'} Scores
            </Button>
          )}
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
                  {/* v1.17.45 — sticky NPI + Name anchors (mirrors the
                      Insights tables) + click-to-sort on the simple
                      columns. Sort state lives in `filters` and round-
                      trips through the /hcps endpoint (sortBy/sortOrder
                      added in v1.17.45). Score-column sort needs a
                      different code path (HcpDiseaseAreaScore JOIN); not
                      in this commit. */}
                  <TableHead
                    className="whitespace-nowrap sticky left-0 bg-card z-10 w-[120px] cursor-pointer select-none hover:bg-muted/50 transition-colors"
                    onClick={() => handleSort('npi')}
                  >
                    <span className="inline-flex items-center gap-1">
                      NPI
                      <span className={cn('text-xs', filters.sortBy !== 'npi' && 'text-muted-foreground/40')}>
                        {filters.sortBy === 'npi' ? (filters.sortOrder === 'asc' ? '▲' : '▼') : '▲'}
                      </span>
                    </span>
                  </TableHead>
                  <TableHead
                    className="whitespace-nowrap sticky left-[120px] bg-card z-10 cursor-pointer select-none hover:bg-muted/50 transition-colors"
                    onClick={() => handleSort('name')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Name
                      <span className={cn('text-xs', filters.sortBy !== 'name' && 'text-muted-foreground/40')}>
                        {filters.sortBy === 'name' ? (filters.sortOrder === 'asc' ? '▲' : '▼') : '▲'}
                      </span>
                    </span>
                  </TableHead>
                  <TableHead
                    className="whitespace-nowrap cursor-pointer select-none hover:bg-muted/50 transition-colors"
                    onClick={() => handleSort('specialty')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Specialty
                      <span className={cn('text-xs', filters.sortBy !== 'specialty' && 'text-muted-foreground/40')}>
                        {filters.sortBy === 'specialty' ? (filters.sortOrder === 'asc' ? '▲' : '▼') : '▲'}
                      </span>
                    </span>
                  </TableHead>
                  <TableHead
                    className="whitespace-nowrap cursor-pointer select-none hover:bg-muted/50 transition-colors"
                    onClick={() => handleSort('state')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Location
                      <span className={cn('text-xs', filters.sortBy !== 'state' && 'text-muted-foreground/40')}>
                        {filters.sortBy === 'state' ? (filters.sortOrder === 'asc' ? '▲' : '▼') : '▲'}
                      </span>
                    </span>
                  </TableHead>
                  {/* v1.17.45 — score columns filtered by visibility */}
                  {activeTab === 'overview' ? (
                    OVERVIEW_SCORE_COLUMNS.filter((col) => isVisible(col.key)).map((col) => (
                      <TableHead
                        key={col.key}
                        className="text-center whitespace-nowrap px-2"
                      >
                        {col.label}
                      </TableHead>
                    ))
                  ) : (
                    SURVEY_SCORE_COLUMNS.filter((col) => isVisible(col.key)).map((col) => (
                      <TableHead
                        key={col.key}
                        className="text-center whitespace-nowrap px-2"
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
                    {/* v1.17.45 — sticky NPI + Name cells. bg-card on the
                        cell so horizontal scroll content doesn't bleed
                        through. left offset on Name matches the NPI width. */}
                    <TableCell className="font-mono text-muted-foreground sticky left-0 bg-card w-[120px]">{hcp.npi}</TableCell>
                    <TableCell className="sticky left-[120px] bg-card whitespace-nowrap">
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
                    {/* v1.17.45 — score values filtered by visibility */}
                    {activeTab === 'overview' ? (
                      OVERVIEW_SCORE_COLUMNS.filter((col) => isVisible(col.key)).map((col) => {
                        const scoreStr = getOverviewScoreValue(hcp.diseaseAreaScores as DiseaseAreaScore[] | undefined, col.key);
                        const hasScore = scoreStr !== '—';
                        return (
                          <TableCell
                            key={col.key}
                            className={`text-center px-2 ${hasScore ? 'font-medium' : 'text-muted-foreground'}`}
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
                      SURVEY_SCORE_COLUMNS.filter((col) => isVisible(col.key)).map((col) => {
                        const { score, count } = getSurveyScoreValue(
                          hcp.diseaseAreaScores as DiseaseAreaScore[] | undefined,
                          col.key,
                          col.countKey
                        );
                        const hasScore = score !== '—';
                        return (
                          <TableCell
                            key={col.key}
                            className={`text-center px-2 ${hasScore ? 'font-medium' : 'text-muted-foreground'}`}
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
