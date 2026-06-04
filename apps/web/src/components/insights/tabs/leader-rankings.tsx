'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useLeaderRankings, useInsightsFilterOptions, useDemographics } from '@/hooks/use-insights-report';
import { LeaderTable } from '@/components/insights/tables/leader-table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { Filter, Search } from 'lucide-react';
import {
  RespondentFiltersBar,
  RespondentFiltersState,
  respondentFiltersToApiParams,
} from '@/components/insights/shared/respondent-filters-bar';
import {
  ActiveFilter,
  ClearFiltersButton,
  ActiveFilterChips,
} from '@/components/insights/shared/filter-clear-controls';
import type { NominationType } from '@kol360/shared';
import type { LeaderTableColumn } from '@/components/insights/tables/leader-table';

interface Props {
  diseaseAreaId: string;
  onKolSelect?: (kolId: string) => void;
  clientId?: string;
}

interface LeaderFilters {
  // v1.17.4: multi-select (was single-select). Backend accepts comma-
  // separated `specialties` / `states` via the leader-rankings query params.
  specialties?: string[];
  states?: string[];
}

const NOMINATION_TYPES: {
  value: NominationType;
  label: string;
  color: string;
}[] = [
  { value: 'NATIONAL_LEADER', label: 'National Leaders', color: 'bg-yellow-600' },
  { value: 'DISCUSSION_LEADERS', label: 'Discussion Leaders', color: 'bg-blue-500' },
  { value: 'ADVICE_LEADERS', label: 'Advice Leaders', color: 'bg-purple-500' },
  { value: 'RISING_STAR', label: 'Rising Stars', color: 'bg-pink-500' },
  { value: 'REFERRAL_LEADERS', label: 'Referral Leaders', color: 'bg-green-500' },
  { value: 'SOCIAL_LEADER', label: 'Social Media Leaders', color: 'bg-cyan-500' },
  { value: 'BIASED_LEADER', label: 'Biased Leaders', color: 'bg-red-500' },
];

// v1.17.24: Count moved to first column (matches the Sociometric Leaders
// page change for consistency across leader-style tables).
const COLUMNS: LeaderTableColumn[] = ['count', 'name', 'specialty', 'city', 'state'];

function LeaderRankingPanel({
  diseaseAreaId,
  nominationType,
  label,
  color,
  onKolSelect,
  clientId,
  filters,
  respondentFilters,
  searchTerm,
  onSearchChange,
}: {
  diseaseAreaId: string;
  nominationType: NominationType;
  label: string;
  color: string;
  onKolSelect?: (kolId: string) => void;
  clientId?: string;
  filters: LeaderFilters;
  respondentFilters: RespondentFiltersState;
  searchTerm: string;
  onSearchChange: (value: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [sortBy, setSortBy] = useState('count');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Build API options with filters. v1.17.4: arrays serialize as
  // comma-separated `specialties` / `states` (matches KOL Explorer pattern).
  // v1.17.5: respondent filters merge in via the shared serializer.
  const apiOptions = useMemo(() => {
    const opts: Record<string, string | number | undefined> = { page, limit };
    if (filters.specialties && filters.specialties.length > 0) {
      opts.specialties = filters.specialties.join(',');
    }
    if (filters.states && filters.states.length > 0) {
      opts.states = filters.states.join(',');
    }
    Object.assign(opts, respondentFiltersToApiParams(respondentFilters));
    return opts;
  }, [page, limit, filters, respondentFilters]);

  const { data, isLoading } = useLeaderRankings(diseaseAreaId, nominationType, apiOptions, clientId);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [filters.specialties, filters.states, respondentFilters]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
  };

  const rawItems = (data?.items || []).map((item) => ({
    rank: item.rank,
    name: item.name,
    hcpId: item.hcpId,
    specialty: item.specialty,
    city: item.city,
    state: item.state,
    count: item.count,
  }));

  // Client-side sorting (API returns sorted by count desc)
  const sortedItems = [...rawItems].sort((a, b) => {
    const field = sortBy as keyof typeof a;
    const aVal = a[field] ?? '';
    const bVal = b[field] ?? '';
    const cmp = typeof aVal === 'number' && typeof bVal === 'number'
      ? aVal - bVal
      : String(aVal).localeCompare(String(bVal));
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  // Client-side name filter
  const items = useMemo(() => {
    if (!searchTerm.trim()) return sortedItems;
    const term = searchTerm.toLowerCase();
    return sortedItems.filter(item => item.name.toLowerCase().includes(term));
  }, [sortedItems, searchTerm]);

  // Re-assign ranks after sorting/filtering
  items.forEach((item, i) => { item.rank = (page - 1) * limit + i + 1; });

  const maxCount = items.length > 0 ? Math.max(...items.map((i) => i.count)) : 1;

  return (
    <div className="space-y-2">
      {/* KOL name search for this panel */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder={`Search ${label}...`}
          className="h-8 pl-8 text-xs"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <LeaderTable
        title={label}
        titleColor={color}
        items={items}
        columns={COLUMNS}
        total={data?.total || 0}
        page={page}
        limit={limit}
        totalPages={data?.totalPages || 1}
        isLoading={isLoading}
        onPageChange={setPage}
        onLimitChange={handleLimitChange}
        onSort={handleSort}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onKolClick={(hcpId) => {
          if (onKolSelect) onKolSelect(hcpId);
          else console.log('KOL clicked:', hcpId);
        }}
        maxCount={maxCount}
      />
    </div>
  );
}

export function LeaderRankingsTab({ diseaseAreaId, onKolSelect, clientId }: Props) {
  const [filters, setFilters] = useState<LeaderFilters>({});
  // v1.17.5: respondent-side filters carried over from Demographics.
  const [respondentFilters, setRespondentFilters] = useState<RespondentFiltersState>({});
  const { data: filterOptions } = useInsightsFilterOptions(diseaseAreaId);
  // Source respondent-filter options from the demographics aggregation.
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

  // Per-panel search terms
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});

  const handleSearchChange = useCallback((nominationType: string, value: string) => {
    setSearchTerms(prev => ({ ...prev, [nominationType]: value }));
  }, []);

  const handleClearAll = useCallback(() => {
    setFilters({});
    setSearchTerms({});
    setRespondentFilters({});
  }, []);

  // v1.17.3 + v1.17.4: feed the shared FilterClearControls. Each selected
  // multi-select value gets its own chip. Search-per-panel is captured as a
  // single chip per panel that has text.
  const activeFilters = useMemo<ActiveFilter[]>(() => {
    const entries: ActiveFilter[] = [];
    for (const s of filters.specialties ?? []) {
      entries.push({
        key: `specialty-${s}`,
        label: `Specialty: ${s}`,
        onRemove: () =>
          setFilters((prev) => ({
            ...prev,
            specialties: (prev.specialties ?? []).filter((v) => v !== s),
          })),
      });
    }
    for (const s of filters.states ?? []) {
      entries.push({
        key: `state-${s}`,
        label: `State: ${s}`,
        onRemove: () =>
          setFilters((prev) => ({
            ...prev,
            states: (prev.states ?? []).filter((v) => v !== s),
          })),
      });
    }
    for (const [nominationType, term] of Object.entries(searchTerms)) {
      if (term.trim()) {
        entries.push({
          key: `search-${nominationType}`,
          label: `Search (${nominationType}): "${term}"`,
          onRemove: () =>
            setSearchTerms((prev) => {
              const next = { ...prev };
              delete next[nominationType];
              return next;
            }),
        });
      }
    }
    // v1.17.5: respondent-side chips.
    const respChip = (
      key: 'respondentRoles' | 'coreFocuses' | 'stateOfPractices' | 'practiceSettings',
      label: string
    ) => {
      for (const v of respondentFilters[key] ?? []) {
        entries.push({
          key: `${key}-${v}`,
          label: `${label}: ${v}`,
          onRemove: () =>
            setRespondentFilters((prev) => ({
              ...prev,
              [key]: (prev[key] ?? []).filter((x) => x !== v),
            })),
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
        onRemove: () =>
          setRespondentFilters((prev) => ({ ...prev, [keyMin]: undefined, [keyMax]: undefined })),
      });
    };
    respRange('yearsMin', 'yearsMax', 'Years');
    respRange('monthlyPatientsMin', 'monthlyPatientsMax', 'Monthly patients');
    respRange('dedPatientsMin', 'dedPatientsMax', 'DED patients');
    return entries;
  }, [filters, searchTerms, respondentFilters]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">KOL360 Leaders</h2>
        <p className="text-sm text-muted-foreground">
          Top leaders ranked by nomination count across 6 categories
        </p>
      </div>

      {/* Filter Bar */}
      <div className="bg-muted/50 rounded-lg p-4 print:hidden">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter className="h-4 w-4" />
            <span>Leader Filters</span>
          </div>
          {/* v1.17.3: shared FilterClearControls — see filter-clear-controls.tsx. */}
          <ClearFiltersButton activeCount={activeFilters.length} onClear={handleClearAll} />
        </div>

        {/* v1.17.4: multi-select Specialty + State (was single-select). */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">KOL Specialty</Label>
            <MultiSelect
              options={filterOptions?.specialties ?? []}
              selected={filters.specialties ?? []}
              onChange={(values) =>
                setFilters((prev) => ({
                  ...prev,
                  specialties: values.length > 0 ? values : undefined,
                }))
              }
              placeholder="All Specialties"
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">KOL State</Label>
            <MultiSelect
              options={filterOptions?.states ?? []}
              selected={filters.states ?? []}
              onChange={(values) =>
                setFilters((prev) => ({
                  ...prev,
                  states: values.length > 0 ? values : undefined,
                }))
              }
              placeholder="All States"
            />
          </div>
        </div>
      </div>

      {/* v1.17.5: Respondent Filters — who's voting. Carried over from
          the Demographics tab; applies to leader counts on the fly. */}
      <RespondentFiltersBar
        value={respondentFilters}
        onChange={setRespondentFilters}
        roleOptions={roleOptions}
        coreFocusOptions={coreFocusOptions}
        stateOptions={filterOptions?.states ?? []}
        practiceSettingOptions={practiceSettingOptions}
      />

      {/* Combined chip row covers both KOL-side and respondent-side filters. */}
      <ActiveFilterChips filters={activeFilters} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {NOMINATION_TYPES.map((type) => (
          <LeaderRankingPanel
            key={type.value}
            diseaseAreaId={diseaseAreaId}
            nominationType={type.value}
            label={type.label}
            color={type.color}
            onKolSelect={onKolSelect}
            clientId={clientId}
            filters={filters}
            respondentFilters={respondentFilters}
            searchTerm={searchTerms[type.value] || ''}
            onSearchChange={(v) => handleSearchChange(type.value, v)}
          />
        ))}
      </div>
    </div>
  );
}
