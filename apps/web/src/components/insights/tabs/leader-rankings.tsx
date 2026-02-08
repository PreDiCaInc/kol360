'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Check } from 'lucide-react';
import type { NominationType, LeaderRankingQuery } from '@kol360/shared';

interface Props {
  diseaseAreaId: string;
}

const NOMINATION_TYPES: { value: NominationType; label: string; color: string; bgColor: string }[] = [
  { value: 'DISCUSSION_LEADERS', label: 'Discussion Leaders', color: 'bg-blue-500', bgColor: 'bg-blue-100 dark:bg-blue-950' },
  { value: 'REFERRAL_LEADERS', label: 'Referral Leaders', color: 'bg-green-500', bgColor: 'bg-green-100 dark:bg-green-950' },
  { value: 'ADVICE_LEADERS', label: 'Advice Leaders', color: 'bg-purple-500', bgColor: 'bg-purple-100 dark:bg-purple-950' },
  { value: 'NATIONAL_LEADER', label: 'National Leaders', color: 'bg-yellow-500', bgColor: 'bg-yellow-100 dark:bg-yellow-950' },
  { value: 'RISING_STAR', label: 'Rising Stars', color: 'bg-pink-500', bgColor: 'bg-pink-100 dark:bg-pink-950' },
  { value: 'SOCIAL_LEADER', label: 'Social Leaders', color: 'bg-cyan-500', bgColor: 'bg-cyan-100 dark:bg-cyan-950' },
];

interface RankingTableProps {
  diseaseAreaId: string;
  nominationType: NominationType;
  label: string;
  color: string;
  bgColor: string;
  filters?: { state?: string; specialty?: string };
  compact?: boolean;
  onExport?: (nominationType: string, data: { rank: number; name: string; specialty: string | null; state: string | null; count: number }[]) => void;
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

  const handleExport = useCallback(() => {
    if (!data?.items.length) return;

    const csvData = data.items.map((item) => ({
      rank: item.rank,
      name: item.name,
      specialty: item.specialty,
      state: item.state,
      count: item.count,
    }));

    if (onExport) {
      onExport(label, csvData);
    } else {
      // Direct export using shared utility
      exportCsv({
        filename: `${label.toLowerCase().replace(/\s+/g, '-')}-rankings`,
        headers: ['Rank', 'Name', 'Specialty', 'State', 'Count'],
        rows: csvData.map((item) => [
          item.rank,
          item.name,
          item.specialty,
          item.state,
          item.count,
        ]),
      });
    }
  }, [data?.items, label, onExport, exportCsv]);

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
              <TableHead className={compact ? 'hidden md:table-cell' : ''}>Specialty</TableHead>
              <TableHead className={compact ? 'hidden lg:table-cell' : ''}>State</TableHead>
              <TableHead className="w-[120px] text-right">Count</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item) => (
              <TableRow key={item.hcpId}>
                <TableCell className="font-medium text-muted-foreground">{item.rank}</TableCell>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className={compact ? 'hidden md:table-cell' : ''}>
                  {item.specialty || '-'}
                </TableCell>
                <TableCell className={compact ? 'hidden lg:table-cell' : ''}>
                  {item.state || '-'}
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
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleExport}
              disabled={!data.items.length || exportStatus === 'exporting'}
              title={exportStatus === 'success' ? 'Exported!' : 'Export CSV'}
            >
              {exportStatus === 'success' ? (
                <Check className="h-3 w-3 text-green-600" />
              ) : (
                <Download className="h-3 w-3" />
              )}
            </Button>
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

// Parse URL search params to filters
function parseUrlFilters(searchParams: URLSearchParams): {
  state?: string;
  specialty?: string;
  viewMode: 'tabs' | 'grid';
  activeType: NominationType;
} {
  return {
    state: searchParams.get('lrState') || undefined,
    specialty: searchParams.get('lrSpecialty') || undefined,
    viewMode: (searchParams.get('lrView') as 'tabs' | 'grid') || 'grid',
    activeType: (searchParams.get('lrType') as NominationType) || 'DISCUSSION_LEADERS',
  };
}

// Convert filters to URL search params
function filtersToUrlParams(
  filters: { state?: string; specialty?: string },
  viewMode: 'tabs' | 'grid',
  activeType: NominationType
): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.state) params.set('lrState', filters.state);
  if (filters.specialty) params.set('lrSpecialty', filters.specialty);
  if (viewMode !== 'grid') params.set('lrView', viewMode);
  if (activeType !== 'DISCUSSION_LEADERS') params.set('lrType', activeType);

  return params;
}

export function LeaderRankingsTab({ diseaseAreaId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initialize from URL
  const urlFilters = parseUrlFilters(searchParams);
  const [viewMode, setViewMode] = useState<'tabs' | 'grid'>(urlFilters.viewMode);
  const [activeType, setActiveType] = useState<NominationType>(urlFilters.activeType);
  const [filters, setFilters] = useState<{ state?: string; specialty?: string }>({
    state: urlFilters.state,
    specialty: urlFilters.specialty,
  });

  const { data: filterOptions } = useInsightsFilterOptions(diseaseAreaId);

  // Sync URL when filters change
  useEffect(() => {
    const params = filtersToUrlParams(filters, viewMode, activeType);
    // Preserve other params (like from KOL Explorer tab)
    const currentParams = new URLSearchParams(searchParams.toString());
    // Remove our params first
    currentParams.delete('lrState');
    currentParams.delete('lrSpecialty');
    currentParams.delete('lrView');
    currentParams.delete('lrType');
    // Add our new params
    params.forEach((value, key) => currentParams.set(key, value));

    const newUrl = currentParams.toString() ? `${pathname}?${currentParams.toString()}` : pathname;
    router.replace(newUrl, { scroll: false });
  }, [filters, viewMode, activeType, pathname, router, searchParams]);

  const handleFilterChange = (key: 'state' | 'specialty', value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value === 'all' ? undefined : value,
    }));
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <Select
          value={filters.specialty || 'all'}
          onValueChange={(v) => handleFilterChange('specialty', v)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Specialty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Specialties</SelectItem>
            {filterOptions?.specialties.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.state || 'all'}
          onValueChange={(v) => handleFilterChange('state', v)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {filterOptions?.states.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
        /* 2x3 Grid View - All 6 tables visible */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                  filters={filters}
                  compact
                />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* Tab View - One table at a time */
        <Tabs value={activeType} onValueChange={(v) => setActiveType(v as NominationType)}>
          <TabsList className="grid w-full grid-cols-6">
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
                    filters={filters}
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
