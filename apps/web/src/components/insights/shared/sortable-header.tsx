'use client';

import { cn } from '@/lib/utils';

interface SortableHeaderProps {
  label: string;
  field: string;
  currentSort: string;
  currentOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
}

export function SortableHeader({
  label,
  field,
  currentSort,
  currentOrder,
  onSort,
}: SortableHeaderProps) {
  const isActive = currentSort === field;

  return (
    <th
      className={cn(
        'cursor-pointer select-none px-3 py-2 text-left text-sm font-medium',
        'hover:bg-muted/50 transition-colors',
        isActive && 'text-foreground'
      )}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        <span className={cn('text-xs', !isActive && 'text-muted-foreground/50')}>
          {isActive ? (currentOrder === 'asc' ? '\u25B2' : '\u25BC') : '\u25B2'}
        </span>
      </div>
    </th>
  );
}
