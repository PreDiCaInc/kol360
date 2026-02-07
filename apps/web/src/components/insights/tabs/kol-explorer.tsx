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
import { Search, ChevronLeft, ChevronRight, SlidersHorizontal, Download } from 'lucide-react';
import { ScoreFiltersGrid } from '../score-range-filter';
import { useKolExplorer, useInsightsFilterOptions } from '@/hooks/use-insights-report';
import type { InsightsFilter, KolExplorerItem } from '@kol360/shared';

interface Props {
  diseaseAreaId: string;
}

// Parse URL search params to filters
function parseUrlFilters(searchParams: URLSearchParams): Partial<InsightsFilter> {
  const filters: Partial<InsightsFilter> = {
    page: 1,
    limit: 25,
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

  // Export to CSV
  const handleExportCSV = useCallback(() => {
    if (!data?.items.length) return;

    const headers = [
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
      'Org Awareness',
      'Clinical Trials',
      'Conference',
      'Social Media',
      'Media/Podcasts',
    ];

    const rows = data.items.map((kol: KolExplorerItem, index: number) => [
      ((filters.page || 1) - 1) * (filters.limit || 25) + index + 1,
      kol.name,
      kol.specialty || '',
      kol.city || '',
      kol.state || '',
      kol.influencerType || '',
      kol.compositeScore?.toFixed(1) || '',
      kol.scoreSurvey?.toFixed(1) || '',
      kol.scorePublications?.toFixed(1) || '',
      kol.scoreTradePubs?.toFixed(1) || '',
      kol.scoreOrgLeadership?.toFixed(1) || '',
      kol.scoreOrgAwareness?.toFixed(1) || '',
      kol.scoreClinicalTrials?.toFixed(1) || '',
      kol.scoreConference?.toFixed(1) || '',
      kol.scoreSocialMedia?.toFixed(1) || '',
      kol.scoreMediaPodcasts?.toFixed(1) || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `kol-explorer-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, [data?.items, filters.page, filters.limit]);

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
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!data?.items.length}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
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
                <TableHead>Name</TableHead>
                <TableHead>Specialty</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Influencer Type</TableHead>
                <TableHead className="text-right">Total Score</TableHead>
                <TableHead className="text-right">Survey</TableHead>
                <TableHead className="text-right">Publications</TableHead>
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
