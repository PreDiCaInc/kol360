'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Filter, X, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MultiSelect } from '@/components/ui/multi-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useInsightsFilterOptions } from '@/hooks/use-insights-report';
import type { InsightsFilterInput } from '@kol360/shared';

interface GlobalFiltersProps {
  diseaseAreaId: string;
  onFilterChange: (filters: GlobalFilterState) => void;
  onPrint?: () => void;
}

export interface GlobalFilterState {
  states: string[];
  specialties: string[];
  influencerType: string | null;
}

// Parse URL search params to global filter state
function parseUrlFilters(searchParams: URLSearchParams): GlobalFilterState {
  const states = searchParams.get('gStates');
  const specialties = searchParams.get('gSpecialties');
  const influencerType = searchParams.get('gInfluencerType');

  return {
    states: states ? states.split(',').filter(Boolean) : [],
    specialties: specialties ? specialties.split(',').filter(Boolean) : [],
    influencerType: influencerType || null,
  };
}

// Convert filter state to URL search params
function filtersToUrlParams(filters: GlobalFilterState): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.states.length > 0) {
    params.set('gStates', filters.states.join(','));
  }
  if (filters.specialties.length > 0) {
    params.set('gSpecialties', filters.specialties.join(','));
  }
  if (filters.influencerType) {
    params.set('gInfluencerType', filters.influencerType);
  }

  return params;
}

// Convert global filters to API filter format
export function globalFiltersToApiFormat(filters: GlobalFilterState): Partial<InsightsFilterInput> {
  return {
    states: filters.states.length > 0 ? filters.states.join(',') : undefined,
    specialties: filters.specialties.length > 0 ? filters.specialties.join(',') : undefined,
    influencerType: filters.influencerType as InsightsFilterInput['influencerType'] || undefined,
  };
}

export function GlobalFilters({
  diseaseAreaId,
  onFilterChange,
  onPrint,
}: GlobalFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Get filter options from API
  const { data: filterOptions } = useInsightsFilterOptions(diseaseAreaId);

  // Initialize filters from URL
  const [filters, setFilters] = useState<GlobalFilterState>(() =>
    parseUrlFilters(searchParams)
  );

  // Sync URL when filters change
  useEffect(() => {
    const params = filtersToUrlParams(filters);
    // Preserve other params (like tab-specific params)
    const currentParams = new URLSearchParams(searchParams.toString());

    // Remove our global filter params first
    currentParams.delete('gStates');
    currentParams.delete('gSpecialties');
    currentParams.delete('gInfluencerType');

    // Add our new params
    params.forEach((value, key) => currentParams.set(key, value));

    const newUrl = currentParams.toString() ? `${pathname}?${currentParams.toString()}` : pathname;
    router.replace(newUrl, { scroll: false });
  }, [filters, pathname, router, searchParams]);

  // Notify parent when filters change
  useEffect(() => {
    onFilterChange(filters);
  }, [filters, onFilterChange]);

  const handleStatesChange = useCallback((values: string[]) => {
    setFilters((prev) => ({ ...prev, states: values }));
  }, []);

  const handleSpecialtiesChange = useCallback((values: string[]) => {
    setFilters((prev) => ({ ...prev, specialties: values }));
  }, []);

  const handleInfluencerTypeChange = useCallback((value: string) => {
    setFilters((prev) => ({
      ...prev,
      influencerType: value === 'all' ? null : value,
    }));
  }, []);

  const handleClearAll = useCallback(() => {
    setFilters({
      states: [],
      specialties: [],
      influencerType: null,
    });
  }, []);

  const hasActiveFilters =
    filters.states.length > 0 ||
    filters.specialties.length > 0 ||
    filters.influencerType !== null;

  const activeFilterCount =
    filters.states.length +
    filters.specialties.length +
    (filters.influencerType ? 1 : 0);

  const handlePrint = useCallback(() => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  }, [onPrint]);

  return (
    <div className="bg-muted/50 rounded-lg p-4 print:hidden">
      <div className="flex flex-wrap items-center gap-4">
        {/* Filter Label */}
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Filter className="h-4 w-4" />
          <span>Global Filters</span>
          {hasActiveFilters && (
            <Badge variant="secondary" className="text-xs">
              {activeFilterCount} active
            </Badge>
          )}
        </div>

        {/* State Filter */}
        <div className="w-[180px]">
          <MultiSelect
            options={filterOptions?.states || []}
            selected={filters.states}
            onChange={handleStatesChange}
            placeholder="All States"
          />
        </div>

        {/* Specialty Filter */}
        <div className="w-[200px]">
          <MultiSelect
            options={filterOptions?.specialties || []}
            selected={filters.specialties}
            onChange={handleSpecialtiesChange}
            placeholder="All Specialties"
          />
        </div>

        {/* Influencer Type Filter */}
        <div className="w-[180px]">
          <Select
            value={filters.influencerType || 'all'}
            onValueChange={handleInfluencerTypeChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {filterOptions?.influencerTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Print Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrint}
          className="gap-2"
        >
          <Printer className="h-4 w-4" />
          Print Report
        </Button>
      </div>

      {/* Active Filter Pills */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/50">
          {filters.states.map((state) => (
            <Badge
              key={`state-${state}`}
              variant="outline"
              className="cursor-pointer hover:bg-destructive/10"
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  states: prev.states.filter((s) => s !== state),
                }))
              }
            >
              State: {state}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          ))}
          {filters.specialties.map((spec) => (
            <Badge
              key={`spec-${spec}`}
              variant="outline"
              className="cursor-pointer hover:bg-destructive/10"
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  specialties: prev.specialties.filter((s) => s !== spec),
                }))
              }
            >
              Specialty: {spec}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          ))}
          {filters.influencerType && (
            <Badge
              variant="outline"
              className="cursor-pointer hover:bg-destructive/10"
              onClick={() =>
                setFilters((prev) => ({ ...prev, influencerType: null }))
              }
            >
              Type: {filters.influencerType}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
