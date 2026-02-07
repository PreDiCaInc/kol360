'use client';

import { useState, useCallback } from 'react';
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
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Download } from 'lucide-react';
import { useSociometricSummary, useInsightsFilterOptions } from '@/hooks/use-insights-report';
import type { InsightsFilter, SociometricSummaryItem } from '@kol360/shared';
import { cn } from '@/lib/utils';

interface Props {
  diseaseAreaId: string;
}

type SortField = 'total' | 'discussionLeaders' | 'referralLeaders' | 'adviceLeaders' | 'nationalLeaders' | 'risingStars' | 'socialLeaders' | 'name';
type SortOrder = 'asc' | 'desc';

const NOMINATION_COLORS = {
  discussionLeaders: { bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-700 dark:text-blue-300', header: 'bg-blue-100 dark:bg-blue-900' },
  referralLeaders: { bg: 'bg-green-50 dark:bg-green-950', text: 'text-green-700 dark:text-green-300', header: 'bg-green-100 dark:bg-green-900' },
  adviceLeaders: { bg: 'bg-purple-50 dark:bg-purple-950', text: 'text-purple-700 dark:text-purple-300', header: 'bg-purple-100 dark:bg-purple-900' },
  nationalLeaders: { bg: 'bg-yellow-50 dark:bg-yellow-950', text: 'text-yellow-700 dark:text-yellow-300', header: 'bg-yellow-100 dark:bg-yellow-900' },
  risingStars: { bg: 'bg-pink-50 dark:bg-pink-950', text: 'text-pink-700 dark:text-pink-300', header: 'bg-pink-100 dark:bg-pink-900' },
  socialLeaders: { bg: 'bg-cyan-50 dark:bg-cyan-950', text: 'text-cyan-700 dark:text-cyan-300', header: 'bg-cyan-100 dark:bg-cyan-900' },
};

export function SociometricSummaryTab({ diseaseAreaId }: Props) {
  const [filters, setFilters] = useState<Partial<InsightsFilter>>({
    page: 1,
    limit: 25,
  });
  const [sortField, setSortField] = useState<SortField>('total');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const { data: filterOptions } = useInsightsFilterOptions(diseaseAreaId);
  const { data, isLoading } = useSociometricSummary(diseaseAreaId, filters);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters((prev) => ({ ...prev, search: e.target.value, page: 1 }));
  };

  const handleFilterChange = (key: keyof InsightsFilter, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value === 'all' ? undefined : value,
      page: 1,
    }));
  };

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  }, [sortField]);

  // Sort items client-side
  const sortedItems = data?.items ? [...data.items].sort((a, b) => {
    let aValue: string | number = a[sortField as keyof SociometricSummaryItem] as string | number;
    let bValue: string | number = b[sortField as keyof SociometricSummaryItem] as string | number;

    if (sortField === 'name') {
      aValue = String(aValue || '').toLowerCase();
      bValue = String(bValue || '').toLowerCase();
      return sortOrder === 'asc'
        ? (aValue as string).localeCompare(bValue as string)
        : (bValue as string).localeCompare(aValue as string);
    }

    aValue = Number(aValue) || 0;
    bValue = Number(bValue) || 0;
    return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
  }) : [];

  // Export to CSV
  const handleExportCSV = useCallback(() => {
    if (!data?.items.length) return;

    const headers = ['Rank', 'Name', 'Specialty', 'State', 'Type', 'Discussion', 'Referral', 'Advice', 'National', 'Rising', 'Social', 'Total'];
    const rows = sortedItems.map((item, index) => [
      index + 1,
      item.name,
      item.specialty || '',
      item.state || '',
      item.influencerType || '',
      item.discussionLeaders,
      item.referralLeaders,
      item.adviceLeaders,
      item.nationalLeaders,
      item.risingStars,
      item.socialLeaders,
      item.total,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `sociometric-summary-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, [data?.items, sortedItems]);

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
              placeholder="Search by name..."
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
            onValueChange={(v) => handleFilterChange('influencerType', v)}
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
                <SortableHeader field="total" className="font-bold">
                  Total
                </SortableHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-24 text-center">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : !sortedItems.length ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-24 text-center">
                    No data available
                  </TableCell>
                </TableRow>
              ) : (
                sortedItems.map((item, index) => (
                  <TableRow key={item.hcpId}>
                    <TableCell className="text-muted-foreground">
                      {((filters.page || 1) - 1) * (filters.limit || 25) + index + 1}
                    </TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
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
