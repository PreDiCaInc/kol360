'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronLeft, ChevronRight, LayoutGrid, List, Download } from 'lucide-react';
import { useLeaderRankings, useInsightsFilterOptions } from '@/hooks/use-insights-report';
import { useCsvExport } from '@/lib/csv-export';
import { useExcelExport } from '@/lib/excel-export';
import { Check, FileSpreadsheet } from 'lucide-react';
import type { NominationType, LeaderRankingQuery, InsightsFilterInput } from '@kol360/shared';

interface Props {
  diseaseAreaId: string;
  onKolSelect?: (kolId: string) => void;
  globalFilters?: Partial<InsightsFilterInput>;
}

const NOMINATION_TYPES: { value: NominationType; label: string; color: string; bgColor: string }[] = [
  { value: 'DISCUSSION_LEADERS', label: 'Discussion Leaders', color: 'bg-blue-500', bgColor: 'bg-blue-100 dark:bg-blue-950' },
  { value: 'REFERRAL_LEADERS', label: 'Referral Leaders', color: 'bg-green-500', bgColor: 'bg-green-100 dark:bg-green-950' },
  { value: 'ADVICE_LEADERS', label: 'Advice Leaders', color: 'bg-purple-500', bgColor: 'bg-purple-100 dark:bg-purple-950' },
  { value: 'NATIONAL_LEADER', label: 'National Leaders', color: 'bg-yellow-500', bgColor: 'bg-yellow-100 dark:bg-yellow-950' },
  { value: 'RISING_STAR', label: 'Rising Stars', color: 'bg-pink-500', bgColor: 'bg-pink-100 dark:bg-pink-950' },
  { value: 'SOCIAL_LEADER', label: 'Social Leaders', color: 'bg-cyan-500', bgColor: 'bg-cyan-100 dark:bg-cyan-950' },
  { value: 'REGIONAL_LEADER', label: 'Regional Leaders', color: 'bg-slate-500', bgColor: 'bg-slate-100 dark:bg-slate-950' },
  { value: 'BIASED_LEADER', label: 'Biased Leaders', color: 'bg-red-500', bgColor: 'bg-red-100 dark:bg-red-950' },
];

interface RankingTableProps {
  diseaseAreaId: string;
  nominationType: NominationType;
  label: string;
  color: string;
  bgColor: string;
  filters?: { states?: string; specialties?: string };
  compact?: boolean;
  onExport?: (nominationType: string, data: { rank: number; name: string; degree: string | null; specialty: string | null; city: string | null; state: string | null; count: number }[]) => void;
  onKolSelect?: (kolId: string) => void;
}

function RankingTable({
  diseaseAreaId,
  nominationType,
  label,
  color,
  bgColor,
  filters = {},
  compact = false,
  onExport,
  onKolSelect,
}: RankingTableProps) {
  const [page, setPage] = useState(1);
  // Intentionally lower than schema max (100) for optimal UX:
  // - Grid view (compact): 10 rows fits card height without scrolling
  // - Tab view: 15 rows provides good detail while keeping table scannable
  const limit = compact ? 10 : 15;

  const { data, isLoading } = useLeaderRankings(diseaseAreaId, nominationType, {
    ...filters,
    page,
    limit,
  });
  const { status: exportStatus, exportCsv } = useCsvExport();
  const { status: excelExportStatus, exportExcel } = useExcelExport();

  const exportHeaders = ['Rank', 'Name', 'Degree', 'Specialty', 'City', 'State', 'Count'];

  const buildExportRows = useCallback(() => {
    if (!data?.items.length) return [];
    return data.items.map((item) => [
      item.rank,
      item.name,
      item.degree,
      item.specialty,
      item.city,
      item.state,
      item.count,
    ]);
  }, [data?.items]);

  const handleExportCsv = useCallback(() => {
    const rows = buildExportRows();
    if (!rows.length) return;

    const csvData = data?.items.map((item) => ({
      rank: item.rank,
      name: item.name,
      degree: item.degree,
      specialty: item.specialty,
      city: item.city,
      state: item.state,
      count: item.count,
    }));

    if (onExport && csvData) {
      onExport(label, csvData);
    } else {
      exportCsv({
        filename: `${label.toLowerCase().replace(/\s+/g, '-')}-rankings`,
        headers: exportHeaders,
        rows,
      });
    }
  }, [data?.items, label, onExport, exportCsv, buildExportRows]);

  const handleExportExcel = useCallback(() => {
    const rows = buildExportRows();
    if (!rows.length) return;

    exportExcel({
      filename: `${label.toLowerCase().replace(/\s+/g, '-')}-rankings`,
      headers: exportHeaders,
      rows,
      sheetName: label,
    });
  }, [buildExportRows, exportExcel, label]);

  if (isLoading) {
    return (
      <div className={`${compact ? 'h-48' : 'h-64'} flex items-center justify-center text-muted-foreground`}>
        Loading...
      </div>
    );
  }

  if (!data?.items.length) {
    return (
      <div className={`${compact ? 'h-48' : 'h-64'} flex items-center justify-center text-muted-foreground`}>
        No data available
      </div>
    );
  }

  const maxCount = data.items[0]?.count || 1;

  return (
    <div className="space-y-2">
      <div className={`rounded-md border ${bgColor}`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">#</TableHead>
              <TableHead>Leader</TableHead>
              <TableHead className={compact ? 'hidden' : 'w-[50px]'}>Deg</TableHead>
              <TableHead className={compact ? 'hidden md:table-cell' : ''}>Specialty</TableHead>
              <TableHead className={compact ? 'hidden lg:table-cell' : ''}>Location</TableHead>
              <TableHead className="w-[120px] text-right">Count</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item) => (
              <TableRow key={item.hcpId} className={onKolSelect ? 'cursor-pointer hover:bg-muted/50' : ''}>
                <TableCell className="font-medium text-muted-foreground">{item.rank}</TableCell>
                <TableCell
                  className="font-medium text-primary hover:underline cursor-pointer"
                  onClick={() => onKolSelect?.(item.hcpId)}
                >
                  {item.name}
                </TableCell>
                <TableCell className={compact ? 'hidden' : ''}>
                  <span className="text-[10px] text-muted-foreground">{item.degree || '-'}</span>
                </TableCell>
                <TableCell className={compact ? 'hidden md:table-cell' : ''}>
                  {item.specialty || '-'}
                </TableCell>
                <TableCell className={compact ? 'hidden lg:table-cell' : ''}>
                  {item.city && item.state
                    ? `${item.city}, ${item.state}`
                    : item.state || '-'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full ${color} rounded-full`}
                        style={{ width: `${(item.count / maxCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-mono w-8 text-right">{item.count}</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination & Export */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {data.total > 0
            ? `${((page - 1) * limit + 1)}-${Math.min(page * limit, data.total)} of ${data.total}`
            : 'No results'}
        </span>
        <div className="flex items-center gap-1">
          {!compact && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleExportExcel}
                disabled={!data.items.length || excelExportStatus === 'exporting'}
                title={excelExportStatus === 'success' ? 'Exported!' : 'Export Excel'}
              >
                {excelExportStatus === 'success' ? (
                  <Check className="h-3 w-3 text-green-600" />
                ) : (
                  <FileSpreadsheet className="h-3 w-3" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleExportCsv}
                disabled={!data.items.length || exportStatus === 'exporting'}
                title={exportStatus === 'success' ? 'Exported!' : 'Export CSV'}
              >
                {exportStatus === 'success' ? (
                  <Check className="h-3 w-3 text-green-600" />
                ) : (
                  <Download className="h-3 w-3" />
                )}
              </Button>
            </>
          )}
          {data.totalPages > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <span className="text-muted-foreground">{page}/{data.totalPages}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= data.totalPages}
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Parse URL search params for view mode and active type only
function parseUrlFilters(searchParams: URLSearchParams): {
  viewMode: 'tabs' | 'grid';
  activeType: NominationType;
} {
  return {
    viewMode: (searchParams.get('lrView') as 'tabs' | 'grid') || 'grid',
    activeType: (searchParams.get('lrType') as NominationType) || 'DISCUSSION_LEADERS',
  };
}

// Convert view settings to URL search params
function filtersToUrlParams(
  viewMode: 'tabs' | 'grid',
  activeType: NominationType
): URLSearchParams {
  const params = new URLSearchParams();

  if (viewMode !== 'grid') params.set('lrView', viewMode);
  if (activeType !== 'DISCUSSION_LEADERS') params.set('lrType', activeType);

  return params;
}

export function LeaderRankingsTab({ diseaseAreaId, onKolSelect, globalFilters = {} }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initialize from URL
  const urlFilters = parseUrlFilters(searchParams);
  const [viewMode, setViewMode] = useState<'tabs' | 'grid'>(urlFilters.viewMode);
  const [activeType, setActiveType] = useState<NominationType>(urlFilters.activeType);

  // Multi-select state (form-only, not URL params)
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);

  const { data: filterOptions } = useInsightsFilterOptions(diseaseAreaId);

  // Build filters for API calls (comma-separated for arrays)
  // Global filters override local tab filters when present
  const apiFilters = {
    specialties: globalFilters?.specialties || (selectedSpecialties.length > 0 ? selectedSpecialties.join(',') : undefined),
    states: globalFilters?.states || (selectedStates.length > 0 ? selectedStates.join(',') : undefined),
  };

  // Sync URL when view settings change
  useEffect(() => {
    const params = filtersToUrlParams(viewMode, activeType);
    // Preserve other params (like from KOL Explorer tab)
    const currentParams = new URLSearchParams(searchParams.toString());
    // Remove our params first
    currentParams.delete('lrView');
    currentParams.delete('lrType');
    // Add our new params
    params.forEach((value, key) => currentParams.set(key, value));

    const newUrl = currentParams.toString() ? `${pathname}?${currentParams.toString()}` : pathname;
    router.replace(newUrl, { scroll: false });
  }, [viewMode, activeType, pathname, router, searchParams]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="w-[200px]">
          <MultiSelect
            options={filterOptions?.specialties || []}
            selected={selectedSpecialties}
            onChange={setSelectedSpecialties}
            placeholder="All Specialties"
          />
        </div>

        <div className="w-[180px]">
          <MultiSelect
            options={filterOptions?.states || []}
            selected={selectedStates}
            onChange={setSelectedStates}
            placeholder="All States"
          />
        </div>

        <div className="flex-1" />

        {/* View Toggle */}
        <div className="flex items-center gap-1 border rounded-md p-1">
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('grid')}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'tabs' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('tabs')}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {viewMode === 'grid' ? (
        /* Grid View - All 7 tables visible */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {NOMINATION_TYPES.map((type) => (
            <Card key={type.value}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className={`w-3 h-3 rounded-full ${type.color}`} />
                  {type.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <RankingTable
                  diseaseAreaId={diseaseAreaId}
                  nominationType={type.value}
                  label={type.label}
                  color={type.color}
                  bgColor={type.bgColor}
                  filters={apiFilters}
                  compact
                  onKolSelect={onKolSelect}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* Tab View - One table at a time */
        <Tabs value={activeType} onValueChange={(v) => setActiveType(v as NominationType)}>
          <TabsList className="grid w-full grid-cols-7">
            {NOMINATION_TYPES.map((type) => (
              <TabsTrigger key={type.value} value={type.value} className="text-xs">
                <div className={`w-2 h-2 rounded-full ${type.color} mr-1.5 hidden sm:block`} />
                {type.label.split(' ')[0]}
              </TabsTrigger>
            ))}
          </TabsList>

          {NOMINATION_TYPES.map((type) => (
            <TabsContent key={type.value} value={type.value}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${type.color}`} />
                    {type.label}
                  </CardTitle>
                  <CardDescription>
                    Top KOLs ranked by {type.label.toLowerCase()} nominations
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RankingTable
                    diseaseAreaId={diseaseAreaId}
                    nominationType={type.value}
                    label={type.label}
                    color={type.color}
                    bgColor={type.bgColor}
                    filters={apiFilters}
                    onKolSelect={onKolSelect}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
