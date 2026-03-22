'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  ArrowLeft,
  Check,
  FileSpreadsheet,
} from 'lucide-react';
import { ScoreFiltersGrid } from '../score-range-filter';
import { SortableHeader } from '@/components/insights/shared/sortable-header';
import { KolNameLink } from '@/components/insights/shared/kol-name-link';
import { RowsPerPage } from '@/components/insights/shared/rows-per-page';
import { MetricBadge } from '@/components/insights/shared/metric-badge';
import { KolCombobox } from '../kol-combobox';
import { ScoreBreakdownChart } from '@/components/insights/charts/score-breakdown-chart';
import { NominationCountsChart } from '@/components/insights/charts/nomination-counts-chart';
import { PieDistributionChart } from '@/components/insights/charts/pie-distribution-chart';
import { StateBarChart } from '@/components/insights/charts/state-bar-chart';
import { BarDistributionChart } from '@/components/insights/charts/bar-distribution-chart';
import { useKolExplorer, useKolProfile, useInsightsFilterOptions, useKolNominationMetadata } from '@/hooks/use-insights-report';
import { useExcelExport } from '@/lib/excel-export';
import type { InsightsFilterInput, KolExplorerItem, NominationType } from '@kol360/shared';

interface Props {
  diseaseAreaId: string;
  initialKolId?: string | null;
  clientId?: string;
}

// --- Constants ---

const SCORE_COLUMNS = [
  { key: 'scorePublications', label: 'Pubs', short: 'Pubs' },
  { key: 'scoreTradePubs', label: 'Trade', short: 'Trade' },
  { key: 'scoreOrgLeadership', label: 'Org Lead', short: 'OrgLd' },
  { key: 'scoreOrgAwards', label: 'Awards', short: 'Awrd' },
  { key: 'scoreClinicalTrials', label: 'Trials', short: 'Trial' },
  { key: 'scoreConference', label: 'Conf', short: 'Conf' },
  { key: 'scoreSocialMedia', label: 'Social', short: 'Socl' },
  { key: 'scoreMediaPodcasts', label: 'Media', short: 'Media' },
  { key: 'scoreSurvey', label: 'Survey', short: 'Survy' },
] as const;

const NOMINATION_COLORS: Record<string, string> = {
  DISCUSSION_LEADERS: '#3B82F6',
  REFERRAL_LEADERS: '#10B981',
  ADVICE_LEADERS: '#8B5CF6',
  NATIONAL_LEADER: '#F59E0B',
  RISING_STAR: '#EC4899',
  SOCIAL_LEADER: '#06B6D4',
  REGIONAL_LEADER: '#64748B',
  BIASED_LEADER: '#EF4444',
};

const NOMINATION_TYPE_LABELS: Record<NominationType, string> = {
  DISCUSSION_LEADERS: 'Discussion',
  REFERRAL_LEADERS: 'Referral',
  ADVICE_LEADERS: 'Advice',
  NATIONAL_LEADER: 'National Leaders',
  RISING_STAR: 'Rising Stars',
  SOCIAL_LEADER: 'Social Media',
  REGIONAL_LEADER: 'Regional Leaders',
  BIASED_LEADER: 'Biased Leaders',
};

// --- Score Table View ---

function ScoreTableView({
  diseaseAreaId,
  onKolSelect,
}: {
  diseaseAreaId: string;
  onKolSelect: (kolId: string) => void;
}) {
  const [filters, setFilters] = useState<Partial<InsightsFilterInput>>({
    page: 1,
    limit: 25,
    sortBy: 'compositeScore',
    sortOrder: 'desc',
  });
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedInfluencerTypes, setSelectedInfluencerTypes] = useState<string[]>([]);
  const [showScoreFilters, setShowScoreFilters] = useState(false);

  const { data: filterOptions } = useInsightsFilterOptions(diseaseAreaId);

  const apiFilters = useMemo(() => ({
    ...filters,
    specialties: selectedSpecialties.length > 0 ? selectedSpecialties.join(',') : undefined,
    states: selectedStates.length > 0 ? selectedStates.join(',') : undefined,
    influencerTypes: selectedInfluencerTypes.length > 0 ? selectedInfluencerTypes.join(',') : undefined,
  }), [filters, selectedSpecialties, selectedStates, selectedInfluencerTypes]);

  const { data, isLoading } = useKolExplorer(diseaseAreaId, apiFilters);
  const { status: excelExportStatus, exportExcel } = useExcelExport();

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters((prev) => ({ ...prev, search: e.target.value, page: 1 }));
  };

  const handleMultiSelectChange = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (values: string[]) => {
    setter(values);
    setFilters((prev) => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  const handleLimitChange = (newLimit: number) => {
    setFilters((prev) => ({ ...prev, limit: newLimit, page: 1 }));
  };

  const handleScoreFilterChange = (key: string, min: number, max: number) => {
    setFilters((prev) => ({
      ...prev,
      [`${key}Min`]: min === 0 ? undefined : min,
      [`${key}Max`]: max === 100 ? undefined : max,
      page: 1,
    }));
  };

  const handleSort = (field: string) => {
    setFilters((prev) => {
      const currentSortBy = prev.sortBy || 'compositeScore';
      const currentOrder = prev.sortOrder || 'desc';
      if (currentSortBy === field) {
        return { ...prev, sortOrder: currentOrder === 'desc' ? 'asc' : 'desc', page: 1 };
      }
      const defaultOrder = field === 'name' ? 'asc' : 'desc';
      return { ...prev, sortBy: field, sortOrder: defaultOrder, page: 1 };
    });
  };

  const sortBy = filters.sortBy || 'compositeScore';
  const sortOrder = (filters.sortOrder || 'desc') as 'asc' | 'desc';
  const page = filters.page || 1;
  const limit = filters.limit || 25;

  // Export
  const handleExportExcel = useCallback(() => {
    if (!data?.items.length) return;
    const headers = [
      'Rank', 'Name', 'Specialty', 'Degree', 'City', 'State', 'Influencer Type',
      'Publications', 'Trade Pubs', 'Org Leadership', 'Org Awards', 'Clinical Trials',
      'Conference', 'Social Media', 'Media/Podcasts', 'Survey', 'Total Weighted Score',
    ];
    const rows = data.items.map((kol: KolExplorerItem, index: number) => [
      (page - 1) * limit + index + 1,
      kol.name,
      kol.specialty,
      kol.degree,
      kol.city,
      kol.state,
      kol.influencerType,
      kol.scorePublications?.toFixed(1),
      kol.scoreTradePubs?.toFixed(1),
      kol.scoreOrgLeadership?.toFixed(1),
      kol.scoreOrgAwards?.toFixed(1),
      kol.scoreClinicalTrials?.toFixed(1),
      kol.scoreConference?.toFixed(1),
      kol.scoreSocialMedia?.toFixed(1),
      kol.scoreMediaPodcasts?.toFixed(1),
      kol.scoreSurvey?.toFixed(1),
      kol.compositeScore?.toFixed(1),
    ]);
    exportExcel({ filename: 'kol-scores', headers, rows, sheetName: 'KOL Scores' });
  }, [data?.items, page, limit, exportExcel]);

  const startRow = (page - 1) * limit + 1;
  const endRow = data ? Math.min(page * limit, data.total) : 0;
  const totalPages = data?.totalPages || 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">KOL Weighted Score Table</h2>
          <p className="text-sm text-muted-foreground">
            All KOLs with their 9-dimension scores and total weighted score. Click a name to view profile.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportExcel}
          disabled={!data?.items.length || excelExportStatus === 'exporting'}
        >
          {excelExportStatus === 'success' ? (
            <><Check className="h-4 w-4 mr-2 text-green-600" />Exported!</>
          ) : (
            <><FileSpreadsheet className="h-4 w-4 mr-2" />Export Excel</>
          )}
        </Button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            className="pl-9"
            value={filters.search || ''}
            onChange={handleSearchChange}
          />
        </div>
        <MultiSelect
          options={filterOptions?.specialties || []}
          selected={selectedSpecialties}
          onChange={handleMultiSelectChange(setSelectedSpecialties)}
          placeholder="All Specialties"
        />
        <MultiSelect
          options={filterOptions?.states || []}
          selected={selectedStates}
          onChange={handleMultiSelectChange(setSelectedStates)}
          placeholder="All States"
        />
        <MultiSelect
          options={filterOptions?.influencerTypes || []}
          selected={selectedInfluencerTypes}
          onChange={handleMultiSelectChange(setSelectedInfluencerTypes)}
          placeholder="All Types"
        />
      </div>

      {/* Score Range Filters */}
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowScoreFilters(!showScoreFilters)}
          className="mb-2"
        >
          <SlidersHorizontal className="h-4 w-4 mr-2" />
          {showScoreFilters ? 'Hide Score Filters' : 'Show Score Filters (10 dimensions)'}
        </Button>
        {showScoreFilters && (
          <ScoreFiltersGrid filters={filters} onChange={handleScoreFilterChange} />
        )}
      </div>

      {/* Results Table */}
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm min-w-[1600px]">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2.5 text-left text-sm font-bold w-[50px] sticky left-0 bg-muted/50 z-10">#</th>
              <SortableHeader label="Name" field="name" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Specialty" field="specialty" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
              <th className="px-3 py-2 text-left text-sm font-medium">Degree</th>
              <th className="px-3 py-2 text-left text-sm font-medium">City</th>
              <SortableHeader label="State" field="state" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Type" field="influencerType" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
              {SCORE_COLUMNS.map((col) => (
                <SortableHeader
                  key={col.key}
                  label={col.label}
                  field={col.key}
                  currentSort={sortBy}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
              ))}
              <SortableHeader label="Total" field="compositeScore" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={17} className="h-32 text-center text-muted-foreground">Loading...</td>
              </tr>
            ) : !data?.items.length ? (
              <tr>
                <td colSpan={17} className="h-32 text-center text-muted-foreground">No KOLs found</td>
              </tr>
            ) : (
              data.items.map((kol, index) => (
                <tr key={kol.id} className="border-b last:border-b-0 hover:bg-muted/40 transition-colors even:bg-muted/10">
                  <td className="px-3 py-2 text-muted-foreground tabular-nums sticky left-0 bg-background">
                    {(page - 1) * limit + index + 1}
                  </td>
                  <td className="px-3 py-2 min-w-[180px]">
                    <KolNameLink name={kol.name} onClick={() => onKolSelect(kol.id)} />
                  </td>
                  <td className="px-3 py-2">{kol.specialty || '-'}</td>
                  <td className="px-3 py-2 text-center">
                    {kol.degree ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{kol.degree}</Badge>
                    ) : '-'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{kol.city || '-'}</td>
                  <td className="px-3 py-2">{kol.state || '-'}</td>
                  <td className="px-3 py-2">
                    {kol.influencerType ? (
                      <Badge
                        variant={
                          kol.influencerType === 'National Leaders' ? 'default' :
                          kol.influencerType === 'Rising Stars' ? 'secondary' : 'outline'
                        }
                        className="whitespace-nowrap text-[10px]"
                      >
                        {kol.influencerType}
                      </Badge>
                    ) : '-'}
                  </td>
                  {SCORE_COLUMNS.map((col) => (
                    <td key={col.key} className="px-3 py-2 text-right font-mono text-xs">
                      {(kol[col.key as keyof KolExplorerItem] as number | null)?.toFixed(1) ?? '-'}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-mono font-bold bg-muted/30">
                    {kol.compositeScore?.toFixed(1) ?? '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">
            {data && data.total > 0 ? `${startRow}-${endRow} of ${data.total.toLocaleString()}` : 'No results'}
          </span>
          <RowsPerPage value={limit} onChange={handleLimitChange} />
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePageChange(page - 1)} disabled={page <= 1}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-muted-foreground px-1">{page}/{totalPages}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Profile View ---

function ProfileView({
  diseaseAreaId,
  selectedKolId,
  onBack,
  onKolChange,
  clientId,
}: {
  diseaseAreaId: string;
  selectedKolId: string;
  onBack: () => void;
  onKolChange: (kolId: string) => void;
  clientId?: string;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllNominators, setShowAllNominators] = useState(false);
  const [nominatorSortField, setNominatorSortField] = useState<'name' | 'specialty' | 'state' | 'nominationType' | 'campaignName'>('name');
  const [nominatorSortOrder, setNominatorSortOrder] = useState<'asc' | 'desc'>('asc');
  const [stateSortField, setStateSortField] = useState<'name' | 'count'>('count');
  const [stateSortOrder, setStateSortOrder] = useState<'asc' | 'desc'>('desc');

  const { data: kolList, isLoading: isLoadingKols } = useKolExplorer(diseaseAreaId, {
    search: searchQuery,
    limit: 50,
    sortBy: 'compositeScore',
    sortOrder: 'desc',
  });

  const { data: profile, isLoading } = useKolProfile(diseaseAreaId, selectedKolId, clientId);
  const { data: nominationMeta } = useKolNominationMetadata(diseaseAreaId, selectedKolId, clientId);

  const handleSearchChange = useCallback((search: string) => {
    setSearchQuery(search);
  }, []);

  const handleKolChange = useCallback((kolId: string | null) => {
    if (kolId) {
      onKolChange(kolId);
      setShowAllNominators(false);
    }
  }, [onKolChange]);

  // Score breakdown data
  const scoreData = useMemo(() => {
    if (!profile) return [];
    return [
      { label: 'Peer-Reviewed Publications', value: profile.scores.scorePublications, color: '#3B82F6' },
      { label: 'Trade Publications', value: profile.scores.scoreTradePubs, color: '#14B8A6' },
      { label: 'Org Leadership', value: profile.scores.scoreOrgLeadership, color: '#EAB308' },
      { label: 'Org Awards', value: profile.scores.scoreOrgAwards, color: '#F97316' },
      { label: 'Clinical Trials', value: profile.scores.scoreClinicalTrials, color: '#06B6D4' },
      { label: 'Conference Educator', value: profile.scores.scoreConference, color: '#10B981' },
      { label: 'Social Media', value: profile.scores.scoreSocialMedia, color: '#EC4899' },
      { label: 'Media/Podcasts', value: profile.scores.scoreMediaPodcasts, color: '#6366F1' },
      { label: 'Sociometric Survey', value: profile.scores.scoreSurvey, color: '#EF4444' },
    ];
  }, [profile]);

  // Nomination counts data
  const nominationData = useMemo(() => {
    if (!profile) return [];
    return [
      { type: 'Discussion', count: profile.nominations.discussionLeaders, color: '#3B82F6' },
      { type: 'Referral', count: profile.nominations.referralLeaders, color: '#10B981' },
      { type: 'Advice', count: profile.nominations.adviceLeaders, color: '#8B5CF6' },
      { type: 'National', count: profile.nominations.nationalLeader, color: '#F59E0B' },
      { type: 'Rising Star', count: profile.nominations.risingStar, color: '#EC4899' },
      { type: 'Social', count: profile.nominations.socialLeader, color: '#06B6D4' },
    ];
  }, [profile]);

  // Nominator specialty pie data (aggregate into Ophthalmologist/Optometrist/Other)
  const specialtyPieData = useMemo(() => {
    if (!profile?.nominatorDemographics?.bySpecialty) return [];
    const groups: Record<string, number> = {};
    for (const s of profile.nominatorDemographics.bySpecialty) {
      const lower = s.name.toLowerCase();
      if (lower.includes('ophthalmolog')) {
        groups['Ophthalmologist'] = (groups['Ophthalmologist'] || 0) + s.count;
      } else if (lower.includes('optometrist') || lower.includes('optometry')) {
        groups['Optometrist'] = (groups['Optometrist'] || 0) + s.count;
      } else {
        groups['Other'] = (groups['Other'] || 0) + s.count;
      }
    }
    return Object.entries(groups)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [profile]);

  // State data for bar chart
  const stateBarData = useMemo(() => {
    if (!profile?.nominatorDemographics?.byState) return [];
    return profile.nominatorDemographics.byState
      .filter((s) => s.name !== 'Unknown')
      .map((s) => ({ name: s.name, count: s.count }));
  }, [profile]);

  // State data for table (sortable)
  const stateTableData = useMemo(() => {
    const sorted = [...stateBarData].sort((a, b) => {
      if (stateSortField === 'name') {
        return stateSortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      return stateSortOrder === 'asc' ? a.count - b.count : b.count - a.count;
    });
    return sorted;
  }, [stateBarData, stateSortField, stateSortOrder]);

  // Nomination metadata chart data
  const practiceSettingChartData = useMemo(() => {
    if (!nominationMeta?.byPracticeSetting) return [];
    return nominationMeta.byPracticeSetting.map((d) => ({ name: d.name, value: d.count }));
  }, [nominationMeta?.byPracticeSetting]);

  const coreFocusChartData = useMemo(() => {
    if (!nominationMeta?.byCoreFocus) return [];
    return nominationMeta.byCoreFocus.map((d) => ({ name: d.name, value: d.count }));
  }, [nominationMeta?.byCoreFocus]);

  const decileChartData = useMemo(() => {
    if (!nominationMeta?.byDecile) return [];
    return nominationMeta.byDecile.map((d) => ({ name: d.name, value: d.count }));
  }, [nominationMeta?.byDecile]);

  const dedPatientsChartData = useMemo(() => {
    if (!nominationMeta?.byDedPatients) return [];
    return nominationMeta.byDedPatients.map((d) => ({ name: d.name, value: d.count }));
  }, [nominationMeta?.byDedPatients]);

  const monthlyPatientsChartData = useMemo(() => {
    if (!nominationMeta?.byMonthlyPatients) return [];
    return nominationMeta.byMonthlyPatients.map((d) => ({ name: d.name, value: d.count }));
  }, [nominationMeta?.byMonthlyPatients]);

  const yearsChartData = useMemo(() => {
    if (!nominationMeta?.byYearsInPractice) return [];
    return nominationMeta.byYearsInPractice.map((d) => ({ name: d.name, value: d.count }));
  }, [nominationMeta?.byYearsInPractice]);

  const topicsDiscussedChartData = useMemo(() => {
    if (!nominationMeta?.topicsDiscussed) return [];
    return nominationMeta.topicsDiscussed.map((d) => ({ name: d.name, value: d.count }));
  }, [nominationMeta?.topicsDiscussed]);

  // Sorted nominators
  const sortedNominators = useMemo(() => {
    if (!profile?.nominators) return [];
    return [...profile.nominators].sort((a, b) => {
      const fieldA = a[nominatorSortField] ?? '';
      const fieldB = b[nominatorSortField] ?? '';
      if (typeof fieldA === 'string' && typeof fieldB === 'string') {
        return nominatorSortOrder === 'asc' ? fieldA.localeCompare(fieldB) : fieldB.localeCompare(fieldA);
      }
      return 0;
    });
  }, [profile?.nominators, nominatorSortField, nominatorSortOrder]);

  const displayedNominators = showAllNominators ? sortedNominators : sortedNominators.slice(0, 25);

  const handleNominatorSort = (field: typeof nominatorSortField) => {
    if (nominatorSortField === field) {
      setNominatorSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setNominatorSortField(field);
      setNominatorSortOrder('asc');
    }
  };

  const handleStateSort = (field: typeof stateSortField) => {
    if (stateSortField === field) {
      setStateSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setStateSortField(field);
      setStateSortOrder(field === 'count' ? 'desc' : 'asc');
    }
  };

  // KOL options for combobox
  const kolOptions = useMemo(() =>
    (kolList?.items || []).map((kol) => ({
      id: kol.id,
      name: `${kol.name} (${kol.compositeScore?.toFixed(1) ?? 'N/A'})`,
      specialty: kol.specialty,
      state: kol.state,
    })),
    [kolList?.items]
  );

  return (
    <div className="space-y-6">
      {/* Back button + KOL selector */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Score Table
        </Button>
        <div className="flex-1 max-w-md">
          <KolCombobox
            options={kolOptions}
            value={selectedKolId}
            onValueChange={handleKolChange}
            onSearchChange={handleSearchChange}
            isLoading={isLoadingKols}
            placeholder="Switch to another KOL..."
          />
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="h-64 flex items-center justify-center text-muted-foreground">
            Loading profile...
          </CardContent>
        </Card>
      ) : !profile ? (
        <Card>
          <CardContent className="h-64 flex items-center justify-center text-muted-foreground">
            Profile not found
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KOL Name Header */}
          <h2 className="text-4xl font-extrabold tracking-tight">{profile.name}</h2>

          {/* 4 Metric Badges */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/20 rounded-xl">
            <MetricBadge label="Influencer Type" value={profile.influencerType || 'Unknown'} color="bg-blue-600" />
            <MetricBadge label="Specialty" value={profile.specialty || 'Unknown'} color="bg-emerald-600" />
            <MetricBadge label="Total Weighted Score" value={profile.scores.compositeScore?.toFixed(1) ?? 'N/A'} color="bg-amber-600" />
            <MetricBadge label="State" value={profile.state || 'Unknown'} color="bg-purple-600" />
          </div>

          {/* Charts: Score Breakdown + Nomination Counts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-t-4 border-t-blue-500 shadow-md rounded-xl">
              <CardHeader>
                <CardTitle className="text-base font-bold">Score Breakdown (9 Dimensions)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ScoreBreakdownChart scores={scoreData} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-t-4 border-t-emerald-500 shadow-md rounded-xl">
              <CardHeader>
                <CardTitle className="text-base font-bold">Nomination Counts by Type</CardTitle>
                <CardDescription>Total nominations: {profile.nominations.total}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <NominationCountsChart nominations={nominationData} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts: Respondent Role Pie + State Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-t-4 border-t-purple-500 shadow-md rounded-xl">
              <CardHeader>
                <CardTitle className="text-base font-bold">Nominations by Respondent Role</CardTitle>
                <CardDescription>Specialty breakdown of nominating HCPs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <PieDistributionChart data={specialtyPieData} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-t-4 border-t-cyan-500 shadow-md rounded-xl">
              <CardHeader>
                <CardTitle className="text-base font-bold">Nominations by State</CardTitle>
                <CardDescription>Top states of nominating HCPs</CardDescription>
              </CardHeader>
              <CardContent>
                <div style={{ minHeight: 300 }}>
                  <StateBarChart data={stateBarData} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* State Nomination Count Table */}
          {stateTableData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">State Nomination Counts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border max-h-[400px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b">
                        <SortableHeader label="State" field="name" currentSort={stateSortField} currentOrder={stateSortOrder} onSort={(f) => handleStateSort(f as 'name' | 'count')} />
                        <SortableHeader label="Count" field="count" currentSort={stateSortField} currentOrder={stateSortOrder} onSort={(f) => handleStateSort(f as 'name' | 'count')} />
                      </tr>
                    </thead>
                    <tbody>
                      {stateTableData.map((s) => (
                        <tr key={s.name} className="border-b last:border-b-0 hover:bg-muted/30">
                          <td className="px-3 py-2">{s.name}</td>
                          <td className="px-3 py-2 font-mono">{s.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Nominators Table */}
          {profile.nominators && profile.nominators.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Nominators</CardTitle>
                    <CardDescription>
                      {showAllNominators
                        ? `All ${profile.nominators.length} nominators`
                        : `Showing ${Math.min(25, profile.nominators.length)} of ${profile.nominators.length} nominators`}
                    </CardDescription>
                  </div>
                  {profile.nominators.length > 25 && (
                    <Button variant="outline" size="sm" onClick={() => setShowAllNominators(!showAllNominators)}>
                      {showAllNominators ? 'Show Less' : 'Show All'}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border max-h-[600px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b">
                        <SortableHeader label="Name" field="name" currentSort={nominatorSortField} currentOrder={nominatorSortOrder} onSort={(f) => handleNominatorSort(f as typeof nominatorSortField)} />
                        <SortableHeader label="Specialty" field="specialty" currentSort={nominatorSortField} currentOrder={nominatorSortOrder} onSort={(f) => handleNominatorSort(f as typeof nominatorSortField)} />
                        <SortableHeader label="State" field="state" currentSort={nominatorSortField} currentOrder={nominatorSortOrder} onSort={(f) => handleNominatorSort(f as typeof nominatorSortField)} />
                        <SortableHeader label="Nomination Type" field="nominationType" currentSort={nominatorSortField} currentOrder={nominatorSortOrder} onSort={(f) => handleNominatorSort(f as typeof nominatorSortField)} />
                        <SortableHeader label="Campaign" field="campaignName" currentSort={nominatorSortField} currentOrder={nominatorSortOrder} onSort={(f) => handleNominatorSort(f as typeof nominatorSortField)} />
                      </tr>
                    </thead>
                    <tbody>
                      {displayedNominators.map((nominator, index) => (
                        <tr key={`${nominator.id}-${index}`} className="border-b last:border-b-0 hover:bg-muted/30">
                          <td className="px-3 py-2 font-medium">{nominator.name}</td>
                          <td className="px-3 py-2">{nominator.specialty || '-'}</td>
                          <td className="px-3 py-2">{nominator.state || '-'}</td>
                          <td className="px-3 py-2">
                            <Badge
                              variant="outline"
                              style={{
                                borderColor: NOMINATION_COLORS[nominator.nominationType] || '#888',
                                color: NOMINATION_COLORS[nominator.nominationType] || '#888',
                              }}
                            >
                              {NOMINATION_TYPE_LABELS[nominator.nominationType] || nominator.nominationType}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{nominator.campaignName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Nominator Demographics Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-t-4 border-t-violet-500 shadow-md rounded-xl">
              <CardHeader>
                <CardTitle className="text-base font-bold">Nominations by Practice Setting</CardTitle>
                <CardDescription>Practice setting of nominating HCPs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <BarDistributionChart data={practiceSettingChartData} color="#8B5CF6" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-t-4 border-t-cyan-500 shadow-md rounded-xl">
              <CardHeader>
                <CardTitle className="text-base font-bold">Nominations by Core Focus</CardTitle>
                <CardDescription>Core clinical focus of nominating HCPs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <BarDistributionChart data={coreFocusChartData} color="#06B6D4" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-t-4 border-t-amber-500 shadow-md rounded-xl">
              <CardHeader>
                <CardTitle className="text-base font-bold">Nominations by Treatment Decile</CardTitle>
                <CardDescription>Market decile of nominating HCPs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <BarDistributionChart data={decileChartData} color="#F59E0B" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-t-4 border-t-emerald-500 shadow-md rounded-xl">
              <CardHeader>
                <CardTitle className="text-base font-bold">Nominations by DED Patients</CardTitle>
                <CardDescription>Monthly DED patient volume of nominators</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <BarDistributionChart data={dedPatientsChartData} color="#10B981" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-t-4 border-t-blue-500 shadow-md rounded-xl">
              <CardHeader>
                <CardTitle className="text-base font-bold">Nominations by Total Monthly Patients</CardTitle>
                <CardDescription>Total monthly patient volume of nominators</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <BarDistributionChart data={monthlyPatientsChartData} color="#3B82F6" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-t-4 border-t-pink-500 shadow-md rounded-xl">
              <CardHeader>
                <CardTitle className="text-base font-bold">Nominations by Years in Practice</CardTitle>
                <CardDescription>Years of practice experience of nominators</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <BarDistributionChart data={yearsChartData} color="#EC4899" />
                </div>
              </CardContent>
            </Card>

            {topicsDiscussedChartData.length > 0 && (
              <Card className="border-t-4 border-t-red-500 shadow-md rounded-xl">
                <CardHeader>
                  <CardTitle className="text-base font-bold">Topics Discussed per KOL</CardTitle>
                  <CardDescription>Topics discussed by nominating HCPs</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <BarDistributionChart data={topicsDiscussedChartData} color="#EF4444" />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// --- Main Component ---

export function KolExplorerTab({ diseaseAreaId, initialKolId, clientId }: Props) {
  const [view, setView] = useState<'table' | 'profile'>(initialKolId ? 'profile' : 'table');
  const [selectedKolId, setSelectedKolId] = useState<string | null>(initialKolId ?? null);

  const handleKolSelect = useCallback((kolId: string) => {
    setSelectedKolId(kolId);
    setView('profile');
  }, []);

  const handleBack = useCallback(() => {
    setView('table');
  }, []);

  const handleKolChange = useCallback((kolId: string) => {
    setSelectedKolId(kolId);
  }, []);

  // When initialKolId changes (cross-tab navigation), switch to profile view
  useEffect(() => {
    if (initialKolId) {
      setSelectedKolId(initialKolId);
      setView('profile');
    }
  }, [initialKolId]);

  if (view === 'profile' && selectedKolId) {
    return (
      <ProfileView
        diseaseAreaId={diseaseAreaId}
        selectedKolId={selectedKolId}
        onBack={handleBack}
        onKolChange={handleKolChange}
        clientId={clientId}
      />
    );
  }

  return (
    <ScoreTableView
      diseaseAreaId={diseaseAreaId}
      onKolSelect={handleKolSelect}
    />
  );
}
