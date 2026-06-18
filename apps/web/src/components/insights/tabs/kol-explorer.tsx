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
import { ScoreTooltip } from '@/components/insights/score-tooltip';
import { ColumnSelector } from '@/components/insights/column-selector';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useAuth } from '@/lib/auth/auth-provider';
import { useImpersonation } from '@/lib/impersonation-context';

// v1.17.41 — column-visibility selector for the Weighted Score tab.
// Sticky # + Name are anchors and stay always visible. Defaults
// hide Degree + City (per pteam's polish request); user selections
// persist via localStorage under `insights.kol-explorer.columns`.
const KOL_EXPLORER_COLUMN_OPTIONS = [
  { key: 'specialty', label: 'Specialty' },
  { key: 'degree', label: 'Degree' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'influencerType', label: 'Type' },
  { key: 'compositeScore', label: 'Total' },
  { key: 'scorePublications', label: 'Publications' },
  { key: 'scoreTradePubs', label: 'Trade Pubs' },
  { key: 'scoreOrgLeadership', label: 'Org Lead' },
  { key: 'scoreOrgAwards', label: 'Awards' },
  { key: 'scoreClinicalTrials', label: 'Trials' },
  { key: 'scoreConference', label: 'Conf' },
  { key: 'scoreSocialMedia', label: 'Social Media' },
  { key: 'scoreMediaPodcasts', label: 'Media' },
  { key: 'scoreSurvey', label: 'Survey' },
] as const;
const KOL_EXPLORER_DEFAULT_HIDDEN = ['degree', 'city'];
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
import { useKolMatchCount } from '@/hooks/use-match-count';
import { ApplyFilterControls } from '@/components/insights/shared/apply-filter-controls';
import { useExcelExport } from '@/lib/excel-export';
import { toTitleCase } from '@/lib/utils';
import type { InsightsFilterInput, KolExplorerItem, KolExplorerResponse, NominationType } from '@kol360/shared';
import { apiClient } from '@/lib/api';
import {
  ActiveFilter,
  ActiveFilterChips,
} from '@/components/insights/shared/filter-clear-controls';

// Score filter keys (mirror the suffixes in score-range-filter.tsx). Kept
// here so the activeFilters builder doesn't have to know about every score
// dimension by name twice.
const SCORE_FILTER_KEYS = [
  'scorePublications',
  'scoreTradePubs',
  'scoreOrgLeadership',
  'scoreOrgAwards',
  'scoreClinicalTrials',
  'scoreConference',
  'scoreSocialMedia',
  'scoreMediaPodcasts',
  'scoreSurvey',
  'compositeScore',
] as const;

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

// v1.17.53 — Track B Apply Filters batch UX. KOL Explorer has the most
// dimensions: search, multi-select specialties/states/influencerTypes,
// plus 10 score-range filters. Page/limit/sort are view controls
// (re-fire immediately); the rest are "filters" gated on Apply.
interface AppliedKolExplorerFilters {
  search?: string;
  specialties: string[];
  states: string[];
  influencerTypes: string[];
  // Score ranges (Min/Max pairs) live in a flat record keyed by
  // `${field}Min` / `${field}Max` for direct splat into the API filter.
  scoreRanges: Record<string, number | undefined>;
}
const EMPTY_APPLIED_KOL: AppliedKolExplorerFilters = {
  search: undefined,
  specialties: [],
  states: [],
  influencerTypes: [],
  scoreRanges: {},
};

function arrayEq(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function ScoreTableView({
  diseaseAreaId,
  onKolSelect,
  clientId,
}: {
  diseaseAreaId: string;
  onKolSelect: (kolId: string) => void;
  clientId?: string;
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
  // v1.17.53: Apply snapshot. Everything that's a "filter" (not a view
  // control like page/limit/sort) lives here. apiFilters reads filters
  // from here so heavy aggregation only re-fires on Apply.
  const [appliedFilters, setAppliedFilters] = useState<AppliedKolExplorerFilters>(EMPTY_APPLIED_KOL);

  // v1.17.41 — per-table column visibility (localStorage-backed).
  // Sticky # + Name aren't in the options list — they're always shown.
  const columnVisibility = useColumnVisibility(
    'insights.kol-explorer.columns',
    KOL_EXPLORER_DEFAULT_HIDDEN
  );
  const isVisible = columnVisibility.isVisible;

  const { data: filterOptions } = useInsightsFilterOptions(diseaseAreaId);

  // v1.17.31: arrays pass through as arrays — hook serializes as repeated
  // query params (not CSV). See docs/findings/splitcsv-comma-bug-2026-06-09.md.
  // v1.17.53: filter dimensions read from `appliedFilters` (snapshot on
  // Apply); page/limit/sort/search are still drawn from `filters` —
  // search remains here for now since the existing onChange wiring goes
  // through `filters` but we override it from appliedFilters below.
  const apiFilters = useMemo<Partial<InsightsFilterInput>>(() => ({
    page: filters.page,
    limit: filters.limit,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    search: appliedFilters.search || undefined,
    specialties: appliedFilters.specialties.length > 0 ? appliedFilters.specialties : undefined,
    states: appliedFilters.states.length > 0 ? appliedFilters.states : undefined,
    influencerTypes: appliedFilters.influencerTypes.length > 0 ? appliedFilters.influencerTypes : undefined,
    ...appliedFilters.scoreRanges,
  }), [filters, appliedFilters]);

  const { data, isLoading } = useKolExplorer(diseaseAreaId, apiFilters, clientId);
  const { status: excelExportStatus, exportExcel } = useExcelExport();

  // v1.17.53 — Apply pattern: snapshot pending → applied, reset page.
  const pendingScoreRanges = useMemo<Record<string, number | undefined>>(() => {
    const o: Record<string, number | undefined> = {};
    for (const key of SCORE_FILTER_KEYS) {
      const minK = `${key}Min` as keyof InsightsFilterInput;
      const maxK = `${key}Max` as keyof InsightsFilterInput;
      const minV = filters[minK];
      const maxV = filters[maxK];
      if (minV !== undefined) o[`${key}Min`] = minV as number;
      if (maxV !== undefined) o[`${key}Max`] = maxV as number;
    }
    return o;
  }, [filters]);

  const isDirty = useMemo(() => {
    if ((filters.search ?? '') !== (appliedFilters.search ?? '')) return true;
    if (!arrayEq(selectedSpecialties, appliedFilters.specialties)) return true;
    if (!arrayEq(selectedStates, appliedFilters.states)) return true;
    if (!arrayEq(selectedInfluencerTypes, appliedFilters.influencerTypes)) return true;
    const a = pendingScoreRanges, b = appliedFilters.scoreRanges;
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let arr: string[] = [];
    allKeys.forEach((k) => arr.push(k));
    for (const k of arr) if (a[k] !== b[k]) return true;
    return false;
  }, [filters.search, selectedSpecialties, selectedStates, selectedInfluencerTypes, pendingScoreRanges, appliedFilters]);

  const hasActiveFilters = useMemo(
    () =>
      !!filters.search ||
      selectedSpecialties.length > 0 ||
      selectedStates.length > 0 ||
      selectedInfluencerTypes.length > 0 ||
      Object.keys(pendingScoreRanges).length > 0,
    [filters.search, selectedSpecialties, selectedStates, selectedInfluencerTypes, pendingScoreRanges]
  );

  const applyFilters = useCallback(() => {
    setAppliedFilters({
      search: filters.search,
      specialties: [...selectedSpecialties],
      states: [...selectedStates],
      influencerTypes: [...selectedInfluencerTypes],
      scoreRanges: { ...pendingScoreRanges },
    });
    setFilters((prev) => ({ ...prev, page: 1 }));
  }, [filters.search, selectedSpecialties, selectedStates, selectedInfluencerTypes, pendingScoreRanges]);

  const resetFilters = useCallback(() => {
    setFilters((prev) => {
      const next: Partial<InsightsFilterInput> = {
        page: 1,
        limit: prev.limit,
        sortBy: prev.sortBy,
        sortOrder: prev.sortOrder,
      };
      return next;
    });
    setSelectedSpecialties([]);
    setSelectedStates([]);
    setSelectedInfluencerTypes([]);
    setAppliedFilters(EMPTY_APPLIED_KOL);
  }, []);

  const matchCountFilters = useMemo<Record<string, unknown>>(() => ({
    search: filters.search || undefined,
    specialties: selectedSpecialties.length > 0 ? selectedSpecialties : undefined,
    states: selectedStates.length > 0 ? selectedStates : undefined,
    influencerTypes: selectedInfluencerTypes.length > 0 ? selectedInfluencerTypes : undefined,
    ...pendingScoreRanges,
  }), [filters.search, selectedSpecialties, selectedStates, selectedInfluencerTypes, pendingScoreRanges]);
  const matchCount = useKolMatchCount(diseaseAreaId, matchCountFilters, clientId, isDirty);
  const liveCount = isDirty ? matchCount.data?.count : data?.total;
  const countIsFetching = isDirty && matchCount.isFetching;

  // v1.17.3: Clear filters was missing from this surface entirely —
  // customers with active filters had no way to reset without page
  // refresh. Feeds the shared FilterClearControls used everywhere in
  // insights now.
  const activeFilters = useMemo<ActiveFilter[]>(() => {
    const entries: ActiveFilter[] = [];
    if (filters.search) {
      entries.push({
        key: 'search',
        label: `Search: "${filters.search}"`,
        onRemove: () => setFilters((prev) => ({ ...prev, search: undefined })),
      });
    }
    for (const s of selectedSpecialties) {
      entries.push({
        key: `spec-${s}`,
        label: `Specialty: ${s}`,
        onRemove: () => setSelectedSpecialties((prev) => prev.filter((x) => x !== s)),
      });
    }
    for (const s of selectedStates) {
      entries.push({
        key: `state-${s}`,
        label: `State: ${s}`,
        onRemove: () => setSelectedStates((prev) => prev.filter((x) => x !== s)),
      });
    }
    for (const t of selectedInfluencerTypes) {
      entries.push({
        key: `type-${t}`,
        label: `Type: ${t}`,
        onRemove: () => setSelectedInfluencerTypes((prev) => prev.filter((x) => x !== t)),
      });
    }
    for (const key of SCORE_FILTER_KEYS) {
      const minKey = `${key}Min` as keyof InsightsFilterInput;
      const maxKey = `${key}Max` as keyof InsightsFilterInput;
      const min = filters[minKey];
      const max = filters[maxKey];
      if (min === undefined && max === undefined) continue;
      entries.push({
        key: `${key}-range`,
        label: `${key}: ${min ?? 0}–${max ?? 100}`,
        onRemove: () => setFilters((prev) => ({ ...prev, [minKey]: undefined, [maxKey]: undefined })),
      });
    }
    return entries;
  }, [filters, selectedSpecialties, selectedStates, selectedInfluencerTypes]);

  // v1.17.53: handleClearAllFilters delegates to resetFilters.
  const handleClearAllFilters = resetFilters;

  // v1.17.53: filter onChange handlers no longer reset page —
  // page reset deferred to Apply.
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters((prev) => ({ ...prev, search: e.target.value }));
  };

  const handleMultiSelectChange = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (values: string[]) => {
    setter(values);
  };

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  const handleLimitChange = (newLimit: number) => {
    setFilters((prev) => ({ ...prev, limit: newLimit, page: 1 }));
  };

  // Score-range filter edits are pending too.
  const handleScoreFilterChange = (key: string, min: number, max: number) => {
    setFilters((prev) => ({
      ...prev,
      [`${key}Min`]: min === 0 ? undefined : min,
      [`${key}Max`]: max === 100 ? undefined : max,
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

  // v1.17.32: Export the FULL list (was: only the current page). Re-fetches
  // with limit=5000 on click, applying every current filter; NPI added.
  const handleExportExcel = useCallback(async () => {
    if (!data?.items.length) return;
    const params = new URLSearchParams();
    if (clientId) params.append('clientId', clientId);
    Object.entries({ ...apiFilters, limit: 5000, page: 1 }).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (Array.isArray(value)) {
        value.forEach((v) => params.append(key, String(v)));
      } else {
        params.append(key, String(value));
      }
    });
    const fullData = await apiClient.get<KolExplorerResponse>(
      `/api/v1/insights/${diseaseAreaId}/kol-explorer?${params.toString()}`
    );
    const items = fullData?.items ?? [];
    if (items.length === 0) return;

    const headers = [
      'Rank', 'NPI', 'Name', 'Specialty', 'Degree', 'City', 'State', 'Influencer Type',
      'Publications', 'Trade Pubs', 'Org Leadership', 'Org Awards', 'Clinical Trials',
      'Conference', 'Social Media', 'Media/Podcasts', 'Survey', 'Total Weighted Score',
    ];
    const rows = items.map((kol: KolExplorerItem, index: number) => [
      index + 1,
      (kol as { npi?: string | null }).npi ?? '',
      kol.name,
      kol.specialty,
      kol.degree,
      toTitleCase(kol.city),
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
  }, [data?.items, apiFilters, clientId, diseaseAreaId, exportExcel]);

  const startRow = (page - 1) * limit + 1;
  const endRow = data ? Math.min(page * limit, data.total) : 0;
  const totalPages = data?.totalPages || 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">KOL Weighted Score Table</h2>
          <p className="text-sm text-muted-foreground">
            All KOLs with their 9-dimension scores and total weighted score. Click a name to view profile.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* v1.17.45 — column selector + Export. v1.17.53 — Apply
              Filters + live count moved into the filter row below. */}
          <ColumnSelector
            columns={[...KOL_EXPLORER_COLUMN_OPTIONS]}
            visibility={columnVisibility}
          />
          <Button
            variant="outline"
            size="default"
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
      </div>

      {/* v1.17.53 — Apply Filters bar above the filter inputs. */}
      <div className="flex items-center justify-end gap-2 px-1">
        <ApplyFilterControls
          isDirty={isDirty}
          isLoading={isLoading}
          liveCount={liveCount}
          countIsFetching={countIsFetching}
          countLabel="KOLs match"
          hasActiveFilters={hasActiveFilters}
          onApply={applyFilters}
          onReset={resetFilters}
        />
      </div>

      {/* Filters */}
      <div
        className="grid grid-cols-1 md:grid-cols-4 gap-4"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && isDirty && (e.target as HTMLElement).tagName === 'INPUT') {
            e.preventDefault();
            applyFilters();
          }
        }}
      >
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
          placeholder="Influencer Type"
        />
      </div>

      <ActiveFilterChips filters={activeFilters} />

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
        {/* v1.17.41 — dropped hardcoded min-w-[1600px]: it forced the
            table to stay 1600px wide even when the column selector
            hid columns, defeating the point. Now sizes to content. */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {/* bg-muted (no /50) — opaque so columns scrolling under the
                  sticky # + Name cells don't bleed through visually. */}
              <th className="px-3 py-2.5 text-left text-sm font-bold w-[50px] sticky left-0 bg-muted z-10">#</th>
              {/* v1.17.40 — sticky Name column so horizontal scroll
                  leaves the name visible next to the # row indicator.
                  left-[50px] mirrors the # column width above. */}
              <SortableHeader
                label="Name"
                field="name"
                currentSort={sortBy}
                currentOrder={sortOrder}
                onSort={handleSort}
                className="sticky left-[50px] bg-muted z-10"
              />
              {isVisible('specialty') && (
                <SortableHeader label="Specialty" field="specialty" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
              )}
              {isVisible('degree') && (
                <th className="px-3 py-2 text-left text-sm font-medium">Degree</th>
              )}
              {isVisible('city') && (
                <th className="px-3 py-2 text-left text-sm font-medium">City</th>
              )}
              {isVisible('state') && (
                <SortableHeader label="State" field="state" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
              )}
              {isVisible('influencerType') && (
                <SortableHeader label="Type" field="influencerType" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
              )}
              {/* v1.17.26: Total is the FIRST of the score columns
                  (right before the per-segment scores), not the first
                  column of the whole table. Default sort still
                  sortBy='compositeScore' sortOrder='desc'. */}
              {isVisible('compositeScore') && (
                <SortableHeader
                  label="Total"
                  field="compositeScore"
                  currentSort={sortBy}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                  headerExtra={<ScoreTooltip type="composite" />}
                  className="px-2 text-center"
                />
              )}
              {/* v1.17.41 — tighter padding (px-2 vs px-3) on score
                  column headers + center-align so 9 narrow numeric
                  columns fit on a standard 13" laptop without
                  horizontal scroll when noise cols are hidden. */}
              {SCORE_COLUMNS.filter((col) => isVisible(col.key)).map((col) => (
                <SortableHeader
                  key={col.key}
                  label={col.label}
                  field={col.key}
                  currentSort={sortBy}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                  headerExtra={
                    col.key === 'scoreSurvey' ? <ScoreTooltip type="survey" /> : undefined
                  }
                  className="px-2 text-center"
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={25} className="h-32 text-center text-muted-foreground">Loading...</td>
              </tr>
            ) : !data?.items.length ? (
              <tr>
                <td colSpan={25} className="h-32 text-center text-muted-foreground">No KOLs found</td>
              </tr>
            ) : (
              data.items.map((kol, index) => (
                <tr key={kol.id} className="border-b last:border-b-0 hover:bg-muted/40 transition-colors even:bg-muted/10">
                  <td className="px-3 py-2 text-muted-foreground tabular-nums sticky left-0 bg-background">
                    {(page - 1) * limit + index + 1}
                  </td>
                  {/* v1.17.40 — sticky Name cell. left-[50px] matches
                      the # column width above. v1.17.41 — dropped
                      min-w-[180px] so the table can shrink when other
                      cols are hidden via the column selector. */}
                  <td className="px-3 py-2 sticky left-[50px] bg-background whitespace-nowrap">
                    <KolNameLink name={kol.name} onClick={() => onKolSelect(kol.id)} />
                  </td>
                  {isVisible('specialty') && (
                    <td className="px-3 py-2">{kol.specialty || '-'}</td>
                  )}
                  {isVisible('degree') && (
                    <td className="px-3 py-2 text-center">
                      {kol.degree ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{kol.degree}</Badge>
                      ) : '-'}
                    </td>
                  )}
                  {isVisible('city') && (
                    <td className="px-3 py-2 whitespace-nowrap">{toTitleCase(kol.city) || '-'}</td>
                  )}
                  {isVisible('state') && (
                    <td className="px-3 py-2">{kol.state || '-'}</td>
                  )}
                  {isVisible('influencerType') && (
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
                  )}
                  {/* Total: first of the score columns (matches header).
                      v1.17.41 — px-2 + center-align to match the tighter
                      headers. */}
                  {isVisible('compositeScore') && (
                    <td className="px-2 py-2 text-center font-mono font-bold bg-muted/30 tabular-nums">
                      {kol.compositeScore?.toFixed(1) ?? '-'}
                    </td>
                  )}
                  {SCORE_COLUMNS.filter((col) => isVisible(col.key)).map((col) => (
                    <td key={col.key} className="px-2 py-2 text-center font-mono text-xs tabular-nums">
                      {(kol[col.key as keyof KolExplorerItem] as number | null)?.toFixed(1) ?? '-'}
                    </td>
                  ))}
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
  // v1.17.45 — Campaign column on the Nominators table renders only
  // for PLATFORM_ADMIN. Client users (incl. impersonation) don't see
  // it; pteam decided campaign-participation visibility is admin-only.
  const { user } = useAuth();
  const { isImpersonating } = useImpersonation();
  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN' && !isImpersonating;
  const [showAllNominators, setShowAllNominators] = useState(false);
  // v1.17.47 — Excel export for the Nominators table. Same useExcelExport
  // hook + filename / sheetName pattern as the main 'Export Excel' on
  // the KOL Explorer tab. Includes ALL sorted nominators (not just the
  // currently-shown 25) since the customer's use case is offline review.
  const { status: nominatorsExportStatus, exportExcel: exportNominatorsExcel } = useExcelExport();
  // v1.17.45 — extended with 'npi'; campaignName stays sortable but
  // the column only renders for PLATFORM_ADMIN per pteam request.
  const [nominatorSortField, setNominatorSortField] = useState<'name' | 'npi' | 'specialty' | 'state' | 'nominationType' | 'campaignName'>('name');
  const [nominatorSortOrder, setNominatorSortOrder] = useState<'asc' | 'desc'>('asc');
  const [stateSortField, setStateSortField] = useState<'name' | 'count'>('count');
  const [stateSortOrder, setStateSortOrder] = useState<'asc' | 'desc'>('desc');

  const { data: kolList, isLoading: isLoadingKols } = useKolExplorer(diseaseAreaId, {
    search: searchQuery,
    limit: 50,
    sortBy: 'compositeScore',
    sortOrder: 'desc',
  }, clientId);

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
    // v1.15.31: display labels flipped to field-form (Optometry/Ophthalmology).
    // The .includes() matchers handle both shapes of legacy data.
    const groups: Record<string, number> = {};
    for (const s of profile.nominatorDemographics.bySpecialty) {
      const lower = s.name.toLowerCase();
      if (lower.includes('ophthalmolog')) {
        groups['Ophthalmology'] = (groups['Ophthalmology'] || 0) + s.count;
      } else if (lower.includes('optometrist') || lower.includes('optometry')) {
        groups['Optometry'] = (groups['Optometry'] || 0) + s.count;
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

  // v1.17.47 — Excel export of the Nominators table. Always exports
  // the FULL sortedNominators list (current sort applied) — not just
  // the 25 shown when Show All is collapsed. Campaign column included
  // only for PLATFORM_ADMIN, matching the on-screen role gate.
  const handleExportNominators = useCallback(() => {
    if (!sortedNominators.length) return;
    const headers = [
      'Rank',
      'Name',
      'NPI',
      'Specialty',
      'State',
      'Nomination Type',
      ...(isPlatformAdmin ? ['Campaign'] : []),
      'Responded At',
    ];
    const rows = sortedNominators.map((n, i) => [
      i + 1,
      n.name,
      n.npi ?? '',
      n.specialty ?? '',
      n.state ?? '',
      NOMINATION_TYPE_LABELS[n.nominationType as NominationType] || n.nominationType,
      ...(isPlatformAdmin ? [n.campaignName] : []),
      n.respondedAt,
    ]);
    const safeName = (profile?.name ?? 'kol')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    exportNominatorsExcel({
      filename: `${safeName}-nominators`,
      headers,
      rows,
      sheetName: 'Nominators',
    });
  }, [sortedNominators, isPlatformAdmin, profile?.name, exportNominatorsExcel]);

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
          {/* KOL Name Header + NPI inline.
              v1.17.46 — NPI added.
              v1.17.47 — NPI moved inline next to the name (pteam:
              'move the NPI next to the name — maybe smaller font —
              then below looks weird'). items-baseline aligns the
              small NPI text to the baseline of the hero h2.
              flex-wrap so long names with credentials still fit on
              narrow viewports. */}
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="text-4xl font-extrabold tracking-tight">{profile.name}</h2>
            {profile.npi && (
              <span className="text-sm font-mono text-muted-foreground tabular-nums">
                NPI {profile.npi}
              </span>
            )}
          </div>

          {/* 4 Metric Badges */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/20 rounded-xl">
            <MetricBadge label="Influencer Type" value={profile.influencerType || 'Unknown'} color="bg-blue-600" />
            <MetricBadge label="Specialty" value={profile.specialty || 'Unknown'} color="bg-emerald-600" />
            <MetricBadge
              label="Total Weighted Score"
              value={profile.scores.compositeScore?.toFixed(1) ?? 'N/A'}
              color="bg-amber-600"
              labelExtra={<ScoreTooltip type="composite" />}
            />
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

          {/* State Nomination Count Table - now integrated into StateBarChart toggle */}

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
                  {/* v1.17.47 — table actions: Export Excel always
                      visible; Show All/Less only when > 25 rows. */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportNominators}
                      disabled={!sortedNominators.length || nominatorsExportStatus === 'exporting'}
                    >
                      {nominatorsExportStatus === 'success' ? (
                        <><Check className="h-3.5 w-3.5 mr-1.5 text-green-600" />Exported!</>
                      ) : (
                        <><FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />Export Excel</>
                      )}
                    </Button>
                    {profile.nominators.length > 25 && (
                      <Button variant="outline" size="sm" onClick={() => setShowAllNominators(!showAllNominators)}>
                        {showAllNominators ? 'Show Less' : 'Show All'}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border max-h-[600px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b">
                        <SortableHeader label="Name" field="name" currentSort={nominatorSortField} currentOrder={nominatorSortOrder} onSort={(f) => handleNominatorSort(f as typeof nominatorSortField)} />
                        {/* v1.17.45 — NPI column added per pteam request */}
                        <SortableHeader label="NPI" field="npi" currentSort={nominatorSortField} currentOrder={nominatorSortOrder} onSort={(f) => handleNominatorSort(f as typeof nominatorSortField)} />
                        <SortableHeader label="Specialty" field="specialty" currentSort={nominatorSortField} currentOrder={nominatorSortOrder} onSort={(f) => handleNominatorSort(f as typeof nominatorSortField)} />
                        <SortableHeader label="State" field="state" currentSort={nominatorSortField} currentOrder={nominatorSortOrder} onSort={(f) => handleNominatorSort(f as typeof nominatorSortField)} />
                        <SortableHeader label="Nomination Type" field="nominationType" currentSort={nominatorSortField} currentOrder={nominatorSortOrder} onSort={(f) => handleNominatorSort(f as typeof nominatorSortField)} />
                        {/* v1.17.45 — Campaign column hidden for client
                            users (CLIENT_ADMIN + impersonation). pteam:
                            campaign-participation visibility is
                            PLATFORM_ADMIN-only. */}
                        {isPlatformAdmin && (
                          <SortableHeader label="Campaign" field="campaignName" currentSort={nominatorSortField} currentOrder={nominatorSortOrder} onSort={(f) => handleNominatorSort(f as typeof nominatorSortField)} />
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {displayedNominators.map((nominator, index) => (
                        <tr key={`${nominator.id}-${index}`} className="border-b last:border-b-0 hover:bg-muted/30">
                          {/* v1.17.47 — nominator name links to their KOL
                              Profile only when hasScores is true (i.e.
                              they have an HcpAnalysisScore row in this
                              analysis — their profile would render
                              usefully). Otherwise plain text since
                              their profile would be empty. */}
                          <td className="px-3 py-2 font-medium">
                            {nominator.hasScores ? (
                              <button
                                type="button"
                                onClick={() => handleKolChange(nominator.id)}
                                className="text-primary hover:underline focus:outline-none focus:underline text-left"
                              >
                                {nominator.name}
                              </button>
                            ) : (
                              nominator.name
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs tabular-nums">{nominator.npi || '-'}</td>
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
                          {isPlatformAdmin && (
                            <td className="px-3 py-2 text-muted-foreground">{nominator.campaignName}</td>
                          )}
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
      clientId={clientId}
    />
  );
}
