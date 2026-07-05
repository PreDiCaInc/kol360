'use client';

import { useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, Check } from 'lucide-react';
import { SortableHeader } from '@/components/insights/shared/sortable-header';
import { inferHcpIdLabel, tourAnchor } from '@kol360/shared';
import { HeatMapCell } from '@/components/insights/shared/heat-map-cell';
import { KolNameLink } from '@/components/insights/shared/kol-name-link';
import { RowsPerPage } from '@/components/insights/shared/rows-per-page';
import { useExcelExport } from '@/lib/excel-export';
import { cn, toTitleCase } from '@/lib/utils';

export interface LeaderTableItem {
  rank: number;
  name: string;
  hcpId: string;
  npi?: string | null; // v1.17.32: surfaced for the full-list export
  nationalIdType?: string | null; // v1.17.69 — for MINC/NPI column-label switch on CSV export
  specialty: string | null;
  city?: string | null;
  state?: string | null;
  influencerType?: string | null;
  count: number;
}

export type LeaderTableColumn = 'name' | 'specialty' | 'city' | 'state' | 'influencerType' | 'count';

export interface LeaderTableProps {
  title: string;
  titleColor: string;
  items: LeaderTableItem[];
  columns: LeaderTableColumn[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  onSort: (field: string) => void;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onKolClick: (hcpId: string) => void;
  maxCount: number;
  exportFilename?: string;
  // v1.17.32: when provided, the export button fetches the FULL list via
  // this callback (parent owns the API call + the current filter
  // context). Without it, falls back to exporting the currently-visible
  // page (legacy behaviour).
  getAllItemsForExport?: () => Promise<LeaderTableItem[]>;
  // v1.17.55: optional ReactNode rendered inside the colored title bar
  // to the right of the title text. Used by Benchmarking to surface
  // the survey-question (i) info popover where the user's eye lands
  // (the title bar is bold white-on-color; the previous out-of-bar
  // text-xs row was easy to miss).
  titleSuffix?: React.ReactNode;
}

const COLUMN_CONFIG: Record<LeaderTableColumn, { label: string; sortField: string }> = {
  name: { label: 'Leader', sortField: 'name' },
  specialty: { label: 'Specialty', sortField: 'specialty' },
  city: { label: 'City', sortField: 'city' },
  state: { label: 'State', sortField: 'state' },
  influencerType: { label: 'Influencer Type', sortField: 'influencerType' },
  count: { label: 'Count', sortField: 'count' },
};

export function LeaderTable({
  title,
  titleColor,
  items,
  columns,
  total,
  page,
  limit,
  totalPages,
  isLoading,
  onPageChange,
  onLimitChange,
  onSort,
  sortBy,
  sortOrder,
  onKolClick,
  maxCount,
  exportFilename,
  getAllItemsForExport,
  titleSuffix,
}: LeaderTableProps) {
  const { status: excelExportStatus, exportExcel } = useExcelExport();

  // v1.17.32: export the FULL list via getAllItemsForExport when the
  // parent supplies it. NPI included in the export columns.
  const handleExport = useCallback(async () => {
    if (!items.length) return;
    const sourceItems: LeaderTableItem[] = getAllItemsForExport
      ? await getAllItemsForExport()
      : items;
    if (sourceItems.length === 0) return;

    // v1.17.69 — identifier header follows the data's country.
    const headers = ['Rank', inferHcpIdLabel(sourceItems), ...columns.map((c) => COLUMN_CONFIG[c].label)];
    const rows = sourceItems.map((item, index) => {
      const row: (string | number | null | undefined)[] = [
        // Re-number when exporting the full list so the rank column is
        // contiguous; otherwise preserve the item's own rank.
        getAllItemsForExport ? index + 1 : item.rank,
        item.npi ?? '',
      ];
      columns.forEach((col) => {
        if (col === 'count') row.push(item.count);
        else if (col === 'name') row.push(item.name);
        else if (col === 'specialty') row.push(item.specialty);
        else if (col === 'city') row.push(toTitleCase(item.city));
        else if (col === 'state') row.push(item.state);
        else if (col === 'influencerType') row.push(item.influencerType);
      });
      return row;
    });

    exportExcel({
      filename: exportFilename || title.toLowerCase().replace(/\s+/g, '-'),
      headers,
      rows,
      sheetName: title.substring(0, 31),
    });
  }, [items, columns, title, exportFilename, exportExcel, getAllItemsForExport]);

  const startRow = (page - 1) * limit + 1;
  const endRow = Math.min(page * limit, total);

  return (
    <div
      className="rounded-xl border bg-card shadow-md hover:shadow-lg transition-shadow overflow-hidden"
      {...tourAnchor('leader-table')}
    >
      {/* Color-coded title header. v1.17.57: titleSuffix right-aligned
          (justify-between) to match the Demographics card pattern —
          pteam preferred the right-corner placement over the
          immediately-next-to-title placement we shipped in v1.17.55. */}
      <div
        className={cn(
          'px-4 py-3 font-bold text-white text-base tracking-wide flex items-center justify-between gap-2',
          titleColor,
        )}
      >
        <span>{title}</span>
        {titleSuffix}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2.5 text-left text-sm font-bold w-[50px]">#</th>
              {columns.map((col) => {
                const config = COLUMN_CONFIG[col];
                if (col === 'count') {
                  return (
                    <SortableHeader
                      key={col}
                      label={config.label}
                      field={config.sortField}
                      currentSort={sortBy}
                      currentOrder={sortOrder}
                      onSort={onSort}
                    />
                  );
                }
                return (
                  <SortableHeader
                    key={col}
                    label={config.label}
                    field={config.sortField}
                    currentSort={sortBy}
                    currentOrder={sortOrder}
                    onSort={onSort}
                  />
                );
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length + 1} className="h-32 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : !items.length ? (
              <tr>
                <td colSpan={columns.length + 1} className="h-32 text-center text-muted-foreground">
                  No data available
                </td>
              </tr>
            ) : (
              items.map((item, index) => (
                <tr
                  key={item.hcpId}
                  className="border-b last:border-b-0 hover:bg-muted/40 transition-colors even:bg-muted/10"
                  {...(index === 0 ? tourAnchor('kol-row-first') : {})}
                >
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">{item.rank}</td>
                  {columns.map((col) => {
                    if (col === 'name') {
                      return (
                        <td key={col} className="px-3 py-2">
                          <KolNameLink name={item.name} onClick={() => onKolClick(item.hcpId)} />
                        </td>
                      );
                    }
                    if (col === 'count') {
                      return (
                        <HeatMapCell key={col} value={item.count} maxValue={maxCount} />
                      );
                    }
                    const value =
                      col === 'specialty' ? item.specialty :
                      col === 'city' ? toTitleCase(item.city) :
                      col === 'state' ? item.state :
                      col === 'influencerType' ? item.influencerType :
                      null;
                    return (
                      <td key={col} className="px-3 py-2 text-sm">
                        {value || '-'}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer: pagination + export */}
      <div className="px-4 py-2 border-t bg-muted/10 flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">
            {total > 0
              ? `${startRow}-${endRow} of ${total.toLocaleString()}`
              : 'No results'}
          </span>
          <RowsPerPage value={limit} onChange={onLimitChange} />
        </div>

        <div className="flex items-center gap-1">
          {/* Export button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleExport}
            disabled={!items.length || excelExportStatus === 'exporting'}
            title={excelExportStatus === 'success' ? 'Exported!' : 'Export Excel'}
          >
            {excelExportStatus === 'success' ? (
              <Check className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <FileSpreadsheet className="h-3.5 w-3.5" />
            )}
          </Button>

          {/* Pagination */}
          {totalPages > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-muted-foreground px-1">
                {page}/{totalPages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
