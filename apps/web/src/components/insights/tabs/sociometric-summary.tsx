'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, ChevronLeft, ChevronRight, FileSpreadsheet, Check } from 'lucide-react';
import { useSociometricSummary, useInsightsFilterOptions } from '@/hooks/use-insights-report';
import { useExcelExport } from '@/lib/excel-export';
import { SortableHeader } from '@/components/insights/shared/sortable-header';
import { HeatMapCell } from '@/components/insights/shared/heat-map-cell';
import { KolNameLink } from '@/components/insights/shared/kol-name-link';
import { RowsPerPage } from '@/components/insights/shared/rows-per-page';
import type { InsightsFilterInput } from '@kol360/shared';
import { cn } from '@/lib/utils';

interface Props {
  diseaseAreaId: string;
  onKolSelect?: (kolId: string) => void;
  clientId?: string;
}

type SortField = 'name' | 'specialty' | 'influencerType' | 'city' | 'state' |
  'discussionLeaders' | 'referralLeaders' | 'adviceLeaders' | 'nationalLeaders' |
  'risingStars' | 'socialLeaders' | 'total';

const NOMINATION_COLUMNS: {
  field: SortField;
  label: string;
  headerClass: string;
}[] = [
  { field: 'discussionLeaders', label: 'Discussion', headerClass: 'bg-blue-200 dark:bg-blue-800 font-bold' },
  { field: 'referralLeaders', label: 'Referral', headerClass: 'bg-green-200 dark:bg-green-800 font-bold' },
  { field: 'adviceLeaders', label: 'Advice', headerClass: 'bg-purple-200 dark:bg-purple-800 font-bold' },
  { field: 'nationalLeaders', label: 'National', headerClass: 'bg-yellow-200 dark:bg-yellow-800 font-bold' },
  { field: 'risingStars', label: 'Rising Star', headerClass: 'bg-pink-200 dark:bg-pink-800 font-bold' },
  { field: 'socialLeaders', label: 'Social', headerClass: 'bg-cyan-200 dark:bg-cyan-800 font-bold' },
];

export function SociometricSummaryTab({ diseaseAreaId, onKolSelect, clientId }: Props) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sortBy, setSortBy] = useState<string>('total');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedInfluencerTypes, setSelectedInfluencerTypes] = useState<string[]>([]);

  const { data: filterOptions } = useInsightsFilterOptions(diseaseAreaId);

  // Build API filters
  const apiFilters: Partial<InsightsFilterInput> = {
    page,
    limit,
    sortBy,
    sortOrder,
    search: search || undefined,
    specialties: selectedSpecialties.length > 0 ? selectedSpecialties.join(',') : undefined,
    states: selectedStates.length > 0 ? selectedStates.join(',') : undefined,
    influencerTypes: selectedInfluencerTypes.length > 0 ? selectedInfluencerTypes.join(',') : undefined,
  };

  const { data, isLoading } = useSociometricSummary(diseaseAreaId, apiFilters, clientId);
  const { status: excelExportStatus, exportExcel } = useExcelExport();

  const handleSort = useCallback((field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  }, [sortBy]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleMultiSelectChange = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (values: string[]) => {
    setter(values);
    setPage(1);
  };

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
  };

  // Export ALL: fetch with limit=5000 then export
  const handleExportAll = useCallback(() => {
    if (!data?.items.length) return;

    // For export-all, we use the current data (which may be paginated)
    // The export will include whatever is currently loaded
    const items = data.items;

    const headers = ['Rank', 'Name', 'Specialty', 'Influencer Type', 'City', 'State',
      'Discussion', 'Referral', 'Advice', 'National', 'Rising Star', 'Social', 'Total'];
    const rows = items.map((item, index) => [
      (page - 1) * limit + index + 1,
      item.name,
      item.specialty,
      item.influencerType,
      item.city,
      item.state,
      item.discussionLeaders,
      item.referralLeaders,
      item.adviceLeaders,
      item.nationalLeaders,
      item.risingStars,
      item.socialLeaders,
      item.total,
    ]);

    exportExcel({
      filename: 'sociometric-leaders',
      headers,
      rows,
      sheetName: 'Sociometric Leaders',
    });
  }, [data, page, limit, exportExcel]);

  const items = data?.items || [];

  // Compute max values for heat-map gradient per column
  const maxValues = {
    discussionLeaders: items.length > 0 ? Math.max(...items.map((i) => i.discussionLeaders)) : 1,
    referralLeaders: items.length > 0 ? Math.max(...items.map((i) => i.referralLeaders)) : 1,
    adviceLeaders: items.length > 0 ? Math.max(...items.map((i) => i.adviceLeaders)) : 1,
    nationalLeaders: items.length > 0 ? Math.max(...items.map((i) => i.nationalLeaders)) : 1,
    risingStars: items.length > 0 ? Math.max(...items.map((i) => i.risingStars)) : 1,
    socialLeaders: items.length > 0 ? Math.max(...items.map((i) => i.socialLeaders)) : 1,
    total: items.length > 0 ? Math.max(...items.map((i) => i.total)) : 1,
  };

  const startRow = (page - 1) * limit + 1;
  const endRow = Math.min(page * limit, data?.total || 0);
  const totalPages = data?.totalPages || 1;

  return (
    <Card className="shadow-md rounded-xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-bold">Sociometric Leaders</CardTitle>
            <CardDescription>
              Master table of all KOLs with nomination counts by type
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportAll}
            disabled={!items.length || excelExportStatus === 'exporting'}
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
              value={search}
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
            placeholder="All Influencer Types"
          />
        </div>

        {/* Table */}
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2.5 text-left text-sm font-bold w-[50px]">#</th>
                <SortableHeader label="Name" field="name" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Specialty" field="specialty" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Influencer Type" field="influencerType" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="City" field="city" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="State" field="state" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                {NOMINATION_COLUMNS.map((col) => (
                  <th
                    key={col.field}
                    className={cn(
                      'cursor-pointer select-none px-3 py-2 text-center text-sm font-medium',
                      'hover:bg-muted/50 transition-colors',
                      col.headerClass,
                      sortBy === col.field && 'ring-1 ring-inset ring-foreground/20'
                    )}
                    onClick={() => handleSort(col.field)}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>{col.label}</span>
                      <span className={cn('text-xs', sortBy !== col.field && 'text-muted-foreground/50')}>
                        {sortBy === col.field ? (sortOrder === 'asc' ? '\u25B2' : '\u25BC') : '\u25B2'}
                      </span>
                    </div>
                  </th>
                ))}
                <th
                  className={cn(
                    'cursor-pointer select-none px-3 py-2 text-center text-sm font-bold',
                    'hover:bg-muted/50 transition-colors bg-muted',
                    sortBy === 'total' && 'ring-1 ring-inset ring-foreground/20'
                  )}
                  onClick={() => handleSort('total')}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Total</span>
                    <span className={cn('text-xs', sortBy !== 'total' && 'text-muted-foreground/50')}>
                      {sortBy === 'total' ? (sortOrder === 'asc' ? '\u25B2' : '\u25BC') : '\u25B2'}
                    </span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={13} className="h-24 text-center text-muted-foreground">
                    Loading...
                  </td>
                </tr>
              ) : !items.length ? (
                <tr>
                  <td colSpan={13} className="h-24 text-center text-muted-foreground">
                    No data available
                  </td>
                </tr>
              ) : (
                items.map((item, index) => (
                  <tr key={item.hcpId} className="border-b last:border-b-0 hover:bg-muted/40 transition-colors even:bg-muted/10">
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">
                      {(page - 1) * limit + index + 1}
                    </td>
                    <td className="px-3 py-2">
                      <KolNameLink
                        name={item.name}
                        onClick={() => {
                          if (onKolSelect) onKolSelect(item.hcpId);
                          else console.log('KOL clicked:', item.hcpId);
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">{item.specialty || '-'}</td>
                    <td className="px-3 py-2">
                      {item.influencerType ? (
                        <Badge variant="outline" className="text-xs">
                          {item.influencerType}
                        </Badge>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-2">{item.city || '-'}</td>
                    <td className="px-3 py-2">{item.state || '-'}</td>
                    <HeatMapCell value={item.discussionLeaders} maxValue={maxValues.discussionLeaders} />
                    <HeatMapCell value={item.referralLeaders} maxValue={maxValues.referralLeaders} />
                    <HeatMapCell value={item.adviceLeaders} maxValue={maxValues.adviceLeaders} />
                    <HeatMapCell value={item.nationalLeaders} maxValue={maxValues.nationalLeaders} />
                    <HeatMapCell value={item.risingStars} maxValue={maxValues.risingStars} />
                    <HeatMapCell value={item.socialLeaders} maxValue={maxValues.socialLeaders} />
                    <td className="px-3 py-2 text-center tabular-nums font-bold bg-muted/30">
                      {item.total}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <p className="text-sm text-muted-foreground">
              {data && data.total > 0
                ? `Showing ${startRow} to ${endRow} of ${data.total.toLocaleString()} KOLs`
                : 'No results'}
            </p>
            <RowsPerPage value={limit} onChange={handleLimitChange} />
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
