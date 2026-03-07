'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Download } from 'lucide-react';
import { useSociometricSummary, useInsightsFilterOptions } from '@/hooks/use-insights-report';
import { useCsvExport } from '@/lib/csv-export';
import { useExcelExport } from '@/lib/excel-export';
import { Check, FileSpreadsheet } from 'lucide-react';
import type { InsightsFilterInput, SociometricSummaryItem } from '@kol360/shared';
import { cn } from '@/lib/utils';

interface Props {
  diseaseAreaId: string;
  onKolSelect?: (kolId: string) => void;
  globalFilters?: Partial<InsightsFilterInput>;
}

type SortField = 'total' | 'discussionLeaders' | 'referralLeaders' | 'adviceLeaders' | 'nationalLeaders' | 'risingStars' | 'socialLeaders' | 'biasedLeaders' | 'regional' | 'name';
type SortOrder = 'asc' | 'desc';

const NOMINATION_COLORS = {
  discussionLeaders: { bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-700 dark:text-blue-300', header: 'bg-blue-100 dark:bg-blue-900' },
  referralLeaders: { bg: 'bg-green-50 dark:bg-green-950', text: 'text-green-700 dark:text-green-300', header: 'bg-green-100 dark:bg-green-900' },
  adviceLeaders: { bg: 'bg-purple-50 dark:bg-purple-950', text: 'text-purple-700 dark:text-purple-300', header: 'bg-purple-100 dark:bg-purple-900' },
  nationalLeaders: { bg: 'bg-yellow-50 dark:bg-yellow-950', text: 'text-yellow-700 dark:text-yellow-300', header: 'bg-yellow-100 dark:bg-yellow-900' },
  risingStars: { bg: 'bg-pink-50 dark:bg-pink-950', text: 'text-pink-700 dark:text-pink-300', header: 'bg-pink-100 dark:bg-pink-900' },
  socialLeaders: { bg: 'bg-cyan-50 dark:bg-cyan-950', text: 'text-cyan-700 dark:text-cyan-300', header: 'bg-cyan-100 dark:bg-cyan-900' },
  biasedLeaders: { bg: 'bg-red-50 dark:bg-red-950', text: 'text-red-700 dark:text-red-300', header: 'bg-red-100 dark:bg-red-900' },
  regional: { bg: 'bg-slate-50 dark:bg-slate-950', text: 'text-slate-700 dark:text-slate-300', header: 'bg-slate-100 dark:bg-slate-900' },
};

export function SociometricSummaryTab({ diseaseAreaId, onKolSelect, globalFilters = {} }: Props) {
  const [sortField, setSortField] = useState<SortField>('total');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filters, setFilters] = useState<Partial<InsightsFilterInput>>({
    page: 1,
    limit: 25,
    sortBy: 'total',
    sortOrder: 'desc',
  });

  // Multi-select state (form-only, not URL params)
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedInfluencerTypes, setSelectedInfluencerTypes] = useState<string[]>([]);

  const { data: filterOptions } = useInsightsFilterOptions(diseaseAreaId);

  // Build API filters including multi-select as comma-separated strings
  // Global filters override local tab filters when present
  const apiFilters = {
    ...filters,
    specialties: globalFilters?.specialties || (selectedSpecialties.length > 0 ? selectedSpecialties.join(',') : undefined),
    states: globalFilters?.states || (selectedStates.length > 0 ? selectedStates.join(',') : undefined),
    influencerTypes: globalFilters?.influencerType || (selectedInfluencerTypes.length > 0 ? selectedInfluencerTypes.join(',') : undefined),
  };

  const { data, isLoading } = useSociometricSummary(diseaseAreaId, apiFilters);
  const { status: exportStatus, exportCsv } = useCsvExport();
  const { status: excelExportStatus, exportExcel } = useExcelExport();

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters((prev) => ({ ...prev, search: e.target.value, page: 1 }));
  };

  // Reset page when multi-select changes
  const handleMultiSelectChange = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (values: string[]) => {
    setter(values);
    setFilters((prev) => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  const handleSort = useCallback((field: SortField) => {
    const newOrder = sortField === field && sortOrder === 'desc' ? 'asc' : 'desc';
    setSortField(field);
    setSortOrder(newOrder);
    // Update filters to trigger server-side sorting
    setFilters((prev) => ({
      ...prev,
      sortBy: field,
      sortOrder: newOrder,
      page: 1, // Reset to first page when sorting changes
    }));
  }, [sortField, sortOrder]);

  // Items are now sorted server-side
  const sortedItems = data?.items || [];

  // Export headers and row builder - shared between CSV and Excel
  const exportHeaders = ['Rank', 'Name', 'Specialty', 'State', 'Type', 'Discussion', 'Referral', 'Advice', 'National', 'Rising', 'Social', 'Biased', 'Regional', 'Total'];

  const buildExportRows = useCallback(() => {
    if (!sortedItems.length) return [];
    return sortedItems.map((item, index) => [
      ((filters.page || 1) - 1) * (filters.limit || 25) + index + 1,
      item.name,
      item.specialty,
      item.state,
      item.influencerType,
      item.discussionLeaders,
      item.referralLeaders,
      item.adviceLeaders,
      item.nationalLeaders,
      item.risingStars,
      item.socialLeaders,
      item.biasedLeaders,
      item.regional,
      item.total,
    ]);
  }, [sortedItems, filters.page, filters.limit]);

  // Export to CSV
  const handleExportCSV = useCallback(() => {
    const rows = buildExportRows();
    if (!rows.length) return;

    exportCsv({
      filename: 'sociometric-summary',
      headers: exportHeaders,
      rows,
    });
  }, [buildExportRows, exportCsv]);

  // Export to Excel
  const handleExportExcel = useCallback(() => {
    const rows = buildExportRows();
    if (!rows.length) return;

    exportExcel({
      filename: 'sociometric-summary',
      headers: exportHeaders,
      rows,
      sheetName: 'Sociometric Summary',
    });
  }, [buildExportRows, exportExcel]);

  const SortableHeader = ({ field, children, className }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <TableHead
      className={cn('cursor-pointer select-none hover:bg-muted/50 transition-colors', className)}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center justify-end gap-1">
        {children}
        {sortField === field ? (
          sortOrder === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </div>
    </TableHead>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Sociometric Leaders Summary</CardTitle>
            <CardDescription>
              Master table of all KOLs with nomination counts by type
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportExcel}
              disabled={!data?.items.length || excelExportStatus === 'exporting'}
            >
              {excelExportStatus === 'success' ? (
                <>
                  <Check className="h-4 w-4 mr-2 text-green-600" />
                  Exported!
                </>
              ) : (
                <>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export Excel
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={!data?.items.length || exportStatus === 'exporting'}
            >
              {exportStatus === 'success' ? (
                <>
                  <Check className="h-4 w-4 mr-2 text-green-600" />
                  Exported!
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name..."
              className="pl-9"
              value={filters.search || ''}
              onChange={handleSearchChange}
            />
          </div>
          <MultiSelect
            options={filterOptions?.specialties || []}
            selected={selectedSpecialties}
            onChange={handleMultiSelectChange(setSelectedSpecialties)}
            placeholder="All Specialties"
          />
          <MultiSelect
            options={filterOptions?.states || []}
            selected={selectedStates}
            onChange={handleMultiSelectChange(setSelectedStates)}
            placeholder="All States"
          />
          <MultiSelect
            options={filterOptions?.influencerTypes || []}
            selected={selectedInfluencerTypes}
            onChange={handleMultiSelectChange(setSelectedInfluencerTypes)}
            placeholder="All Types"
          />
        </div>

        {/* Results Table */}
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">#</TableHead>
                <TableHead
                  className="cursor-pointer select-none hover:bg-muted/50 transition-colors"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-1">
                    Name
                    {sortField === 'name' ? (
                      sortOrder === 'asc' ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </div>
                </TableHead>
                <TableHead>Specialty</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Type</TableHead>
                <SortableHeader field="discussionLeaders" className={NOMINATION_COLORS.discussionLeaders.header}>
                  Discussion
                </SortableHeader>
                <SortableHeader field="referralLeaders" className={NOMINATION_COLORS.referralLeaders.header}>
                  Referral
                </SortableHeader>
                <SortableHeader field="adviceLeaders" className={NOMINATION_COLORS.adviceLeaders.header}>
                  Advice
                </SortableHeader>
                <SortableHeader field="nationalLeaders" className={NOMINATION_COLORS.nationalLeaders.header}>
                  National
                </SortableHeader>
                <SortableHeader field="risingStars" className={NOMINATION_COLORS.risingStars.header}>
                  Rising
                </SortableHeader>
                <SortableHeader field="socialLeaders" className={NOMINATION_COLORS.socialLeaders.header}>
                  Social
                </SortableHeader>
                <SortableHeader field="biasedLeaders" className={NOMINATION_COLORS.biasedLeaders.header}>
                  Biased
                </SortableHeader>
                <SortableHeader field="regional" className={NOMINATION_COLORS.regional.header}>
                  Regional
                </SortableHeader>
                <SortableHeader field="total" className="font-bold">
                  Total
                </SortableHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={13} className="h-24 text-center">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : !sortedItems.length ? (
                <TableRow>
                  <TableCell colSpan={13} className="h-24 text-center">
                    No data available
                  </TableCell>
                </TableRow>
              ) : (
                sortedItems.map((item, index) => (
                  <TableRow key={item.hcpId} className={onKolSelect ? 'cursor-pointer hover:bg-muted/50' : ''}>
                    <TableCell className="text-muted-foreground">
                      {((filters.page || 1) - 1) * (filters.limit || 25) + index + 1}
                    </TableCell>
                    <TableCell
                      className="font-medium text-primary hover:underline cursor-pointer"
                      onClick={() => onKolSelect?.(item.hcpId)}
                    >
                      {item.name}
                    </TableCell>
                    <TableCell>{item.specialty || '-'}</TableCell>
                    <TableCell>{item.state || '-'}</TableCell>
                    <TableCell>
                      {item.influencerType && (
                        <Badge variant="outline" className="text-xs">
                          {item.influencerType}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className={cn('text-right font-mono', NOMINATION_COLORS.discussionLeaders.bg, NOMINATION_COLORS.discussionLeaders.text)}>
                      {item.discussionLeaders || '-'}
                    </TableCell>
                    <TableCell className={cn('text-right font-mono', NOMINATION_COLORS.referralLeaders.bg, NOMINATION_COLORS.referralLeaders.text)}>
                      {item.referralLeaders || '-'}
                    </TableCell>
                    <TableCell className={cn('text-right font-mono', NOMINATION_COLORS.adviceLeaders.bg, NOMINATION_COLORS.adviceLeaders.text)}>
                      {item.adviceLeaders || '-'}
                    </TableCell>
                    <TableCell className={cn('text-right font-mono', NOMINATION_COLORS.nationalLeaders.bg, NOMINATION_COLORS.nationalLeaders.text)}>
                      {item.nationalLeaders || '-'}
                    </TableCell>
                    <TableCell className={cn('text-right font-mono', NOMINATION_COLORS.risingStars.bg, NOMINATION_COLORS.risingStars.text)}>
                      {item.risingStars || '-'}
                    </TableCell>
                    <TableCell className={cn('text-right font-mono', NOMINATION_COLORS.socialLeaders.bg, NOMINATION_COLORS.socialLeaders.text)}>
                      {item.socialLeaders || '-'}
                    </TableCell>
                    <TableCell className={cn('text-right font-mono', NOMINATION_COLORS.biasedLeaders.bg, NOMINATION_COLORS.biasedLeaders.text)}>
                      {item.biasedLeaders || '-'}
                    </TableCell>
                    <TableCell className={cn('text-right font-mono', NOMINATION_COLORS.regional.bg, NOMINATION_COLORS.regional.text)}>
                      {item.regional || '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold bg-muted">
                      {item.total}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {((filters.page || 1) - 1) * (filters.limit || 25) + 1} to{' '}
              {Math.min((filters.page || 1) * (filters.limit || 25), data.total)} of{' '}
              {data.total.toLocaleString()} KOLs
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange((filters.page || 1) - 1)}
                disabled={(filters.page || 1) <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                Page {filters.page || 1} of {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange((filters.page || 1) + 1)}
                disabled={(filters.page || 1) >= data.totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
