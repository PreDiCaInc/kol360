'use client';

import { Button } from '@/components/ui/button';
import { Loader2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * v1.17.53 — Track B (Apply Filters batch UX).
 *
 * Companion to filter-clear-controls.tsx. Renders the Apply button +
 * live "N match" indicator + Reset on the right side of a filter bar's
 * header row. Use `ml-auto` on the wrapping div to push right-aligned.
 *
 * Visual contract:
 *   - When `isDirty` is true:    Apply is a filled/colored primary button.
 *                                 The user's eye lands here.
 *   - When `isDirty` is false:   Apply is muted/outline + disabled.
 *                                 No work to do.
 *   - When `isLoading` is true:  Apply shows spinner + "Applying…".
 *                                 Disabled to prevent double-fires.
 *
 * Match-count display:
 *   - When `countIsFetching` is true: show "…" so users see freshness.
 *   - When `liveCount` is defined: render `{N} {countLabel}`.
 *   - When `liveCount` is undefined: render nothing (no fallback).
 *
 * Per pteam ticket: count text varies per tab ("234 KOLs match",
 * "178 respondents match", "12 nominators match"). Component just
 * displays whatever caller passes; tab decides the label.
 */
export interface ApplyFilterControlsProps {
  isDirty: boolean;
  isLoading?: boolean;
  liveCount: number | undefined;
  countIsFetching?: boolean;
  /** Tab-specific noun: "KOLs match", "respondents match", "nominators match". */
  countLabel: string;
  hasActiveFilters: boolean;
  onApply: () => void;
  onReset: () => void;
  /** Optional override id for keyboard-shortcut wiring. */
  applyButtonId?: string;
  className?: string;
}

export function ApplyFilterControls({
  isDirty,
  isLoading = false,
  liveCount,
  countIsFetching = false,
  countLabel,
  hasActiveFilters,
  onApply,
  onReset,
  applyButtonId,
  className,
}: ApplyFilterControlsProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="text-sm text-muted-foreground tabular-nums">
        {countIsFetching ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" /> {countLabel}
          </span>
        ) : liveCount !== undefined ? (
          <>
            <span className="font-medium text-foreground">{liveCount.toLocaleString()}</span>{' '}
            {countLabel}
          </>
        ) : null}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onReset}
        disabled={isLoading || !hasActiveFilters}
        className="gap-1.5"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Reset
      </Button>
      <Button
        id={applyButtonId}
        type="button"
        variant={isDirty ? 'default' : 'outline'}
        size="sm"
        onClick={onApply}
        disabled={isLoading || !isDirty}
        className={cn(isDirty && 'shadow-sm', 'min-w-[7.5rem]')}
      >
        {isLoading ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Applying…
          </span>
        ) : (
          'Apply Filters'
        )}
      </Button>
    </div>
  );
}
