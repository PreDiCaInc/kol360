'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

/**
 * One "active filter" for the Clear-filters UI: drives both the count
 * embedded in the Clear button AND the removable chip row below the
 * filter inputs.
 */
export interface ActiveFilter {
  /** Unique React key (e.g. "state-NY", "specialty-Optometry"). */
  key: string;
  /** Displayed in the chip, e.g. "State: NY". */
  label: string;
  /** Removes just this one filter from local state. */
  onRemove: () => void;
}

/**
 * Right-anchored, prominent "Clear filters (N)" button. Render inside
 * the filter bar's header/title row alongside the section label —
 * `ml-auto` pushes it to the right edge so the eye lands here after
 * the user selects filters.
 *
 * Visibility lesson from v1.17.1 / v1.17.2: customers couldn't find
 * the Clear button when it was `size="sm"` + `outline` + tucked next
 * to a muted label. This is default size, secondary (filled) variant,
 * pushed to the right edge, and shows the count of active filters.
 *
 * Renders nothing when `activeCount === 0`.
 */
export function ClearFiltersButton({
  activeCount,
  onClear,
}: {
  activeCount: number;
  onClear: () => void;
}) {
  if (activeCount === 0) return null;

  return (
    <Button
      variant="secondary"
      size="default"
      onClick={onClear}
      className="ml-auto gap-1.5 font-medium"
    >
      <X className="h-4 w-4" />
      Clear filters
      <Badge
        variant="default"
        className="ml-1 px-1.5 bg-background text-foreground hover:bg-background"
      >
        {activeCount}
      </Badge>
    </Button>
  );
}

/**
 * Row of removable chips showing what's currently filtered. Render
 * BELOW the filter inputs (typically with a `mt-3 pt-3 border-t`
 * separator). Each chip click removes that single filter.
 *
 * Renders nothing when `filters` is empty.
 */
export function ActiveFilterChips({ filters }: { filters: ActiveFilter[] }) {
  if (filters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border/50">
      <span className="text-xs font-medium text-muted-foreground mr-1">Active:</span>
      {filters.map((f) => (
        <Badge
          key={f.key}
          variant="outline"
          className="cursor-pointer gap-1 hover:bg-destructive/10 hover:border-destructive/40 transition-colors"
          onClick={f.onRemove}
        >
          {f.label}
          <X className="h-3 w-3" />
        </Badge>
      ))}
    </div>
  );
}
