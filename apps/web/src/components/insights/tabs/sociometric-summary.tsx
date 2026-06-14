'use client';

import { useState, useCallback, useMemo } from 'react';
import { apiClient } from '@/lib/api';
import { ScoreTooltip } from '@/components/insights/score-tooltip';
import type { SociometricSummaryResponse } from '@kol360/shared';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, ChevronLeft, ChevronRight, FileSpreadsheet, Check, Filter } from 'lucide-react';
import { useSociometricSummary, useInsightsFilterOptions, useDemographics } from '@/hooks/use-insights-report';
import { useExcelExport } from '@/lib/excel-export';
import { SortableHeader } from '@/components/insights/shared/sortable-header';
import { HeatMapCell } from '@/components/insights/shared/heat-map-cell';
import { KolNameLink } from '@/components/insights/shared/kol-name-link';
import { RowsPerPage } from '@/components/insights/shared/rows-per-page';
import {
  ActiveFilter,
  ClearFiltersButton,
  ActiveFilterChips,
} from '@/components/insights/shared/filter-clear-controls';
import {
  RespondentFiltersBar,
  RespondentFiltersState,
  respondentFiltersToApiParams,
  hasAnyRespondentFilter as hasAnyResp,
} from '@/components/insights/shared/respondent-filters-bar';
import type { InsightsFilterInput } from '@kol360/shared';
import { cn, toTitleCase } from '@/lib/utils';

interface Props {
  diseaseAreaId: string;
  onKolSelect?: (kolId: string) => void;
  clientId?: string;
}

type SortField = 'name' | 'specialty' | 'influencerType' | 'city' | 'state' |
  'discussionLeaders' | 'referralLeaders' | 'adviceLeaders' | 'nationalLeaders' |
  'risingStars' | 'socialLeaders' | 'biasedLeaders' | 'total';

// v1.17.32: column order aligned with Leader Rankings + Sociometric
// Tables tabs (National-first), plus biasedLeaders added — was being
// returned by the API but never displayed in the matrix.
const NOMINATION_COLUMNS: {
  field: SortField;
  label: string;
  headerClass: string;
}[] = [
  { field: 'nationalLeaders', label: 'National', headerClass: 'bg-yellow-200 dark:bg-yellow-800 font-bold' },
  { field: 'discussionLeaders', label: 'Discussion', headerClass: 'bg-blue-200 dark:bg-blue-800 font-bold' },
  { field: 'adviceLeaders', label: 'Advice', headerClass: 'bg-purple-200 dark:bg-purple-800 font-bold' },
  { field: 'risingStars', label: 'Rising Star', headerClass: 'bg-pink-200 dark:bg-pink-800 font-bold' },
  { field: 'referralLeaders', label: 'Referral', headerClass: 'bg-green-200 dark:bg-green-800 font-bold' },
  { field: 'socialLeaders', label: 'Social', headerClass: 'bg-cyan-200 dark:bg-cyan-800 font-bold' },
  { field: 'biasedLeaders', label: 'Biased', headerClass: 'bg-red-200 dark:bg-red-800 font-bold' },
];

export function SociometricSummaryTab({ diseaseAreaId, onKolSelect, clientId }: Props) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sortBy, setSortBy] = useState<string>('total');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedInfluencerTypes, setSelectedInfluencerTypes] = useState<string[]>([]);
  // v1.17.5: respondent-side filters carried over from Demographics tab.
  const [respondentFilters, setRespondentFilters] = useState<RespondentFiltersState>({});

  const { data: filterOptions } = useInsightsFilterOptions(diseaseAreaId);
  // v1.17.5: source role/focus/practice-setting options from the
  // demographics aggregation (no-filter call). Cheap thanks to React
  // Query cache shared with the Demographics tab.
  const { data: demographicsData } = useDemographics(diseaseAreaId, clientId);
  const roleOptions = useMemo(
    () => (demographicsData?.byRole ?? []).map((d) => d.name).filter(Boolean).sort(),
    [demographicsData?.byRole]
  );
  const coreFocusOptions = useMemo(
    () => (demographicsData?.byCoreFocus ?? []).map((d) => d.name).filter(Boolean).sort(),
    [demographicsData?.byCoreFocus]
  );
  const practiceSettingOptions = useMemo(
    () => (demographicsData?.byPracticeSetting ?? []).map((d) => d.name).filter(Boolean).sort(),
    [demographicsData?.byPracticeSetting]
  );

  // Build API filters. Respondent filters merge into the same query string.
  // v1.17.31: arrays pass through as arrays — hook serializes as repeated
  // query params. See docs/findings/splitcsv-comma-bug-2026-06-09.md.
  const apiFilters: Partial<InsightsFilterInput> & Record<string, string | string[] | number | undefined> = {
    page,
    limit,
    sortBy,
    sortOrder,
    search: search || undefined,
    specialties: selectedSpecialties.length > 0 ? selectedSpecialties : undefined,
    states: selectedStates.length > 0 ? selectedStates : undefined,
    influencerTypes: selectedInfluencerTypes.length > 0 ? selectedInfluencerTypes : undefined,
    ...respondentFiltersToApiParams(respondentFilters),
  };

  const { data, isLoading } = useSociometricSummary(diseaseAreaId, apiFilters, clientId);
  const { status: excelExportStatus, exportExcel } = useExcelExport();

  const handleSort = useCallback((field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  }, [sortBy]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleMultiSelectChange = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (values: string[]) => {
    setter(values);
    setPage(1);
  };

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
  };

  // v1.17.3 + v1.17.5: chips for BOTH KOL-side filters (search,
  // specialty, state, influencer type) AND respondent-side filters
  // (role, focus, state of practice, practice setting, ranges).
  const activeFilters = useMemo<ActiveFilter[]>(() => {
    const entries: ActiveFilter[] = [];
    if (search.trim()) {
      entries.push({
        key: 'search',
        label: `Search: "${search}"`,
        onRemove: () => { setSearch(''); setPage(1); },
      });
    }
    for (const s of selectedSpecialties) {
      entries.push({
        key: `spec-${s}`,
        label: `Specialty: ${s}`,
        onRemove: () => { setSelectedSpecialties((prev) => prev.filter((x) => x !== s)); setPage(1); },
      });
    }
    for (const s of selectedStates) {
      entries.push({
        key: `state-${s}`,
        label: `State: ${s}`,
        onRemove: () => { setSelectedStates((prev) => prev.filter((x) => x !== s)); setPage(1); },
      });
    }
    for (const t of selectedInfluencerTypes) {
      entries.push({
        key: `type-${t}`,
        label: `Type: ${t}`,
        onRemove: () => { setSelectedInfluencerTypes((prev) => prev.filter((x) => x !== t)); setPage(1); },
      });
    }
    // Respondent-side chips.
    const respChip = (
      key: 'respondentRoles' | 'coreFocuses' | 'stateOfPractices' | 'practiceSettings',
      label: string
    ) => {
      for (const v of respondentFilters[key] ?? []) {
        entries.push({
          key: `${key}-${v}`,
          label: `${label}: ${v}`,
          onRemove: () => {
            setRespondentFilters((prev) => ({
              ...prev,
              [key]: (prev[key] ?? []).filter((x) => x !== v),
            }));
            setPage(1);
          },
        });
      }
    };
    respChip('respondentRoles', 'Resp Role');
    respChip('coreFocuses', 'Resp Focus');
    respChip('stateOfPractices', 'Resp State');
    respChip('practiceSettings', 'Resp Practice');
    const respRange = (
      keyMin: keyof RespondentFiltersState,
      keyMax: keyof RespondentFiltersState,
      label: string
    ) => {
      const min = respondentFilters[keyMin];
      const max = respondentFilters[keyMax];
      if (min === undefined && max === undefined) return;
      entries.push({
        key: `${String(keyMin)}-${min ?? ''}-${max ?? ''}`,
        label: `${label}: ${min ?? '0'}–${max ?? '∞'}`,
        onRemove: () => {
          setRespondentFilters((prev) => ({ ...prev, [keyMin]: undefined, [keyMax]: undefined }));
          setPage(1);
        },
      });
    };
    respRange('yearsMin', 'yearsMax', 'Years');
    respRange('monthlyPatientsMin', 'monthlyPatientsMax', 'Monthly patients');
    respRange('dedPatientsMin', 'dedPatientsMax', 'DED patients');
    return entries;
  }, [search, selectedSpecialties, selectedStates, selectedInfluencerTypes, respondentFilters]);

  const handleClearAllFilters = useCallback(() => {
    setSearch('');
    setSelectedSpecialties([]);
    setSelectedStates([]);
    setSelectedInfluencerTypes([]);
    setRespondentFilters({});
    setPage(1);
  }, []);

  // Respondent-filter onChange that resets pagination.
  const handleRespondentFiltersChange = useCallback((next: RespondentFiltersState) => {
    setRespondentFilters(next);
    setPage(1);
  }, []);

  // v1.17.32: Export the FULL list (was: only the current page). Re-fetches
  // with limit=5000 on click, applying every current filter (specialty/state/
  // influencer/respondent/search), then builds the export from that.
  // Column order mirrors the visible matrix: descriptors → Total → National →
  // Discussion → Advice → Rising Star → Referral → Social → Biased. NPI added.
  const handleExportAll = useCallback(async () => {
    if (!data?.items.length) return;

    // Build the same URL the visible query uses, with limit raised to 5000.
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
    const fullData = await apiClient.get<SociometricSummaryResponse>(
      `/api/v1/insights/${diseaseAreaId}/sociometric-summary?${params.toString()}`
    );
    const items = fullData?.items ?? [];
    if (items.length === 0) return;

    const headers = ['Rank', 'NPI', 'Name', 'Specialty', 'Influencer Type', 'City', 'State',
      'Total', 'National', 'Discussion', 'Advice', 'Rising Star', 'Referral', 'Social', 'Biased'];
    const rows = items.map((item, index) => [
      index + 1,
      (item as { npi?: string | null }).npi ?? '',
      item.name,
      item.specialty,
      item.influencerType,
      toTitleCase(item.city),
      item.state,
      item.total,
      item.nationalLeaders,
      item.discussionLeaders,
      item.adviceLeaders,
      item.risingStars,
      item.referralLeaders,
      item.socialLeaders,
      (item as { biasedLeaders?: number }).biasedLeaders ?? 0,
    ]);

    exportExcel({
      filename: 'sociometric-leaders',
      headers,
      rows,
      sheetName: 'Sociometric Leaders',
    });
  }, [data, apiFilters, clientId, diseaseAreaId, exportExcel]);

  const items = data?.items || [];

  // Compute max values for heat-map gradient per column
  const maxValues = {
    discussionLeaders: items.length > 0 ? Math.max(...items.map((i) => i.discussionLeaders)) : 1,
    referralLeaders: items.length > 0 ? Math.max(...items.map((i) => i.referralLeaders)) : 1,
    adviceLeaders: items.length > 0 ? Math.max(...items.map((i) => i.adviceLeaders)) : 1,
    nationalLeaders: items.length > 0 ? Math.max(...items.map((i) => i.nationalLeaders)) : 1,
    risingStars: items.length > 0 ? Math.max(...items.map((i) => i.risingStars)) : 1,
    socialLeaders: items.length > 0 ? Math.max(...items.map((i) => i.socialLeaders)) : 1,
    biasedLeaders: items.length > 0 ? Math.max(...items.map((i) => (i as { biasedLeaders?: number }).biasedLeaders ?? 0)) : 1,
    total: items.length > 0 ? Math.max(...items.map((i) => i.total)) : 1,
  };

  const startRow = (page - 1) * limit + 1;
  const endRow = Math.min(page * limit, data?.total || 0);
  const totalPages = data?.totalPages || 1;

  return (
    <Card className="shadow-md rounded-xl">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg font-bold">Sociometric Leaders</CardTitle>
            <CardDescription>
              Master table of all KOLs with nomination counts by type
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {/* v1.17.3: Clear filters surfaced for the first time on this tab. */}
            <ClearFiltersButton activeCount={activeFilters.length} onClear={handleClearAllFilters} />
            <Button
              variant="outline"
              size="default"
              onClick={handleExportAll}
              disabled={!items.length || excelExportStatus === 'exporting'}
            >
              {excelExportStatus === 'success' ? (
                <>
                  <Check className="h-4 w-4 mr-2 text-green-600" />
                  Exported!
                </>
              ) : (
                <>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export Excel
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KOL Filters — who the leader is. */}
        <div className="bg-muted/50 rounded-lg p-4 print:hidden space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter className="h-4 w-4" />
            <span>KOL Filters</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name..."
                className="pl-9"
                value={search}
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
              placeholder="All Influencer Types"
            />
          </div>
        </div>

        {/* v1.17.5: Respondent Filters — who's voting. Carried over from
            the Demographics tab; applies to nomination counts on the fly. */}
        <RespondentFiltersBar
          value={respondentFilters}
          onChange={handleRespondentFiltersChange}
          roleOptions={roleOptions}
          coreFocusOptions={coreFocusOptions}
          stateOptions={filterOptions?.states ?? []}
          practiceSettingOptions={practiceSettingOptions}
        />

        <ActiveFilterChips filters={activeFilters} />

        {/* Table */}
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2.5 text-left text-sm font-bold w-[50px]">#</th>
                <SortableHeader label="Name" field="name" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Specialty" field="specialty" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Influencer Type" field="influencerType" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="City" field="city" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="State" field="state" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                {/* v1.17.26: Total is the FIRST of the count columns
                    (right before Discussion / Referral / \u2026), not the
                    first column of the whole table. Default sort still
                    sortBy='total' sortOrder='desc'. */}
                <th
                  className={cn(
                    'cursor-pointer select-none px-3 py-2 text-center text-sm font-bold',
                    'hover:bg-muted/50 transition-colors bg-muted',
                    sortBy === 'total' && 'ring-1 ring-inset ring-foreground/20'
                  )}
                  onClick={() => handleSort('total')}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Total</span>
                    <span className={cn('text-xs', sortBy !== 'total' && 'text-muted-foreground/50')}>
                      {sortBy === 'total' ? (sortOrder === 'asc' ? '\u25B2' : '\u25BC') : '\u25B2'}
                    </span>
                  </div>
                </th>
                {NOMINATION_COLUMNS.map((col) => (
                  <th
                    key={col.field}
                    className={cn(
                      'cursor-pointer select-none px-3 py-2 text-center text-sm font-medium',
                      'hover:bg-muted/50 transition-colors',
                      col.headerClass,
                      sortBy === col.field && 'ring-1 ring-inset ring-foreground/20'
                    )}
                    onClick={() => handleSort(col.field)}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>{col.label}</span>
                      <span onClick={(e) => e.stopPropagation()}>
                        <ScoreTooltip type="category" />
                      </span>
                      <span className={cn('text-xs', sortBy !== col.field && 'text-muted-foreground/50')}>
                        {sortBy === col.field ? (sortOrder === 'asc' ? '\u25B2' : '\u25BC') : '\u25B2'}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={14} className="h-24 text-center text-muted-foreground">
                    Loading...
                  </td>
                </tr>
              ) : !items.length ? (
                <tr>
                  <td colSpan={14} className="h-24 text-center text-muted-foreground">
                    No data available
                  </td>
                </tr>
              ) : (
                items.map((item, index) => (
                  <tr key={item.hcpId} className="border-b last:border-b-0 hover:bg-muted/40 transition-colors even:bg-muted/10">
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">
                      {(page - 1) * limit + index + 1}
                    </td>
                    <td className="px-3 py-2">
                      <KolNameLink
                        name={item.name}
                        onClick={() => {
                          if (onKolSelect) onKolSelect(item.hcpId);
                          else console.log('KOL clicked:', item.hcpId);
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">{item.specialty || '-'}</td>
                    <td className="px-3 py-2">
                      {item.influencerType ? (
                        <Badge variant="outline" className="text-xs">
                          {item.influencerType}
                        </Badge>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-2">{toTitleCase(item.city) || '-'}</td>
                    <td className="px-3 py-2">{item.state || '-'}</td>
                    {/* Total: first of the count columns (matches header). */}
                    <td className="px-3 py-2 text-center tabular-nums font-bold bg-muted/30">
                      {item.total}
                    </td>
                    {/* v1.17.32: column order National → Discussion → Advice
                        → Rising Star → Referral → Social → Biased, mirrors
                        NOMINATION_COLUMNS above + the rest of Insights. */}
                    <HeatMapCell value={item.nationalLeaders} maxValue={maxValues.nationalLeaders} />
                    <HeatMapCell value={item.discussionLeaders} maxValue={maxValues.discussionLeaders} />
                    <HeatMapCell value={item.adviceLeaders} maxValue={maxValues.adviceLeaders} />
                    <HeatMapCell value={item.risingStars} maxValue={maxValues.risingStars} />
                    <HeatMapCell value={item.referralLeaders} maxValue={maxValues.referralLeaders} />
                    <HeatMapCell value={item.socialLeaders} maxValue={maxValues.socialLeaders} />
                    <HeatMapCell
                      value={(item as { biasedLeaders?: number }).biasedLeaders ?? 0}
                      maxValue={maxValues.biasedLeaders}
                    />
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <p className="text-sm text-muted-foreground">
              {data && data.total > 0
                ? `Showing ${startRow} to ${endRow} of ${data.total.toLocaleString()} KOLs`
                : 'No results'}
            </p>
            <RowsPerPage value={limit} onChange={handleLimitChange} />
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
