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
import { Badge } from '@/components/ui/badge';
import { Search, ChevronLeft, ChevronRight, SlidersHorizontal, Download, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { ScoreFiltersGrid } from '../score-range-filter';
import { useKolExplorer, useInsightsFilterOptions } from '@/hooks/use-insights-report';
import { useCsvExport } from '@/lib/csv-export';
import { Check } from 'lucide-react';
import type { InsightsFilter, KolExplorerItem } from '@kol360/shared';

interface Props {
  diseaseAreaId: string;
}

// Sortable columns mapping to API field names
const SORTABLE_COLUMNS = {
  name: 'name',
  specialty: 'specialty',
  compositeScore: 'compositeScore',
  scoreSurvey: 'scoreSurvey',
  scorePublications: 'scorePublications',
} as const;

type SortableColumn = keyof typeof SORTABLE_COLUMNS;

// Parse URL search params to filters
function parseUrlFilters(searchParams: URLSearchParams): Partial<InsightsFilter> {
  const filters: Partial<InsightsFilter> = {
    page: 1,
    limit: 25,
    sortBy: 'compositeScore',
    sortOrder: 'desc',
  };

  const page = searchParams.get('page');
  if (page) filters.page = parseInt(page, 10);

  const search = searchParams.get('search');
  if (search) filters.search = search;

  const specialty = searchParams.get('specialty');
  if (specialty) filters.specialty = specialty;

  const state = searchParams.get('state');
  if (state) filters.state = state;

  const influencerType = searchParams.get('influencerType');
  if (influencerType) filters.influencerType = influencerType as InsightsFilter['influencerType'];

  const sortBy = searchParams.get('sortBy');
  if (sortBy) filters.sortBy = sortBy;

  const sortOrder = searchParams.get('sortOrder');
  if (sortOrder === 'asc' || sortOrder === 'desc') filters.sortOrder = sortOrder;

  return filters;
}

// Convert filters to URL search params
function filtersToUrlParams(filters: Partial<InsightsFilter>): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  if (filters.search) params.set('search', filters.search);
  if (filters.specialty) params.set('specialty', filters.specialty);
  if (filters.state) params.set('state', filters.state);
  if (filters.influencerType) params.set('influencerType', filters.influencerType);
  if (filters.sortBy && filters.sortBy !== 'compositeScore') params.set('sortBy', filters.sortBy);
  if (filters.sortOrder && filters.sortOrder !== 'desc') params.set('sortOrder', filters.sortOrder);

  return params;
}

export function KolExplorerTab({ diseaseAreaId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initialize filters from URL
  const [filters, setFilters] = useState<Partial<InsightsFilter>>(() =>
    parseUrlFilters(searchParams)
  );

  const { data: filterOptions } = useInsightsFilterOptions(diseaseAreaId);
  const { data, isLoading } = useKolExplorer(diseaseAreaId, filters);
  const { status: exportStatus, exportCsv } = useCsvExport();

  // Sync URL when filters change
  useEffect(() => {
    const params = filtersToUrlParams(filters);
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(newUrl, { scroll: false });
  }, [filters, pathname, router]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters((prev) => ({ ...prev, search: e.target.value, page: 1 }));
  };

  const handleFilterChange = (key: keyof InsightsFilter, value: string | number | undefined) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value === 'all' ? undefined : value,
      page: 1,
    }));
  };

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  const handleScoreFilterChange = (key: string, min: number, max: number) => {
    setFilters((prev) => ({
      ...prev,
      [`${key}Min`]: min === 0 ? undefined : min,
      [`${key}Max`]: max === 100 ? undefined : max,
      page: 1,
    }));
  };

  const [showScoreFilters, setShowScoreFilters] = useState(false);

  // Handle column sorting
  const handleSort = (column: SortableColumn) => {
    setFilters((prev) => {
      const currentSortBy = prev.sortBy || 'compositeScore';
      const currentOrder = prev.sortOrder || 'desc';

      if (currentSortBy === column) {
        // Toggle sort order if clicking same column
        return { ...prev, sortOrder: currentOrder === 'desc' ? 'asc' : 'desc', page: 1 };
      } else {
        // New column, default to descending (highest first) for scores, ascending for name
        const defaultOrder = column === 'name' ? 'asc' : 'desc';
        return { ...prev, sortBy: column, sortOrder: defaultOrder, page: 1 };
      }
    });
  };

  // Render sort icon for column header
  const renderSortIcon = (column: SortableColumn) => {
    const currentSortBy = filters.sortBy || 'compositeScore';
    const currentOrder = filters.sortOrder || 'desc';

    if (currentSortBy !== column) {
      return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground/50" />;
    }
    return currentOrder === 'desc'
      ? <ArrowDown className="ml-1 h-3 w-3" />
      : <ArrowUp className="ml-1 h-3 w-3" />;
  };

  // Sortable header component
  const SortableHeader = ({ column, children, className = '' }: { column: SortableColumn; children: React.ReactNode; className?: string }) => (
    <TableHead
      className={`cursor-pointer hover:bg-muted/50 select-none ${className}`}
      onClick={() => handleSort(column)}
    >
      <div className="flex items-center">
        {children}
        {renderSortIcon(column)}
      </div>
    </TableHead>
  );

  // Export to CSV
  const handleExportCSV = useCallback(() => {
    if (!data?.items.length) return;

    exportCsv({
      filename: 'kol-explorer',
      headers: [
        'Rank',
        'Name',
        'Specialty',
        'City',
        'State',
        'Influencer Type',
        'Total Score',
        'Survey Score',
        'Publications',
        'Trade Pubs',
        'Org Leadership',
        'Org Awards',
        'Clinical Trials',
        'Conference',
        'Social Media',
        'Media/Podcasts',
      ],
      rows: data.items.map((kol: KolExplorerItem, index: number) => [
        ((filters.page || 1) - 1) * (filters.limit || 25) + index + 1,
        kol.name,
        kol.specialty,
        kol.city,
        kol.state,
        kol.influencerType,
        kol.compositeScore?.toFixed(1),
        kol.scoreSurvey?.toFixed(1),
        kol.scorePublications?.toFixed(1),
        kol.scoreTradePubs?.toFixed(1),
        kol.scoreOrgLeadership?.toFixed(1),
        kol.scoreOrgAwards?.toFixed(1),
        kol.scoreClinicalTrials?.toFixed(1),
        kol.scoreConference?.toFixed(1),
        kol.scoreSocialMedia?.toFixed(1),
        kol.scoreMediaPodcasts?.toFixed(1),
      ]),
    });
  }, [data?.items, filters.page, filters.limit, exportCsv]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>KOL Explorer</CardTitle>
            <CardDescription>
              Browse and filter all KOLs with their scores
            </CardDescription>
          </div>
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
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or NPI..."
              className="pl-9"
              value={filters.search || ''}
              onChange={handleSearchChange}
            />
          </div>
          <Select
            value={filters.specialty || 'all'}
            onValueChange={(v) => handleFilterChange('specialty', v)}
          >
            <SelectTrigger>
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
            <SelectTrigger>
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
          <Select
            value={filters.influencerType || 'all'}
            onValueChange={(v) => handleFilterChange('influencerType', v as InsightsFilter['influencerType'])}
          >
            <SelectTrigger>
              <SelectValue placeholder="Influencer Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {filterOptions?.influencerTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Score Range Filters - Collapsible */}
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowScoreFilters(!showScoreFilters)}
            className="mb-2"
          >
            <SlidersHorizontal className="h-4 w-4 mr-2" />
            {showScoreFilters ? 'Hide Score Filters' : 'Show Score Filters (10 dimensions)'}
          </Button>
          {showScoreFilters && (
            <ScoreFiltersGrid filters={filters} onChange={handleScoreFilterChange} />
          )}
        </div>

        {/* Results Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">#</TableHead>
                <SortableHeader column="name">Name</SortableHeader>
                <SortableHeader column="specialty">Specialty</SortableHeader>
                <TableHead>Location</TableHead>
                <TableHead>Influencer Type</TableHead>
                <SortableHeader column="compositeScore" className="text-right">Total Score</SortableHeader>
                <SortableHeader column="scoreSurvey" className="text-right">Survey</SortableHeader>
                <SortableHeader column="scorePublications" className="text-right">Publications</SortableHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : !data?.items.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    No KOLs found
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((kol, index) => (
                  <TableRow key={kol.id}>
                    <TableCell className="text-muted-foreground">
                      {((filters.page || 1) - 1) * (filters.limit || 25) + index + 1}
                    </TableCell>
                    <TableCell className="font-medium">{kol.name}</TableCell>
                    <TableCell>{kol.specialty || '-'}</TableCell>
                    <TableCell>
                      {kol.city && kol.state
                        ? `${kol.city}, ${kol.state}`
                        : kol.state || '-'}
                    </TableCell>
                    <TableCell>
                      {kol.influencerType && (
                        <Badge
                          variant={
                            kol.influencerType === 'National Leaders'
                              ? 'default'
                              : kol.influencerType === 'Rising Stars'
                                ? 'secondary'
                                : 'outline'
                          }
                        >
                          {kol.influencerType}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {kol.compositeScore?.toFixed(1) ?? '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {kol.scoreSurvey?.toFixed(1) ?? '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {kol.scorePublications?.toFixed(1) ?? '-'}
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
