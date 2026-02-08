/**
 * Shared CSV export utility
 * Eliminates duplicate export logic across Insights Report components
 */

import { useState, useCallback } from 'react';

export type ExportStatus = 'idle' | 'exporting' | 'success';

export interface CsvExportOptions {
  /** Filename without extension (date will be appended) */
  filename: string;
  /** Column headers */
  headers: string[];
  /** Data rows - each row is an array of cell values */
  rows: (string | number | null | undefined)[][];
}

/**
 * Exports data to a CSV file and triggers download
 *
 * @example
 * exportToCsv({
 *   filename: 'kol-explorer',
 *   headers: ['Rank', 'Name', 'Score'],
 *   rows: data.map((item, i) => [i + 1, item.name, item.score])
 * });
 */
export function exportToCsv({ filename, headers, rows }: CsvExportOptions): void {
  if (!rows.length) return;

  // Escape and quote cell values to handle commas, quotes, and newlines
  const escapeCell = (cell: string | number | null | undefined): string => {
    const value = cell ?? '';
    const stringValue = String(value);
    // Escape double quotes by doubling them
    const escaped = stringValue.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const csvContent = [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => row.map(escapeCell).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.href = url;
  link.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();

  // Clean up to avoid memory leaks
  URL.revokeObjectURL(url);
}

/**
 * Hook for CSV export with visual feedback
 * Returns status ('idle' | 'exporting' | 'success') and export function
 *
 * @example
 * const { status, exportCsv } = useCsvExport();
 * // status: 'idle' -> 'exporting' -> 'success' -> 'idle' (after 1.5s)
 * <Button onClick={() => exportCsv({ filename, headers, rows })}>
 *   {status === 'success' ? 'Exported!' : 'Export CSV'}
 * </Button>
 */
export function useCsvExport() {
  const [status, setStatus] = useState<ExportStatus>('idle');

  const exportCsv = useCallback((options: CsvExportOptions) => {
    if (!options.rows.length) return;

    setStatus('exporting');

    // Small delay for UI feedback
    setTimeout(() => {
      exportToCsv(options);
      setStatus('success');

      // Reset after brief success display
      setTimeout(() => setStatus('idle'), 1500);
    }, 100);
  }, []);

  return { status, exportCsv };
}
