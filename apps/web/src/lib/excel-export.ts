/**
 * Shared Excel export utility
 * Provides Excel (.xlsx) export functionality alongside CSV exports
 * Excel is strongly preferred by pharma clients
 */

import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';

export type ExportStatus = 'idle' | 'exporting' | 'success';

export interface ExcelExportOptions {
  /** Filename without extension (date will be appended) */
  filename: string;
  /** Column headers */
  headers: string[];
  /** Data rows - each row is an array of cell values */
  rows: (string | number | null | undefined)[][];
  /** Optional sheet name (defaults to 'Data') */
  sheetName?: string;
}

export interface MultiSheetExportOptions {
  /** Filename without extension (date will be appended) */
  filename: string;
  /** Array of sheets to include */
  sheets: {
    name: string;
    headers: string[];
    rows: (string | number | null | undefined)[][];
  }[];
}

/**
 * Exports data to an Excel file and triggers download
 *
 * @example
 * exportToExcel({
 *   filename: 'kol-explorer',
 *   headers: ['Rank', 'Name', 'Score'],
 *   rows: data.map((item, i) => [i + 1, item.name, item.score])
 * });
 */
export function exportToExcel({ filename, headers, rows, sheetName = 'Data' }: ExcelExportOptions): void {
  if (!rows.length) return;

  // Create worksheet data with headers
  const wsData = [headers, ...rows];

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Auto-size columns based on content
  const colWidths = headers.map((header, colIndex) => {
    const maxLength = Math.max(
      header.length,
      ...rows.map((row) => {
        const cell = row[colIndex];
        return cell != null ? String(cell).length : 0;
      })
    );
    return { wch: Math.min(Math.max(maxLength + 2, 10), 50) };
  });
  ws['!cols'] = colWidths;

  // Create workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // Generate and download file
  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `${filename}-${dateStr}.xlsx`);
}

/**
 * Exports multiple sheets to a single Excel file
 *
 * @example
 * exportMultiSheetExcel({
 *   filename: 'leader-rankings',
 *   sheets: [
 *     { name: 'Discussion Leaders', headers: [...], rows: [...] },
 *     { name: 'Referral Leaders', headers: [...], rows: [...] },
 *   ]
 * });
 */
export function exportMultiSheetExcel({ filename, sheets }: MultiSheetExportOptions): void {
  if (!sheets.length) return;

  // Create workbook
  const wb = XLSX.utils.book_new();

  // Add each sheet
  sheets.forEach(({ name, headers, rows }) => {
    if (!rows.length) return;

    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Auto-size columns
    const colWidths = headers.map((header, colIndex) => {
      const maxLength = Math.max(
        header.length,
        ...rows.map((row) => {
          const cell = row[colIndex];
          return cell != null ? String(cell).length : 0;
        })
      );
      return { wch: Math.min(Math.max(maxLength + 2, 10), 50) };
    });
    ws['!cols'] = colWidths;

    // Truncate sheet name to 31 chars (Excel limit)
    const safeName = name.substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  });

  // Generate and download file
  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `${filename}-${dateStr}.xlsx`);
}

/**
 * Hook for Excel export with visual feedback
 * Returns status ('idle' | 'exporting' | 'success') and export function
 *
 * @example
 * const { status, exportExcel } = useExcelExport();
 * // status: 'idle' -> 'exporting' -> 'success' -> 'idle' (after 1.5s)
 * <Button onClick={() => exportExcel({ filename, headers, rows })}>
 *   {status === 'success' ? 'Exported!' : 'Export Excel'}
 * </Button>
 */
export function useExcelExport() {
  const [status, setStatus] = useState<ExportStatus>('idle');

  const exportExcel = useCallback((options: ExcelExportOptions) => {
    if (!options.rows.length) return;

    setStatus('exporting');

    // Small delay for UI feedback
    setTimeout(() => {
      exportToExcel(options);
      setStatus('success');

      // Reset after brief success display
      setTimeout(() => setStatus('idle'), 1500);
    }, 100);
  }, []);

  const exportMultiSheet = useCallback((options: MultiSheetExportOptions) => {
    if (!options.sheets.length) return;

    setStatus('exporting');

    setTimeout(() => {
      exportMultiSheetExcel(options);
      setStatus('success');

      setTimeout(() => setStatus('idle'), 1500);
    }, 100);
  }, []);

  return { status, exportExcel, exportMultiSheet };
}
