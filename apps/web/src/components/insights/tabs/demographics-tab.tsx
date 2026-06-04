'use client';

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PieDistributionChart } from '@/components/insights/charts/pie-distribution-chart';
import { BarDistributionChart } from '@/components/insights/charts/bar-distribution-chart';
import { StateBarChart } from '@/components/insights/charts/state-bar-chart';
import { StackedBarChart } from '@/components/insights/charts/stacked-bar-chart';
import { useDemographics, useInsightsFilterOptions } from '@/hooks/use-insights-report';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { Filter } from 'lucide-react';
import {
  ActiveFilter,
  ClearFiltersButton,
  ActiveFilterChips,
} from '@/components/insights/shared/filter-clear-controls';

interface Props {
  diseaseAreaId: string;
  clientId?: string;
}

interface DemographicFilters {
  // v1.17.4: the 4 categorical filters are multi-select arrays (was single
  // string). Backend accepts comma-separated values via the same query
  // param name (`respondentRoles=A,B,C`).
  respondentRoles?: string[];
  coreFocuses?: string[];
  stateOfPractices?: string[];
  practiceSettings?: string[];
  yearsMin?: number;
  yearsMax?: number;
  monthlyPatientsMin?: number;
  monthlyPatientsMax?: number;
  dedPatientsMin?: number;
  dedPatientsMax?: number;
}

// US states for the state dropdown
const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [value, delay]);

  return debouncedValue;
}

export function DemographicsTab({ diseaseAreaId, clientId }: Props) {
  const [filters, setFilters] = useState<DemographicFilters>({});
  const debouncedFilters = useDebounce(filters, 500);

  // Build the API filter object (only include defined values).
  // v1.17.4: arrays serialize as comma-separated strings.
  const apiFilters = useMemo(() => {
    const result: Record<string, string | number | undefined> = {};
    const csv = (arr?: string[]): string | undefined =>
      arr && arr.length > 0 ? arr.join(',') : undefined;
    if (csv(debouncedFilters.respondentRoles)) result.respondentRoles = csv(debouncedFilters.respondentRoles);
    if (csv(debouncedFilters.coreFocuses)) result.coreFocuses = csv(debouncedFilters.coreFocuses);
    if (csv(debouncedFilters.stateOfPractices)) result.stateOfPractices = csv(debouncedFilters.stateOfPractices);
    if (csv(debouncedFilters.practiceSettings)) result.practiceSettings = csv(debouncedFilters.practiceSettings);
    if (debouncedFilters.yearsMin !== undefined) result.yearsMin = debouncedFilters.yearsMin;
    if (debouncedFilters.yearsMax !== undefined) result.yearsMax = debouncedFilters.yearsMax;
    if (debouncedFilters.monthlyPatientsMin !== undefined) result.monthlyPatientsMin = debouncedFilters.monthlyPatientsMin;
    if (debouncedFilters.monthlyPatientsMax !== undefined) result.monthlyPatientsMax = debouncedFilters.monthlyPatientsMax;
    if (debouncedFilters.dedPatientsMin !== undefined) result.dedPatientsMin = debouncedFilters.dedPatientsMin;
    if (debouncedFilters.dedPatientsMax !== undefined) result.dedPatientsMax = debouncedFilters.dedPatientsMax;
    return Object.keys(result).length > 0 ? result : undefined;
  }, [debouncedFilters]);

  const { data, isLoading, error } = useDemographics(diseaseAreaId, clientId, apiFilters);
  const { data: filterOptions } = useInsightsFilterOptions(diseaseAreaId);
  // v1.17.24: a second useDemographics call WITHOUT filters, so the
  // dropdown options (role / coreFocus / practiceSetting) come from the
  // unfiltered universe. Mirrors the Benchmarking + Sociometric Summary
  // tabs which already work this way. Pre-fix, the same `data` was used
  // for both charts AND options — once you picked one value the API
  // returned a narrowed `byPracticeSetting`, the options recomputed to
  // just that one value, and you couldn't pick a second. Customer-
  // reported as Practice Setting "only allowing for the selection of
  // one setting" on Demographics specifically.
  const { data: unfilteredData } = useDemographics(diseaseAreaId, clientId);

  const roleOptions = useMemo(() => {
    if (!unfilteredData?.byRole) return [];
    return unfilteredData.byRole.map(d => d.name).filter(Boolean).sort();
  }, [unfilteredData?.byRole]);

  const coreFocusOptions = useMemo(() => {
    if (!unfilteredData?.byCoreFocus) return [];
    return unfilteredData.byCoreFocus.map(d => d.name).filter(Boolean).sort();
  }, [unfilteredData?.byCoreFocus]);

  const practiceSettingOptions = useMemo(() => {
    if (!unfilteredData?.byPracticeSetting) return [];
    return unfilteredData.byPracticeSetting.map(d => d.name).filter(Boolean).sort();
  }, [unfilteredData?.byPracticeSetting]);

  const stateOptions = useMemo(() => {
    if (filterOptions?.states && filterOptions.states.length > 0) {
      return filterOptions.states;
    }
    return US_STATES;
  }, [filterOptions?.states]);

  const handleClearAll = useCallback(() => {
    setFilters({});
  }, []);

  // v1.17.3: drive the shared FilterClearControls (button count + chips).
  // v1.17.4: 4 categorical filters now multi-select arrays — each selected
  // value gets its own removable chip.
  const activeFilters = useMemo<ActiveFilter[]>(() => {
    const entries: ActiveFilter[] = [];
    const chipsForArray = (
      key: 'respondentRoles' | 'coreFocuses' | 'stateOfPractices' | 'practiceSettings',
      label: string
    ) => {
      const arr = filters[key];
      if (!arr || arr.length === 0) return;
      for (const value of arr) {
        entries.push({
          key: `${key}-${value}`,
          label: `${label}: ${value}`,
          onRemove: () =>
            setFilters((prev) => ({
              ...prev,
              [key]: (prev[key] ?? []).filter((v) => v !== value),
            })),
        });
      }
    };
    chipsForArray('respondentRoles', 'Role');
    chipsForArray('coreFocuses', 'Focus');
    chipsForArray('stateOfPractices', 'State');
    chipsForArray('practiceSettings', 'Practice');
    // Range filters reported as a single chip when either bound is set.
    const rangeChip = (
      keyMin: keyof DemographicFilters,
      keyMax: keyof DemographicFilters,
      label: string
    ) => {
      const min = filters[keyMin];
      const max = filters[keyMax];
      if (min === undefined && max === undefined) return;
      entries.push({
        key: `${String(keyMin)}-${min ?? ''}-${max ?? ''}`,
        label: `${label}: ${min ?? '0'}–${max ?? '∞'}`,
        onRemove: () => setFilters((prev) => ({ ...prev, [keyMin]: undefined, [keyMax]: undefined })),
      });
    };
    rangeChip('yearsMin', 'yearsMax', 'Years');
    rangeChip('monthlyPatientsMin', 'monthlyPatientsMax', 'Monthly patients');
    rangeChip('dedPatientsMin', 'dedPatientsMax', 'DED patients');
    return entries;
  }, [filters]);

  const handleMultiSelectChange = useCallback(
    (key: 'respondentRoles' | 'coreFocuses' | 'stateOfPractices' | 'practiceSettings') =>
      (values: string[]) => {
        setFilters((prev) => ({
          ...prev,
          [key]: values.length > 0 ? values : undefined,
        }));
      },
    []
  );

  const handleNumberChange = useCallback((key: keyof DemographicFilters, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value === '' ? undefined : Number(value),
    }));
  }, []);

  // Transform data for chart components
  const roleData = useMemo(() => {
    if (!data?.byRole) return [];
    return data.byRole.map((d) => ({ name: d.name, value: d.count }));
  }, [data?.byRole]);

  const decileData = useMemo(() => {
    if (!data?.byDecile) return [];
    return data.byDecile.map((d) => ({ name: d.name, value: d.count }));
  }, [data?.byDecile]);

  const monthlyPatientsData = useMemo(() => {
    if (!data?.byMonthlyPatients) return [];
    return data.byMonthlyPatients.map((d) => ({ name: d.name, value: d.count }));
  }, [data?.byMonthlyPatients]);

  const dedPatientsData = useMemo(() => {
    if (!data?.byDedPatients) return [];
    return data.byDedPatients.map((d) => ({ name: d.name, value: d.count }));
  }, [data?.byDedPatients]);

  const yearsData = useMemo(() => {
    if (!data?.byYearsInPractice) return [];
    return data.byYearsInPractice.map((d) => ({ name: d.name, value: d.count }));
  }, [data?.byYearsInPractice]);

  const stateData = useMemo(() => {
    if (!data?.byState) return [];
    return data.byState.map((d) => ({ name: d.name, count: d.count }));
  }, [data?.byState]);

  const practiceSettingData = useMemo(() => {
    if (!data?.byPracticeSetting) return [];
    return data.byPracticeSetting.map((d) => ({ name: d.name, count: d.count }));
  }, [data?.byPracticeSetting]);

  const coreFocusPatientData = useMemo(() => {
    if (!data?.coreFocusByPatients) return [];
    return data.coreFocusByPatients
      .filter((d) => d.coreFocus && d.coreFocus.trim() !== '' && d.count > 0)
      .map((d) => ({
        name: d.coreFocus,
        value: Math.round(d.totalPatients / d.count),
      }));
  }, [data?.coreFocusByPatients]);

  const topicsDiscussedPieData = useMemo(() => {
    if (!data?.topicsDiscussed) return [];
    return data.topicsDiscussed.map((d) => ({ name: d.name, value: d.count }));
  }, [data?.topicsDiscussed]);

  const topicsDiscussedBarData = useMemo(() => {
    if (!data?.topicsDiscussed) return [];
    return data.topicsDiscussed.map((d) => ({ name: d.name, value: d.count }));
  }, [data?.topicsDiscussed]);

  // 2026-06-03: no early returns for isLoading/error/!data. Benchmarking
  // (leader-rankings.tsx) doesn't have them either — its filter bar is
  // always mounted, with the loading/empty state handled by its child
  // table. Same shape here: filter bar always mounted, body region below
  // swaps between loading / error / no-data / 0-result / charts. Previous
  // version unmounted the whole tab during refetch, which is what closed
  // the MultiSelect popover after each pick.
  return (
    <div className="space-y-8">
      <div className="bg-muted/50 rounded-lg p-4 print:hidden">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter className="h-4 w-4" />
            <span>Demographic Filters</span>
            {isLoading && (
              <span className="text-xs text-muted-foreground animate-pulse">Updating...</span>
            )}
          </div>
          {/* v1.17.3: prominent right-anchored Clear button (default size,
              secondary variant, count badge). Earlier sm/outline button
              wasn't visible enough for customers. */}
          <ClearFiltersButton activeCount={activeFilters.length} onClear={handleClearAll} />
        </div>

        {/* Row 1: Multi-select dropdowns (v1.17.4 — was single Select) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Respondent Role</Label>
            <MultiSelect
              options={roleOptions}
              selected={filters.respondentRoles ?? []}
              onChange={handleMultiSelectChange('respondentRoles')}
              placeholder="All Roles"
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Core Focus</Label>
            <MultiSelect
              options={coreFocusOptions}
              selected={filters.coreFocuses ?? []}
              onChange={handleMultiSelectChange('coreFocuses')}
              placeholder="All Focus Areas"
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">State of Practice</Label>
            <MultiSelect
              options={stateOptions}
              selected={filters.stateOfPractices ?? []}
              onChange={handleMultiSelectChange('stateOfPractices')}
              placeholder="All States"
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Practice Setting</Label>
            <MultiSelect
              options={practiceSettingOptions}
              selected={filters.practiceSettings ?? []}
              onChange={handleMultiSelectChange('practiceSettings')}
              placeholder="All Settings"
            />
          </div>
        </div>

        {/* Row 2: Range Inputs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Years of Practice</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Min"
                className="h-9"
                min={0}
                max={50}
                value={filters.yearsMin ?? ''}
                onChange={(e) => handleNumberChange('yearsMin', e.target.value)}
              />
              <span className="text-muted-foreground text-xs">to</span>
              <Input
                type="number"
                placeholder="Max"
                className="h-9"
                min={0}
                max={50}
                value={filters.yearsMax ?? ''}
                onChange={(e) => handleNumberChange('yearsMax', e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Avg Monthly Patients</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Min"
                className="h-9"
                min={0}
                max={4000}
                value={filters.monthlyPatientsMin ?? ''}
                onChange={(e) => handleNumberChange('monthlyPatientsMin', e.target.value)}
              />
              <span className="text-muted-foreground text-xs">to</span>
              <Input
                type="number"
                placeholder="Max"
                className="h-9"
                min={0}
                max={4000}
                value={filters.monthlyPatientsMax ?? ''}
                onChange={(e) => handleNumberChange('monthlyPatientsMax', e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Avg Monthly DED Patients</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Min"
                className="h-9"
                min={0}
                max={900}
                value={filters.dedPatientsMin ?? ''}
                onChange={(e) => handleNumberChange('dedPatientsMin', e.target.value)}
              />
              <span className="text-muted-foreground text-xs">to</span>
              <Input
                type="number"
                placeholder="Max"
                className="h-9"
                min={0}
                max={900}
                value={filters.dedPatientsMax ?? ''}
                onChange={(e) => handleNumberChange('dedPatientsMax', e.target.value)}
              />
            </div>
          </div>
        </div>

        <ActiveFilterChips filters={activeFilters} />
      </div>

      {/* Body — the `Updating...` chip inside the filter bar above
          already signals refetch state; the chart area swaps between
          loading / error / no-data / 0-result / charts here. */}
      {isLoading && !data ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Loading demographics data...
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-12 text-destructive">
          Error loading demographics data
        </div>
      ) : !data ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          No demographics data available
        </div>
      ) : data.totalRespondents === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <p className="text-base font-medium">No respondents match these filters.</p>
          <p className="text-sm text-muted-foreground mt-2">
            {activeFilters.length > 0
              ? 'Try clearing one or more filters above to see data.'
              : 'There are no completed survey responses for this disease area yet.'}
          </p>
        </div>
      ) : (
        <>

      <div>
        <h2 className="text-xl font-bold">Respondent Demographics</h2>
        <p className="text-sm text-muted-foreground">
          Survey respondent demographics across {data.totalRespondents} respondents
          {activeFilters.length > 0 && ' (filtered)'}
        </p>
      </div>

      {/* Section: Role & Decile */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-muted-foreground uppercase tracking-wide border-b pb-2">Role & Market Profile</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-t-4 border-t-blue-500 shadow-md rounded-xl">
            <CardHeader>
              <CardTitle className="text-base font-bold">Respondent Role</CardTitle>
              <CardDescription>Primary medical specialty distribution</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <PieDistributionChart data={roleData} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-violet-500 shadow-md rounded-xl">
            <CardHeader>
              <CardTitle className="text-base font-bold">Treatment Decile</CardTitle>
              <CardDescription>Market decile distribution of respondents</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <BarDistributionChart data={decileData} color="#8B5CF6" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Section: Patient Volume */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-muted-foreground uppercase tracking-wide border-b pb-2">Patient Volume</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-t-4 border-t-blue-500 shadow-md rounded-xl">
            <CardHeader>
              <CardTitle className="text-base font-bold">Total Monthly Patients</CardTitle>
              <CardDescription>Distribution of monthly patient volume</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <BarDistributionChart data={monthlyPatientsData} color="#3B82F6" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-emerald-500 shadow-md rounded-xl">
            <CardHeader>
              <CardTitle className="text-base font-bold">Monthly DED Patients</CardTitle>
              <CardDescription>Distribution of dry eye disease patient volume</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <BarDistributionChart data={dedPatientsData} color="#10B981" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Section: Practice Profile */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-muted-foreground uppercase tracking-wide border-b pb-2">Practice Profile</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-t-4 border-t-amber-500 shadow-md rounded-xl">
            <CardHeader>
              <CardTitle className="text-base font-bold">Years in Practice</CardTitle>
              <CardDescription>Distribution of practice experience</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <BarDistributionChart data={yearsData} color="#F59E0B" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-indigo-500 shadow-md rounded-xl">
            <CardHeader>
              <CardTitle className="text-base font-bold">Location by State</CardTitle>
              <CardDescription>Top states of respondent HCPs</CardDescription>
            </CardHeader>
            <CardContent>
              <div style={{ minHeight: 300 }}>
                <StateBarChart data={stateData} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Practice Setting (full width) */}
      <Card className="border-t-4 border-t-purple-500 shadow-md rounded-xl">
        <CardHeader>
          <CardTitle className="text-base font-bold">Practice Setting</CardTitle>
          <CardDescription>Practice type distribution of respondents</CardDescription>
        </CardHeader>
        <CardContent>
          <div style={{ minHeight: 300 }}>
            <StateBarChart data={practiceSettingData} />
          </div>
        </CardContent>
      </Card>

      {/* Core Focus x Monthly Patients (full width) */}
      {coreFocusPatientData.length > 0 && (
        <Card className="border-t-4 border-t-cyan-500 shadow-md rounded-xl">
          <CardHeader>
            <CardTitle className="text-base font-bold">Core Focus by Average Monthly Patients</CardTitle>
            <CardDescription>Average monthly patients by respondent core focus area</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <BarDistributionChart data={coreFocusPatientData} color="#06B6D4" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section: Educational Preferences */}
      {data.educationalResources.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-muted-foreground uppercase tracking-wide border-b pb-2">Educational Preferences</h3>
          <Card className="border-t-4 border-t-green-500 shadow-md rounded-xl">
            <CardHeader>
              <CardTitle className="text-base font-bold">Educational Resources (All)</CardTitle>
              <CardDescription>Ranking of preferred educational resources</CardDescription>
            </CardHeader>
            <CardContent>
              <StackedBarChart data={data.educationalResources} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Educational Resources Academic + Other */}
      {(data.educationalResourcesAcademic.length > 0 || data.educationalResourcesOther.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {data.educationalResourcesAcademic.length > 0 && (
            <Card className="border-t-4 border-t-lime-500 shadow-md rounded-xl">
              <CardHeader>
                <CardTitle className="text-base font-bold">Educational Resources (Academic)</CardTitle>
                <CardDescription>Academic respondent preferences</CardDescription>
              </CardHeader>
              <CardContent>
                <StackedBarChart data={data.educationalResourcesAcademic} />
              </CardContent>
            </Card>
          )}

          {data.educationalResourcesOther.length > 0 && (
            <Card className="border-t-4 border-t-orange-500 shadow-md rounded-xl">
              <CardHeader>
                <CardTitle className="text-base font-bold">Educational Resources (Other)</CardTitle>
                <CardDescription>Non-academic respondent preferences</CardDescription>
              </CardHeader>
              <CardContent>
                <StackedBarChart data={data.educationalResourcesOther} />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* 2026-06-02 Group B-remainder skeletons. All three render only
          when data exists. They activate automatically when the matching
          survey questions are imported AND completed responses arrive —
          no further frontend deploy needed (provided the keyword patterns
          in getDemographics matched the imported question text). */}

      {/* Social Media Platform Rankings (RANK_ORDER, top 5) */}
      {data.socialMediaRankings && data.socialMediaRankings.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-muted-foreground uppercase tracking-wide border-b pb-2">
            Social Media Platforms
          </h3>
          <Card className="border-t-4 border-t-sky-500 shadow-md rounded-xl">
            <CardHeader>
              <CardTitle className="text-base font-bold">Top 5 Social Media Platforms</CardTitle>
              <CardDescription>Ranked by respondents</CardDescription>
            </CardHeader>
            <CardContent>
              <StackedBarChart data={data.socialMediaRankings} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Valuable Social Media Content (MULTI_CHOICE) */}
      {data.valuableContent && data.valuableContent.length > 0 && (
        <Card className="border-t-4 border-t-violet-500 shadow-md rounded-xl">
          <CardHeader>
            <CardTitle className="text-base font-bold">Valuable Social Media Content</CardTitle>
            <CardDescription>Content types respondents find most valuable</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <BarDistributionChart
                data={data.valuableContent.map((d) => ({ name: d.name, value: d.count }))}
                color="#8B5CF6"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Objectivity Rating (SINGLE_CHOICE) */}
      {data.objectivityRating && data.objectivityRating.length > 0 && (
        <Card className="border-t-4 border-t-amber-500 shadow-md rounded-xl">
          <CardHeader>
            <CardTitle className="text-base font-bold">Leader Objectivity Rating</CardTitle>
            <CardDescription>Respondents' rating of leader objectivity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <BarDistributionChart
                data={data.objectivityRating.map((d) => ({ name: d.name, value: d.count }))}
                color="#F59E0B"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Topics Discussed (only if data exists) */}
      {data.topicsDiscussed && data.topicsDiscussed.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-t-4 border-t-rose-500 shadow-md rounded-xl">
            <CardHeader>
              <CardTitle className="text-base font-bold">Topics Discussed (Distribution)</CardTitle>
              <CardDescription>Topics discussed with HCPs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <PieDistributionChart data={topicsDiscussedPieData} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-pink-500 shadow-md rounded-xl">
            <CardHeader>
              <CardTitle className="text-base font-bold">Topics Discussed (Counts)</CardTitle>
              <CardDescription>Number of respondents per topic</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <BarDistributionChart data={topicsDiscussedBarData} color="#EC4899" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
        </>
      )}
    </div>
  );
}
