'use client';

import { useMemo, useState } from 'react';
import { BarChart3, Table2 } from 'lucide-react';

/**
 * v1.17.57 — Shared Chart/Table toggle.
 *
 * Wraps a chart with a right-aligned "Chart | Table" toggle. When the
 * user flips to Table, the chart is replaced with a tabular row-by-row
 * listing of the same data — useful for copy-paste, filtering in
 * Excel, or just reading exact numbers.
 *
 * Precedent: state-bar-chart.tsx had this toggle inline since v1.17.5;
 * pteam asked to add the same affordance to every Demographics chart
 * card. Extracted into this wrapper so all chart cards (including the
 * retrofitted StateBarChart) share one source of truth.
 *
 * Data shape: `{ name, value }` with optional `secondaryValue` for
 * two-column displays (Core Focus × Avg Monthly Patients renders both
 * "Avg" and "Count" columns, for example).
 *
 * Table view defaults: filter empty names + zero values, sort by
 * `value` desc, cap rows at `tableRowLimit` (default 50 — enough for
 * State which has 50+ US states).
 */
export interface ChartTableRow {
  name: string;
  value: number;
  /** Optional secondary metric (e.g. "Count" alongside "Avg"). */
  secondaryValue?: number;
}

export interface ChartTableToggleProps {
  /** Rows for the table view. */
  data: ChartTableRow[];
  /** Header label for the primary value column. Defaults to "Count". */
  valueLabel?: string;
  /** Header label for the secondary value column. Only shown when at
   *  least one row has `secondaryValue` set. */
  secondaryValueLabel?: string;
  /** Max rows in the table view. Defaults to 50. */
  tableRowLimit?: number;
  /** The chart node to render when view === 'chart'. */
  children: React.ReactNode;
  /** Optional default view. Defaults to 'chart'. */
  defaultView?: 'chart' | 'table';
}

export function ChartTableToggle({
  data,
  valueLabel = 'Count',
  secondaryValueLabel,
  tableRowLimit = 50,
  children,
  defaultView = 'chart',
}: ChartTableToggleProps) {
  const [view, setView] = useState<'chart' | 'table'>(defaultView);

  const tableRows = useMemo(
    () =>
      data
        .filter((d) => d.name && d.name.trim() !== '' && d.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, tableRowLimit),
    [data, tableRowLimit],
  );

  const hasSecondary = tableRows.some((r) => r.secondaryValue !== undefined);

  return (
    <div>
      {/* Toggle — right-aligned per StateBarChart precedent. */}
      <div className="flex justify-end mb-2">
        <div className="inline-flex rounded-md border border-input bg-muted/30 p-0.5">
          <button
            type="button"
            onClick={() => setView('chart')}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              view === 'chart'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Chart
          </button>
          <button
            type="button"
            onClick={() => setView('table')}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              view === 'table'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Table2 className="h-3.5 w-3.5" />
            Table
          </button>
        </div>
      </div>

      {view === 'chart' ? (
        // v1.18.3 — guaranteed-100%-width wrapper. Recharts'
        // ResponsiveContainer measures its parent at mount; without an
        // explicit width the pie card renders blank (Tailwind class
        // cascade race). Wrapping every chart child ensures new callers
        // don't have to re-add `w-full` inline. See
        // docs/findings/insights-demographics-pie-blank-inside-chart-table-toggle-2026-07-08.md
        // Fix #1 shipped in v1.17.76 at 2 known sites; this is Fix #2
        // (the wrapper-level cleanup) that supersedes the inline
        // workaround for any future chart type dropped in here.
        <div className="w-full">{children}</div>
      ) : tableRows.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
          No data available
        </div>
      ) : (
        <div className="rounded-md border max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b">
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">#</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Name</th>
                <th className="px-3 py-2 text-right font-semibold text-muted-foreground">
                  {valueLabel}
                </th>
                {hasSecondary && (
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground">
                    {secondaryValueLabel ?? 'Secondary'}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r, i) => (
                <tr key={r.name} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-1.5">{r.name}</td>
                  <td className="px-3 py-1.5 font-mono text-right font-semibold">{r.value}</td>
                  {hasSecondary && (
                    <td className="px-3 py-1.5 font-mono text-right">
                      {r.secondaryValue ?? '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
