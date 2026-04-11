'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useSurveyStatus } from '@/hooks/use-distribution';
import { useCampaign } from '@/hooks/use-campaigns';
import { RequireAuth } from '@/components/auth/require-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  ArrowLeft,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-100 text-green-700 border-green-200',
  in_progress: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  opened: 'bg-blue-100 text-blue-700 border-blue-200',
  unsubscribed: 'bg-red-100 text-red-700 border-red-200',
  invited: 'bg-gray-100 text-gray-700 border-gray-200',
  not_invited: 'bg-gray-50 text-gray-500 border-gray-200',
};

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  in_progress: 'In Progress',
  opened: 'Opened',
  unsubscribed: 'Unsubscribed',
  invited: 'Invited',
  not_invited: 'Not Invited',
};

function formatSpecialty(specialty: string | null): string {
  if (!specialty) return '—';
  const s = specialty.trim().toUpperCase();
  if (s === 'OD') return 'Optometrist';
  if (s === 'MD' || s === 'DO') return 'Ophthalmologist';
  if (s === 'OPTOMETRY') return 'Optometrist';
  if (s === 'OPHTHALMOLOGY') return 'Ophthalmologist';
  return specialty;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export default function SurveyStatusPage() {
  const params = useParams();
  const campaignId = params.id as string;

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sortBy, setSortBy] = useState('lastName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [pageInput, setPageInput] = useState('');

  // Debounce search input
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  const { data: campaign } = useCampaign(campaignId);
  const { data, isLoading, error } = useSurveyStatus(campaignId, {
    page,
    limit,
    search: debouncedSearch || undefined,
    status: statusFilter,
    sortBy,
    sortOrder,
  });

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const handlePageJump = () => {
    const pageNum = parseInt(pageInput, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= (data?.pagination.pages || 1)) {
      setPage(pageNum);
      setPageInput('');
    }
  };

  const total = data?.pagination.total || 0;
  const pages = data?.pagination.pages || 1;

  const SortIcon = ({ field }: { field: string }) =>
    sortBy === field ? (
      sortOrder === 'asc' ? (
        <ArrowUp className="inline w-3 h-3 ml-1" />
      ) : (
        <ArrowDown className="inline w-3 h-3 ml-1" />
      )
    ) : null;

  const Pagination = () => (
    <div className="flex items-center justify-between gap-4 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Rows per page:</span>
        <Select value={String(limit)} onValueChange={(v) => { setLimit(parseInt(v, 10)); setPage(1); }}>
          <SelectTrigger className="w-20 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Previous
        </Button>
        <span className="text-muted-foreground">
          Page {page} of {pages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage(Math.min(pages, page + 1))}
          disabled={page >= pages}
        >
          Next
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
        <div className="flex items-center gap-1 ml-2">
          <span className="text-muted-foreground text-xs">Jump to:</span>
          <Input
            type="number"
            min={1}
            max={pages}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handlePageJump();
            }}
            className="w-16 h-8"
            placeholder="#"
          />
          <Button size="sm" variant="outline" onClick={handlePageJump} disabled={!pageInput}>
            Go
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <RequireAuth>
      <div className="container mx-auto py-8 space-y-6">
        <div className="flex items-center gap-4">
          <Link href={`/admin/campaigns/${campaignId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Survey Status</h1>
            <p className="text-sm text-muted-foreground">
              {campaign?.name} — {total.toLocaleString()} HCP{total === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Survey Taker Status</CardTitle>
            <CardDescription>
              Track survey taker progress across all invited HCPs
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search name, email, or NPI..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="opened">Opened</SelectItem>
                  <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                  <SelectItem value="invited">Invited</SelectItem>
                  <SelectItem value="not_invited">Not Invited</SelectItem>
                </SelectContent>
              </Select>
              {(search || statusFilter !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('all');
                    setPage(1);
                  }}
                >
                  Clear
                </Button>
              )}
            </div>

            {/* Top pagination */}
            {data && data.items.length > 0 && <Pagination />}

            {/* Table */}
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : error ? (
              <div className="text-center py-12 text-destructive">Error loading survey status</div>
            ) : !data || data.items.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No HCPs found</div>
            ) : (
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>NPI</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('firstName')}>
                        First Name <SortIcon field="firstName" />
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('lastName')}>
                        Last Name <SortIcon field="lastName" />
                      </TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('specialty')}>
                        Specialty <SortIcon field="specialty" />
                      </TableHead>
                      <TableHead>Sub-specialty</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('state')}>
                        State <SortIcon field="state" />
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('status')}>
                        Status <SortIcon field="status" />
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('date')}>
                        Date <SortIcon field="date" />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((item) => (
                      <TableRow key={item.campaignHcpId}>
                        <TableCell className="font-mono text-xs">{item.npi || '—'}</TableCell>
                        <TableCell>{item.firstName}</TableCell>
                        <TableCell className="font-medium">{item.lastName}</TableCell>
                        <TableCell className="text-xs">{item.email || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {formatSpecialty(item.specialty)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{item.subSpecialty || '—'}</TableCell>
                        <TableCell className="text-xs">{item.city || '—'}</TableCell>
                        <TableCell className="text-xs">{item.state || '—'}</TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[item.status]}>
                            {STATUS_LABELS[item.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{formatDate(item.statusDate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Bottom pagination */}
            {data && data.items.length > 0 && <Pagination />}
          </CardContent>
        </Card>
      </div>
    </RequireAuth>
  );
}
