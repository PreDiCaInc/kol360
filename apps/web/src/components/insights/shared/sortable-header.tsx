'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SortableHeaderProps {
  label: string;
  field: string;
  currentSort: string;
  currentOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
  /**
   * Optional element rendered after the label (before the sort arrow).
   * v1.17.40: used to attach the score-methodology (i) tooltip next to
   * Survey / Total / per-segment column headers without breaking the
   * existing layout. Click events on the extra do not trigger sort
   * (stopped at the wrapping span).
   */
  headerExtra?: ReactNode;
  /**
   * v1.17.40: extra Tailwind classes for the <th> wrapper. Used for the
   * sticky-Name column on the KOL Explorer table so horizontal scroll
   * leaves the name visible.
   */
  className?: string;
}

export function SortableHeader({
  label,
  field,
  currentSort,
  currentOrder,
  onSort,
  headerExtra,
  className,
}: SortableHeaderProps) {
  const isActive = currentSort === field;

  return (
    <th
      className={cn(
        'cursor-pointer select-none px-3 py-2 text-left text-sm font-medium',
        'hover:bg-muted/50 transition-colors',
        isActive && 'text-foreground',
        className
      )}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {headerExtra ? (
          <span onClick={(e) => e.stopPropagation()}>{headerExtra}</span>
        ) : null}
        <span className={cn('text-xs', !isActive && 'text-muted-foreground/50')}>
          {isActive ? (currentOrder === 'asc' ? '\u25B2' : '\u25BC') : '\u25B2'}
        </span>
      </div>
    </th>
  );
}
