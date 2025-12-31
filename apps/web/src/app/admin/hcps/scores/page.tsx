'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useHcps, useHcpFilters } from '@/hooks/use-hcps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, ChevronLeft, ChevronRight, AlertTriangle, RefreshCw, BarChart3, ArrowLeft, Upload, Settings2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { SegmentScoreImportDialog } from '@/components/hcps/segment-score-import-dialog';

// Segment score columns configuration
const SEGMENT_COLUMNS = [
  { key: 'scorePublications', label: 'Research & Publications', shortLabel: 'Pubs' },
  { key: 'scoreClinicalTrials', label: 'Clinical Trials', shortLabel: 'Trials' },
  { key: 'scoreTradePubs', label: 'Trade Pubs', shortLabel: 'Trade' },
  { key: 'scoreOrgLeadership', label: 'Org Leadership', shortLabel: 'Leader' },
  { key: 'scoreOrgAwareness', label: 'Org Awareness', shortLabel: 'Aware' },
  { key: 'scoreConference', label: 'Conference', shortLabel: 'Conf' },
  { key: 'scoreSocialMedia', label: 'Social Media', shortLabel: 'Social' },
  { key: 'scoreMediaPodcasts', label: 'Media/Podcasts', shortLabel: 'Media' },
  { key: 'compositeScore', label: 'Composite Score', shortLabel: 'Total' },
] as const;

type SegmentScoreKey = typeof SEGMENT_COLUMNS[number]['key'];

// Helper to get specialty display name
function getSpecialtyDisplay(hcp: { specialty?: string | null; specialties?: { isPrimary: boolean; specialty: { name: string } }[] }) {
  if (hcp.specialties && hcp.specialties.length > 0) {
    return hcp.specialties.map(s => s.specialty.name);
  }
  if (hcp.specialty) {
    return [hcp.specialty];
  }
  return [];
}

interface DiseaseAreaScore {
  id: string;
  compositeScore: number | null;
  scorePublications?: number | null;
  scoreClinicalTrials?: number | null;
  scoreTradePubs?: number | null;
  scoreOrgLeadership?: number | null;
  scoreOrgAwareness?: number | null;
  scoreConference?: number | null;
  scoreSocialMedia?: number | null;
  scoreMediaPodcasts?: number | null;
  diseaseArea: { id: string; name: string; code: string | null };
}

export default function HcpScoresPage() {
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleColumns, setVisibleColumns] = useState<Set<SegmentScoreKey>>(
    () => new Set<SegmentScoreKey>(['scorePublications', 'scoreClinicalTrials', 'scoreConference', 'scoreSocialMedia', 'compositeScore'])
  );
  const [filters, setFilters] = useState<{
    query?: string;
    specialty?: string;
    state?: string;
    page: number;
  }>({ page: 1 });

  const { data, isLoading, isError, error, refetch } = useHcps({
    ...filters,
    query: filters.query,
  });
  const { data: filterOptions } = useHcpFilters();

  const hcps = data?.items || [];
  const pagination = data?.pagination;

  const getScoreValue = (
    scores: DiseaseAreaScore[] | undefined,
    scoreKey: SegmentScoreKey
  ): string => {
    if (!scores || scores.length === 0) return '—';
    // Get the first (current) score record
    const score = scores[0];
    const value = score[scoreKey as keyof DiseaseAreaScore];
    if (value === null || value === undefined) return '—';
    return Number(value).toFixed(1);
  };

  const toggleColumn = (key: SegmentScoreKey) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSearch = () => {
    setFilters((prev) => ({ ...prev, query: searchQuery, page: 1 }));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const visibleSegmentColumns = SEGMENT_COLUMNS.filter(col => visibleColumns.has(col.key));

  return (
    <div className="p-6 lg:p-8 fade-in">
      {/* Page Header with Inline Stats */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link href="/admin/hcps">
                <Button variant="ghost" size="sm" className="gap-1 -ml-2">
                  <ArrowLeft className="w-4 h-4" />
                  HCPs
                </Button>
              </Link>
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">HCP Scores</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Segment & sociometric scores</p>
          </div>
          {/* Inline Stats Badges */}
          {!isLoading && pagination && (
            <div className="flex items-center gap-3 ml-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                <BarChart3 className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">{pagination.total.toLocaleString()} HCPs</span>
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {/* Column Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="w-4 h-4 mr-2" />
                Columns ({visibleColumns.size})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64" align="end">
              <div className="p-2 space-y-1">
                <p className="text-sm font-medium mb-3 px-2">Show Columns</p>
                {SEGMENT_COLUMNS.map((col) => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted cursor-pointer"
                  >
                    <Checkbox
                      checked={visibleColumns.has(col.key)}
                      onCheckedChange={() => toggleColumn(col.key)}
                    />
                    <span className="text-sm">{col.label}</span>
                  </label>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" onClick={() => setShowImportDialog(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Import Scores
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by NPI or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              className="pl-9"
            />
          </div>
          <Button variant="outline" onClick={handleSearch} className="shrink-0">
            Search
          </Button>
        </div>

        <div className="flex flex-wrap gap-3">
          <Select
            value={filters.specialty || 'all'}
            onValueChange={(value) =>
              setFilters((prev) => ({
                ...prev,
                specialty: value === 'all' ? undefined : value,
                page: 1,
              }))
            }
          >
            <SelectTrigger className="w-48 bg-card">
              <SelectValue placeholder="All Specialties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Specialties</SelectItem>
              {filterOptions?.specialties?.map((specialty) => (
                <SelectItem key={specialty.id} value={specialty.name}>
                  {specialty.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.state || 'all'}
            onValueChange={(value) =>
              setFilters((prev) => ({
                ...prev,
                state: value === 'all' ? undefined : value,
                page: 1,
              }))
            }
          >
            <SelectTrigger className="w-36 bg-card">
              <SelectValue placeholder="All States" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {filterOptions?.states.map((state) => (
                <SelectItem key={state} value={state}>
                  {state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-card rounded-xl border border-border/60 overflow-hidden">
          <div className="p-4 border-b border-border/60">
            <div className="h-4 w-24 skeleton rounded" />
          </div>
          {[...Array(8)].map((_, i) => (
            <div key={i} className="p-4 border-b border-border/40 last:border-0">
              <div className="flex items-center gap-4">
                <div className="h-4 w-24 skeleton rounded font-mono" />
                <div className="h-4 w-32 skeleton rounded" />
                <div className="h-5 w-20 skeleton rounded-full" />
                <div className="h-4 w-16 skeleton rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <Card className="border-destructive">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
            <h3 className="text-lg font-medium mb-2">Failed to load scores</h3>
            <p className="text-muted-foreground mb-4 text-center max-w-md">
              {error instanceof Error ? error.message : 'Unable to connect to the server.'}
            </p>
            <Button onClick={() => refetch()} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : hcps.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/60 p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No scores found</h3>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
            {filters.query || filters.specialty || filters.state
              ? 'Try adjusting your search filters.'
              : 'Import segment scores using the Import Scores button above.'}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto bg-card rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap sticky left-0 bg-card z-10">NPI</TableHead>
                  <TableHead className="whitespace-nowrap">Name</TableHead>
                  <TableHead className="whitespace-nowrap">Specialty</TableHead>
                  <TableHead className="whitespace-nowrap">Location</TableHead>
                  {visibleSegmentColumns.map((col) => (
                    <TableHead key={col.key} className="text-center whitespace-nowrap min-w-[70px]">
                      {col.shortLabel}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {hcps.map((hcp) => (
                  <TableRow key={hcp.id}>
                    <TableCell className="font-mono text-muted-foreground sticky left-0 bg-card">{hcp.npi}</TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/hcps/${hcp.id}`}
                        className="font-medium text-primary hover:text-primary/80 transition-colors"
                      >
                        {hcp.firstName} {hcp.lastName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const specialties = getSpecialtyDisplay(hcp);
                        return specialties.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {specialties.slice(0, 2).map((spec, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {spec}
                              </Badge>
                            ))}
                            {specialties.length > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{specialties.length - 2}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {hcp.city && hcp.state
                        ? `${hcp.city}, ${hcp.state}`
                        : hcp.state || '—'}
                    </TableCell>
                    {visibleSegmentColumns.map((col) => {
                      const scoreStr = getScoreValue(hcp.diseaseAreaScores as DiseaseAreaScore[] | undefined, col.key);
                      const hasScore = scoreStr !== '—';
                      return (
                        <TableCell
                          key={col.key}
                          className={`text-center ${hasScore ? 'font-medium' : 'text-muted-foreground'}`}
                        >
                          {hasScore ? (
                            <span className={`inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded ${
                              col.key === 'compositeScore'
                                ? 'bg-emerald-500/10 text-emerald-600'
                                : 'bg-primary/10 text-primary'
                            }`}>
                              {scoreStr}
                            </span>
                          ) : (
                            scoreStr
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6 pt-4 border-t border-border/60">
              <div className="text-sm text-muted-foreground">
                Showing {hcps.length} of {pagination.total.toLocaleString()} HCPs
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => setFilters((prev) => ({ ...prev, page: prev.page - 1 }))}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm px-3">
                  Page {pagination.page} of {pagination.pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.pages}
                  onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <SegmentScoreImportDialog open={showImportDialog} onOpenChange={setShowImportDialog} />
    </div>
  );
}
