'use client';

import { Columns3, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import type { ColumnVisibility } from '@/hooks/use-column-visibility';

// v1.17.41 — popover with checkbox toggles for each non-pinned
// column on a table. Pinned columns (sticky # + Name) aren't listed
// — they're anchors that should always be visible.
//
// Used by the KOL Explorer (Weighted Score tab) + Sociometric
// Summary tab. Per-table storage key keeps selections independent.

export interface ColumnOption {
  key: string;
  label: string;
}

interface Props {
  columns: ColumnOption[];
  visibility: ColumnVisibility;
}

export function ColumnSelector({ columns, visibility }: Props) {
  const hiddenCount = columns.filter((c) => !visibility.isVisible(c.key)).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2">
          <Columns3 className="h-4 w-4" />
          Columns
          {hiddenCount > 0 && (
            <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums">
              −{hiddenCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="flex items-center justify-between border-b px-2 py-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Columns
          </span>
          <button
            type="button"
            onClick={visibility.reset}
            className="flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            title="Reset to defaults"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        </div>
        <ul className="mt-1 space-y-0.5 max-h-72 overflow-y-auto">
          {columns.map((col) => (
            <li key={col.key}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50">
                <Checkbox
                  checked={visibility.isVisible(col.key)}
                  onCheckedChange={() => visibility.toggle(col.key)}
                />
                <span className="flex-1">{col.label}</span>
              </label>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
