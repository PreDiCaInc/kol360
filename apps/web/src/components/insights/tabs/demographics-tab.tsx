'use client';

import { useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PieDistributionChart } from '@/components/insights/charts/pie-distribution-chart';
import { BarDistributionChart } from '@/components/insights/charts/bar-distribution-chart';
import { StateBarChart } from '@/components/insights/charts/state-bar-chart';
import { StackedBarChart } from '@/components/insights/charts/stacked-bar-chart';
import { useDemographics, useInsightsFilterOptions, useDemographicQuestions } from '@/hooks/use-insights-report';
import { useFilters } from '@/hooks/use-filters';
import { useRespondentMatchCount } from '@/hooks/use-match-count';
import { QuestionInfoPopover } from '@/components/insights/shared/question-info-popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { Filter } from 'lucide-react';
import {
  ActiveFilter,
  ActiveFilterChips,
} from '@/components/insights/shared/filter-clear-controls';
import { ApplyFilterControls } from '@/components/insights/shared/apply-filter-controls';

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

// v1.17.53 — replaced the local 500ms debounce + auto-fire with the
// shared `useFilters` Apply pattern. Filter dropdowns mutate `pending`;
// the heavy demographics query reads `applied`; the live "N
// respondents match" indicator reads `pending` via a debounced
// match-count fetch.
const INITIAL_FILTERS: DemographicFilters = {};

function buildApiFilters(f: DemographicFilters): Record<string, string[] | number> | undefined {
  const result: Record<string, string[] | number> = {};
  if (f.respondentRoles && f.respondentRoles.length > 0) result.respondentRoles = f.respondentRoles;
  if (f.coreFocuses && f.coreFocuses.length > 0) result.coreFocuses = f.coreFocuses;
  if (f.stateOfPractices && f.stateOfPractices.length > 0) result.stateOfPractices = f.stateOfPractices;
  if (f.practiceSettings && f.practiceSettings.length > 0) result.practiceSettings = f.practiceSettings;
  if (f.yearsMin !== undefined) result.yearsMin = f.yearsMin;
  if (f.yearsMax !== undefined) result.yearsMax = f.yearsMax;
  if (f.monthlyPatientsMin !== undefined) result.monthlyPatientsMin = f.monthlyPatientsMin;
  if (f.monthlyPatientsMax !== undefined) result.monthlyPatientsMax = f.monthlyPatientsMax;
  if (f.dedPatientsMin !== undefined) result.dedPatientsMin = f.dedPatientsMin;
  if (f.dedPatientsMax !== undefined) result.dedPatientsMax = f.dedPatientsMax;
  return Object.keys(result).length > 0 ? result : undefined;
}

export function DemographicsTab({ diseaseAreaId, clientId }: Props) {
  const { pending, applied, isDirty, setPending, apply, reset } = useFilters<DemographicFilters>(
    INITIAL_FILTERS,
    { tabId: 'demographics' }
  );

  // Convenience used by every multi-select / range onChange below.
  const setFilters = useCallback(
    (updater: (prev: DemographicFilters) => DemographicFilters) => {
      setPending((p) => updater(p));
    },
    [setPending]
  );
  const filters = pending; // existing render code reads `filters.*`

  const apiFilters = useMemo(() => buildApiFilters(applied), [applied]);
  const { data, isLoading, error } = useDemographics(diseaseAreaId, clientId, apiFilters);

  // v1.17.53 — survey question text per dimension. Keyed lookup for
  // the (i) popover on each chart card. Empty until loaded, then
  // sparse if a dimension has no matching question in the analysis's
  // included campaigns.
  const demoQuestions = useDemographicQuestions(diseaseAreaId, clientId);
  const qByDim = useMemo<Record<string, { text: string; campaignName: string }>>(
    () =>
      Object.fromEntries(
        (demoQuestions.data?.items ?? []).map((it) => [it.dimension, { text: it.text, campaignName: it.campaignName }])
      ),
    [demoQuestions.data]
  );

  // Live "N respondents match" indicator — fires only while the user
  // has uncommitted edits. When clean, the displayed count comes from
  // the applied data's totalRespondents (it would match the count
  // endpoint by construction — perf-pass-C parity contract).
  const matchCount = useRespondentMatchCount(
    diseaseAreaId,
    buildApiFilters(pending) ?? {},
    clientId,
    isDirty
  );
  const liveCount = isDirty ? matchCount.data?.count : data?.totalRespondents;
  const countIsFetching = isDirty && matchCount.isFetching;
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
    // v1.17.53: reset clears BOTH pending + applied (Reset button —
    // matches the pteam ticket: "fires Apply automatically after
    // reset so user sees the unfiltered view immediately").
    reset();
  }, [reset]);

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
      <div
        className="bg-muted/50 rounded-lg p-4 print:hidden"
        onKeyDown={(e) => {
          // v1.17.53: Enter inside the filter bar triggers Apply
          // (matches the pteam ticket UX spec). Ignore Enter on
          // dropdown popovers where MultiSelect handles it itself.
          if (e.key === 'Enter' && isDirty && (e.target as HTMLElement).tagName === 'INPUT') {
            e.preventDefault();
            apply();
          }
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter className="h-4 w-4" />
            <span>Demographic Filters</span>
            {isLoading && (
              <span className="text-xs text-muted-foreground animate-pulse">Updating...</span>
            )}
          </div>
          {/* v1.17.53: Apply Filters + Reset + live "N respondents match"
              indicator. Reset replaces the prior right-anchored
              ClearFiltersButton (its functionality folded in here per
              pteam ticket spec). ActiveFilterChips below still allow
              per-filter removal. */}
          <ApplyFilterControls
            className="ml-auto"
            isDirty={isDirty}
            isLoading={isLoading}
            liveCount={liveCount}
            countIsFetching={countIsFetching}
            countLabel="respondents match"
            hasActiveFilters={activeFilters.length > 0}
            onApply={apply}
            onReset={handleClearAll}
          />
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
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base font-bold">Respondent Role</CardTitle>
                <QuestionInfoPopover
                  text={qByDim['role']?.text}
                  campaignName={qByDim['role']?.campaignName}
                  title="Survey question for Respondent Role"
                />
              </div>
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
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base font-bold">Total Monthly Patients</CardTitle>
                <QuestionInfoPopover
                  text={qByDim['monthlyPatients']?.text}
                  campaignName={qByDim['monthlyPatients']?.campaignName}
                  title="Survey question for Total Monthly Patients"
                />
              </div>
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
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base font-bold">Monthly DED Patients</CardTitle>
                <QuestionInfoPopover
                  text={qByDim['dedPatients']?.text}
                  campaignName={qByDim['dedPatients']?.campaignName}
                  title="Survey question for Monthly DED Patients"
                />
              </div>
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
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base font-bold">Years in Practice</CardTitle>
                <QuestionInfoPopover
                  text={qByDim['yearsInPractice']?.text}
                  campaignName={qByDim['yearsInPractice']?.campaignName}
                  title="Survey question for Years in Practice"
                />
              </div>
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
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base font-bold">Practice Setting</CardTitle>
            <QuestionInfoPopover
              text={qByDim['practiceSetting']?.text}
              campaignName={qByDim['practiceSetting']?.campaignName}
              title="Survey question for Practice Setting"
            />
          </div>
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
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base font-bold">Core Focus by Average Monthly Patients</CardTitle>
              <QuestionInfoPopover
                text={qByDim['coreFocus']?.text}
                campaignName={qByDim['coreFocus']?.campaignName}
                title="Survey question for Core Focus"
              />
            </div>
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
