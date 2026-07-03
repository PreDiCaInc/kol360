'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useSurveyStatus, SurveyStatusItem, useOptOutHcp, useResubscribeHcp } from '@/hooks/use-distribution';
import { useCampaign } from '@/hooks/use-campaigns';
import { useAuth } from '@/lib/auth/auth-provider';
import { RequireAuth } from '@/components/auth/require-auth';
import { useExcelExport } from '@/lib/excel-export';
import { apiClient } from '@/lib/api';
import { inferHcpIdLabel } from '@kol360/shared';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
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
  Download,
  Loader2,
  CheckCircle2,
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

// Field-form canonical since v1.15.31 (matches DiseaseArea naming + data-team
// source-of-truth). Accepts legacy abbrevs + role-form on input.
function formatSpecialty(specialty: string | null): string {
  if (!specialty) return '—';
  const s = specialty.trim().toUpperCase();
  if (s === 'OD' || s === 'OPTOMETRY' || s === 'OPTOMETRIST') return 'Optometry';
  if (s === 'MD' || s === 'DO' || s === 'OPHTHALMOLOGY' || s === 'OPHTHALMOLOGIST') return 'Ophthalmology';
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
  // Multi-select status filter — empty set means "all"
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sortBy, setSortBy] = useState('lastName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [pageInput, setPageInput] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Opt-out / resubscribe dialog state
  const [optOutTarget, setOptOutTarget] = useState<SurveyStatusItem | null>(null);
  const [optOutScope, setOptOutScope] = useState<'CAMPAIGN' | 'GLOBAL'>('CAMPAIGN');
  const [optOutReason, setOptOutReason] = useState('');
  const [resubscribeTarget, setResubscribeTarget] = useState<SurveyStatusItem | null>(null);
  const [resubscribeReason, setResubscribeReason] = useState('');

  const { user } = useAuth();
  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN';

  const optOutMutation = useOptOutHcp();
  const resubscribeMutation = useResubscribeHcp();

  const openOptOut = (item: SurveyStatusItem) => {
    setOptOutTarget(item);
    setOptOutScope('CAMPAIGN');
    setOptOutReason('');
  };
  const closeOptOut = () => {
    setOptOutTarget(null);
    setOptOutReason('');
  };
  const submitOptOut = async () => {
    if (!optOutTarget || optOutReason.trim().length < 10) return;
    try {
      await optOutMutation.mutateAsync({
        hcpId: optOutTarget.hcpId,
        scope: optOutScope,
        campaignId: optOutScope === 'CAMPAIGN' ? campaignId : undefined,
        reason: optOutReason.trim(),
      });
      closeOptOut();
    } catch (e) {
      console.error('Opt-out failed', e);
    }
  };

  const openResubscribe = (item: SurveyStatusItem) => {
    setResubscribeTarget(item);
    setResubscribeReason('');
  };
  const closeResubscribe = () => {
    setResubscribeTarget(null);
    setResubscribeReason('');
  };
  const submitResubscribe = async () => {
    if (!resubscribeTarget?.optOutId) return;
    try {
      await resubscribeMutation.mutateAsync({
        optOutId: resubscribeTarget.optOutId,
        reason: resubscribeReason.trim() || undefined,
      });
      closeResubscribe();
    } catch (e) {
      console.error('Resubscribe failed', e);
    }
  };

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
    status: statusFilter.length > 0 ? statusFilter.join(',') : undefined,
    sortBy,
    sortOrder,
  });

  const toggleStatus = (s: string) => {
    setStatusFilter((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
    setPage(1);
  };

  const copySurveyLink = async (token: string) => {
    const url = `${window.location.origin}/survey/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch (e) {
      console.error('Failed to copy', e);
    }
  };

  const { status: exportStatus, exportExcel } = useExcelExport();

  const handleExport = async () => {
    // Fetch ALL records matching current filters (max 5000)
    const query: Record<string, string | number | undefined> = {
      page: 1,
      limit: 5000,
      search: debouncedSearch || undefined,
      status: statusFilter.length > 0 ? statusFilter.join(',') : undefined,
      sortBy,
      sortOrder,
    };
    const result = await apiClient.get<{ items: SurveyStatusItem[] }>(
      `/api/v1/campaigns/${campaignId}/survey-status`,
      query
    );

    const origin = window.location.origin;
    exportExcel({
      filename: `survey-status-${campaign?.name?.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'campaign'}`,
      headers: [
        inferHcpIdLabel(result.items), 'First Name', 'Last Name', 'Email',
        'Specialty', 'Sub-specialty', 'City', 'State',
        'Status', 'Last Question', 'Total Questions',
        'Last Updated Date', 'Survey Link',
      ],
      rows: result.items.map((item) => [
        item.npi || '',
        item.firstName,
        item.lastName,
        item.email || '',
        formatSpecialty(item.specialty),
        item.subSpecialty || '',
        item.city || '',
        item.state || '',
        STATUS_LABELS[item.status],
        item.lastQuestion > 0 ? item.lastQuestion : '',
        item.totalQuestions,
        item.statusDate ? formatDate(item.statusDate) : '',
        item.surveyToken ? `${origin}/survey/${item.surveyToken}` : '',
      ]),
      sheetName: 'Survey Status',
    });
  };

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
          <Button
            onClick={handleExport}
            disabled={exportStatus !== 'idle' || !data || data.items.length === 0}
            variant="outline"
          >
            {exportStatus === 'exporting' ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : exportStatus === 'success' ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Exported!
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Export to Excel
              </>
            )}
          </Button>
        </div>

        <Card>
          <CardContent className="space-y-3 pt-4">
            {/* Filters — compact single row */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-shrink-0 w-[240px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search name, email, NPI..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <div className="flex flex-wrap gap-1.5 items-center flex-1">
                {(['completed', 'in_progress', 'opened', 'unsubscribed', 'invited', 'not_invited'] as const).map((s) => {
                  const active = statusFilter.includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() => toggleStatus(s)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        active
                          ? STATUS_COLORS[s] + ' ring-2 ring-offset-1 ring-current'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80 border-border'
                      }`}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  );
                })}
              </div>
              {(search || statusFilter.length > 0) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter([]);
                    setPage(1);
                  }}
                  className="h-8 text-xs"
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
                      <TableHead>{inferHcpIdLabel(data?.items ?? [])}</TableHead>
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
                      <TableHead className="cursor-pointer" onClick={() => handleSort('lastQuestion')}>
                        Last Question <SortIcon field="lastQuestion" />
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('date')}>
                        Last Updated Date <SortIcon field="date" />
                      </TableHead>
                      <TableHead>Survey Link</TableHead>
                      {isPlatformAdmin && <TableHead>Actions</TableHead>}
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
                        <TableCell className="text-xs">
                          {item.lastQuestion > 0
                            ? `${item.lastQuestion} / ${item.totalQuestions}`
                            : '—'}
                        </TableCell>
                        <TableCell className="text-xs">{formatDate(item.statusDate)}</TableCell>
                        <TableCell className="text-xs">
                          {item.surveyToken ? (
                            <button
                              onClick={() => copySurveyLink(item.surveyToken!)}
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                              title="Copy survey link"
                            >
                              {copiedToken === item.surveyToken ? (
                                <>Copied!</>
                              ) : (
                                <>Copy link</>
                              )}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        {isPlatformAdmin && (
                          <TableCell className="text-xs">
                            {item.optOutId ? (
                              <button
                                onClick={() => openResubscribe(item)}
                                className="text-green-700 hover:underline"
                                title={`Resubscribe (currently opted out: ${item.optOutScope})`}
                              >
                                Resubscribe
                              </button>
                            ) : (
                              <button
                                onClick={() => openOptOut(item)}
                                className="text-red-600 hover:underline"
                                title="Opt this HCP out"
                              >
                                Opt out
                              </button>
                            )}
                          </TableCell>
                        )}
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

        {/* Opt Out dialog */}
        <AlertDialog open={!!optOutTarget} onOpenChange={(open) => !open && closeOptOut()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Opt out HCP from emails</AlertDialogTitle>
              <AlertDialogDescription>
                {optOutTarget && (
                  <>
                    This will stop emails to <strong>{optOutTarget.firstName} {optOutTarget.lastName}</strong> ({optOutTarget.email}).
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-sm font-medium mb-2 block">Scope</Label>
                <div className="space-y-2">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="opt-out-scope"
                      value="CAMPAIGN"
                      checked={optOutScope === 'CAMPAIGN'}
                      onChange={() => setOptOutScope('CAMPAIGN')}
                      className="mt-0.5"
                    />
                    <div className="text-sm">
                      <div className="font-medium">This campaign only</div>
                      <div className="text-xs text-muted-foreground">{campaign?.name}</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="opt-out-scope"
                      value="GLOBAL"
                      checked={optOutScope === 'GLOBAL'}
                      onChange={() => setOptOutScope('GLOBAL')}
                      className="mt-0.5"
                    />
                    <div className="text-sm">
                      <div className="font-medium">All campaigns (global)</div>
                      <div className="text-xs text-muted-foreground">HCP will not receive any future campaign emails</div>
                    </div>
                  </label>
                </div>
              </div>
              <div>
                <Label htmlFor="opt-out-reason" className="text-sm font-medium">
                  Reason <span className="text-red-600">*</span>
                </Label>
                <Textarea
                  id="opt-out-reason"
                  value={optOutReason}
                  onChange={(e) => setOptOutReason(e.target.value)}
                  placeholder="e.g. 'Direct email reply from HCP requesting to stop emails' or 'Phone call asking to be removed'"
                  className="mt-1"
                  rows={3}
                />
                <div className="text-xs text-muted-foreground mt-1">
                  {optOutReason.trim().length}/10 characters minimum
                </div>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={closeOptOut}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={submitOptOut}
                disabled={optOutReason.trim().length < 10 || optOutMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                {optOutMutation.isPending ? 'Opting out...' : 'Confirm Opt Out'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Resubscribe dialog */}
        <AlertDialog open={!!resubscribeTarget} onOpenChange={(open) => !open && closeResubscribe()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Resubscribe HCP</AlertDialogTitle>
              <AlertDialogDescription>
                {resubscribeTarget && (
                  <>
                    This will reverse the opt-out for <strong>{resubscribeTarget.firstName} {resubscribeTarget.lastName}</strong> ({resubscribeTarget.email}).
                    Current scope: <strong>{resubscribeTarget.optOutScope}</strong>.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-2">
              <Label htmlFor="resubscribe-reason" className="text-sm font-medium">
                Reason <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Textarea
                id="resubscribe-reason"
                value={resubscribeReason}
                onChange={(e) => setResubscribeReason(e.target.value)}
                placeholder="e.g. 'HCP confirmed they want to receive emails again'"
                className="mt-1"
                rows={2}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={closeResubscribe}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={submitResubscribe}
                disabled={resubscribeMutation.isPending}
              >
                {resubscribeMutation.isPending ? 'Resubscribing...' : 'Confirm Resubscribe'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </RequireAuth>
  );
}
