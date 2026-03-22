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
import { HeatMapCell } from '@/components/insights/shared/heat-map-cell';
import { KolNameLink } from '@/components/insights/shared/kol-name-link';
import { RowsPerPage } from '@/components/insights/shared/rows-per-page';
import { useExcelExport } from '@/lib/excel-export';
import { cn } from '@/lib/utils';

export interface LeaderTableItem {
  rank: number;
  name: string;
  hcpId: string;
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
}: LeaderTableProps) {
  const { status: excelExportStatus, exportExcel } = useExcelExport();

  const handleExport = useCallback(() => {
    if (!items.length) return;

    const headers = ['Rank', ...columns.map((c) => COLUMN_CONFIG[c].label)];
    const rows = items.map((item) => {
      const row: (string | number | null | undefined)[] = [item.rank];
      columns.forEach((col) => {
        if (col === 'count') row.push(item.count);
        else if (col === 'name') row.push(item.name);
        else if (col === 'specialty') row.push(item.specialty);
        else if (col === 'city') row.push(item.city);
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
  }, [items, columns, title, exportFilename, exportExcel]);

  const startRow = (page - 1) * limit + 1;
  const endRow = Math.min(page * limit, total);

  return (
    <div className="rounded-xl border bg-card shadow-md hover:shadow-lg transition-shadow overflow-hidden">
      {/* Color-coded title header */}
      <div className={cn('px-4 py-3 font-bold text-white text-base tracking-wide', titleColor)}>
        {title}
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
              items.map((item) => (
                <tr key={item.hcpId} className="border-b last:border-b-0 hover:bg-muted/40 transition-colors even:bg-muted/10">
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
                      col === 'city' ? item.city :
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
