'use client';

import { useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import { Filter } from 'lucide-react';

/**
 * v1.17.5: shared respondent-filter shape — must mirror the backend
 * `RespondentFilters` interface in `apps/api/src/services/insights-report.service.ts`.
 * 4 multi-select arrays + 3 numeric ranges. Empty/undefined = no filter on
 * that field.
 */
export interface RespondentFiltersState {
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

interface Props {
  value: RespondentFiltersState;
  onChange: (next: RespondentFiltersState) => void;
  roleOptions: string[];
  coreFocusOptions: string[];
  stateOptions: string[];
  practiceSettingOptions: string[];
  /**
   * Slot rendered in the header row right of the title (e.g. an isLoading
   * indicator or — when used in Demographics — the Clear button). On
   * Sociometric/DB the parent owns a single Clear button covering both
   * filter bars, so this slot stays empty on those tabs.
   */
  headerSlot?: React.ReactNode;
  /**
   * Compact mode: skips the outer bg-muted/rounded container. Useful when
   * the parent already wraps in its own filter-bar container so we don't
   * nest visual containers.
   */
  bare?: boolean;
}

/**
 * Renders the same 4-multi-select + 3-range filter layout that's been
 * on the Demographics tab since v1.17.4, packaged for reuse on
 * Sociometric Leaders + Dynamic Benchmarking (v1.17.5 — item #3 in the
 * 2026-05-26 bug bundle).
 *
 * Stateless: the parent owns RespondentFiltersState and drives onChange.
 * Doesn't render its own Clear button or active-filter chips — those
 * belong with the parent so they can be unified with the parent's
 * KOL-side filters under one Clear control and one chip row.
 */
export function RespondentFiltersBar({
  value,
  onChange,
  roleOptions,
  coreFocusOptions,
  stateOptions,
  practiceSettingOptions,
  headerSlot,
  bare = false,
}: Props) {
  const updateMulti = useCallback(
    (
      key:
        | 'respondentRoles'
        | 'coreFocuses'
        | 'stateOfPractices'
        | 'practiceSettings'
    ) =>
      (values: string[]) => {
        onChange({ ...value, [key]: values.length > 0 ? values : undefined });
      },
    [value, onChange]
  );

  const updateNumber = useCallback(
    (key: keyof RespondentFiltersState) => (raw: string) => {
      onChange({ ...value, [key]: raw === '' ? undefined : Number(raw) });
    },
    [value, onChange]
  );

  const body = (
    <>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Filter className="h-4 w-4" />
          <span>Respondent Filters</span>
        </div>
        {headerSlot}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Respondent Role</Label>
          <MultiSelect
            options={roleOptions}
            selected={value.respondentRoles ?? []}
            onChange={updateMulti('respondentRoles')}
            placeholder="All Roles"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Core Focus</Label>
          <MultiSelect
            options={coreFocusOptions}
            selected={value.coreFocuses ?? []}
            onChange={updateMulti('coreFocuses')}
            placeholder="All Focus Areas"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">State of Practice</Label>
          <MultiSelect
            options={stateOptions}
            selected={value.stateOfPractices ?? []}
            onChange={updateMulti('stateOfPractices')}
            placeholder="All States"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Practice Setting</Label>
          <MultiSelect
            options={practiceSettingOptions}
            selected={value.practiceSettings ?? []}
            onChange={updateMulti('practiceSettings')}
            placeholder="All Settings"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <RangeInput
          label="Years of Practice"
          min={value.yearsMin}
          max={value.yearsMax}
          onMinChange={updateNumber('yearsMin')}
          onMaxChange={updateNumber('yearsMax')}
        />
        <RangeInput
          label="Avg Monthly Patients"
          min={value.monthlyPatientsMin}
          max={value.monthlyPatientsMax}
          onMinChange={updateNumber('monthlyPatientsMin')}
          onMaxChange={updateNumber('monthlyPatientsMax')}
        />
        <RangeInput
          label="Avg Monthly DED Patients"
          min={value.dedPatientsMin}
          max={value.dedPatientsMax}
          onMinChange={updateNumber('dedPatientsMin')}
          onMaxChange={updateNumber('dedPatientsMax')}
        />
      </div>
    </>
  );

  if (bare) return <>{body}</>;
  return <div className="bg-muted/50 rounded-lg p-4 print:hidden">{body}</div>;
}

function RangeInput({
  label,
  min,
  max,
  onMinChange,
  onMaxChange,
}: {
  label: string;
  min: number | undefined;
  max: number | undefined;
  onMinChange: (raw: string) => void;
  onMaxChange: (raw: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground mb-1 block">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          placeholder="Min"
          className="h-9"
          value={min ?? ''}
          onChange={(e) => onMinChange(e.target.value)}
        />
        <span className="text-muted-foreground text-xs">to</span>
        <Input
          type="number"
          placeholder="Max"
          className="h-9"
          value={max ?? ''}
          onChange={(e) => onMaxChange(e.target.value)}
        />
      </div>
    </div>
  );
}

/**
 * Helpers consumers use to (1) serialize state into API query params and
 * (2) build chip entries for the shared ActiveFilterChips component.
 * Co-located here so all 3 consumer tabs do the same thing.
 */

export function respondentFiltersToApiParams(
  f: RespondentFiltersState
): Record<string, string[] | number | undefined> {
  // v1.17.31: arrays pass through as arrays (hook serializes as
  // repeated query params, not CSV). See
  // docs/findings/splitcsv-comma-bug-2026-06-09.md.
  const arr = (a?: string[]): string[] | undefined =>
    a && a.length > 0 ? a : undefined;
  const out: Record<string, string[] | number | undefined> = {};
  if (arr(f.respondentRoles)) out.respondentRoles = arr(f.respondentRoles);
  if (arr(f.coreFocuses)) out.coreFocuses = arr(f.coreFocuses);
  if (arr(f.stateOfPractices)) out.stateOfPractices = arr(f.stateOfPractices);
  if (arr(f.practiceSettings)) out.practiceSettings = arr(f.practiceSettings);
  if (f.yearsMin !== undefined) out.yearsMin = f.yearsMin;
  if (f.yearsMax !== undefined) out.yearsMax = f.yearsMax;
  if (f.monthlyPatientsMin !== undefined) out.monthlyPatientsMin = f.monthlyPatientsMin;
  if (f.monthlyPatientsMax !== undefined) out.monthlyPatientsMax = f.monthlyPatientsMax;
  if (f.dedPatientsMin !== undefined) out.dedPatientsMin = f.dedPatientsMin;
  if (f.dedPatientsMax !== undefined) out.dedPatientsMax = f.dedPatientsMax;
  return out;
}

export function hasAnyRespondentFilter(f: RespondentFiltersState): boolean {
  return (
    (f.respondentRoles?.length ?? 0) > 0 ||
    (f.coreFocuses?.length ?? 0) > 0 ||
    (f.stateOfPractices?.length ?? 0) > 0 ||
    (f.practiceSettings?.length ?? 0) > 0 ||
    f.yearsMin !== undefined ||
    f.yearsMax !== undefined ||
    f.monthlyPatientsMin !== undefined ||
    f.monthlyPatientsMax !== undefined ||
    f.dedPatientsMin !== undefined ||
    f.dedPatientsMax !== undefined
  );
}
