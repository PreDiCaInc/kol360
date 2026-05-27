'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useNominations,
  useNominationStats,
  useNominationSuggestions,
  useNominationTopSuggestions,
  useMatchNomination,
  useBulkAcceptNominations,
  useCreateHcpFromNomination,
  useExcludeNomination,
  useBulkAutoMatch,
  useBulkExcludeNominations,
  useUpdateNominationRawName,
  type TopSuggestion,
} from '@/hooks/use-nominations';
import { useCampaign, useCloseCampaign } from '@/hooks/use-campaigns';
import { useDiseaseAreas } from '@/hooks/use-disease-areas';
import { HCP_SPECIALTIES } from '@kol360/shared';
import { RequireAuth } from '@/components/auth/require-auth';
import { MultiSelect } from '@/components/ui/multi-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  CheckCircle2,
  UserPlus,
  Ban,
  Loader2,
  Wand2,
  Link as LinkIcon,
  AlertCircle,
  Pencil,
  HelpCircle,
  X,
  ChevronRight,
  Search,
} from 'lucide-react';
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

const NOMINATION_TYPE_LABELS: Record<string, string> = {
  DISCUSSION_LEADERS: 'Discussion Leaders',
  REFERRAL_LEADERS: 'Referral Leaders',
  ADVICE_LEADERS: 'Advice Leaders',
  NATIONAL_LEADER: 'National Leaders',
  RISING_STAR: 'Rising Stars',
  SOCIAL_LEADER: 'Social Media Leaders',
  REGIONAL_LEADER: 'Regional Leaders',
  BIASED_LEADER: 'Biased Leaders',
  NATIONAL_KOL: 'National KOL',
};

const STATUS_COLORS: Record<string, string> = {
  UNMATCHED: 'bg-yellow-100 text-yellow-700',
  MATCHED: 'bg-green-100 text-green-700',
  REVIEW_NEEDED: 'bg-orange-100 text-orange-700',
  NEW_HCP: 'bg-blue-100 text-blue-700',
  EXCLUDED: 'bg-red-100 text-red-700',
};

const MATCH_TYPE_LABELS: Record<string, string> = {
  exact: 'Exact',
  primary: 'Name',
  alias: 'Alias',
  partial: 'Partial',
};

export default function NominationsPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [nominationTypeFilter, setNominationTypeFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'contains' | 'exact'>('contains');
  const [page, setPage] = useState(1);
  const [pageInputValue, setPageInputValue] = useState('');
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkExcludeDialog, setShowBulkExcludeDialog] = useState(false);
  const [bulkExcludeReason, setBulkExcludeReason] = useState('');
  const [showSingleExcludeDialog, setShowSingleExcludeDialog] = useState(false);
  const [singleExcludeNomination, setSingleExcludeNomination] = useState<{ id: string; rawName: string } | null>(null);
  const [singleExcludeReason, setSingleExcludeReason] = useState('');

  // Debounce search input (300ms)
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);
  const [selectedNominationId, setSelectedNominationId] = useState<string | null>(null);
  const [showCreateHcpDialog, setShowCreateHcpDialog] = useState(false);
  const [nominationForNewHcp, setNominationForNewHcp] = useState<string | null>(null);
  const [editNominationId, setEditNominationId] = useState<string | null>(null);
  const [autoMatchResult, setAutoMatchResult] = useState<{
    matched: number;
    total: number;
    errors: string[];
  } | null>(null);
  const [showHelp, setShowHelp] = useState(true);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const { data: campaign } = useCampaign(campaignId);
  const closeCampaign = useCloseCampaign();
  const { data: nominations, isLoading } = useNominations(campaignId, {
    status: statusFilter || undefined,
    search: debouncedSearchQuery.trim() || undefined,
    searchMode,
    nominationType: nominationTypeFilter || undefined,
    page,
    limit: 50,
  });
  const { data: stats } = useNominationStats(campaignId);

  // Server-side filtered items (search/type filters now applied on the API)
  const filteredItems = nominations?.items || [];

  // Inline-accept support: batch-fetch the top suggestion for every
  // UNMATCHED/REVIEW_NEEDED row on the visible page so the row can render
  // "Accept: First Last (92%)" without a per-row API call.
  const inlineCandidateIds = filteredItems
    .filter((n) => n.matchStatus === 'UNMATCHED' || n.matchStatus === 'REVIEW_NEEDED')
    .map((n) => n.id);
  const { data: topSuggestionsMap } = useNominationTopSuggestions(campaignId, inlineCandidateIds);

  // Bulk-accept flow state
  const bulkAccept = useBulkAcceptNominations();
  const matchNomination = useMatchNomination();
  // When non-null, the low-confidence confirmation modal is open and these
  // are the ids waiting to be accepted (high-conf + low-conf together).
  const [bulkAcceptPending, setBulkAcceptPending] = useState<{
    highConfIds: string[];
    lowConfRows: Array<{ id: string; rawName: string; suggestion: TopSuggestion }>;
    noSuggestionRawNames: string[];
  } | null>(null);
  const LOW_CONF_THRESHOLD = 90;

  // Reset page to 1 when filter changes
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set()); // also clear selection
  }, [statusFilter, nominationTypeFilter, searchMode, debouncedSearchQuery]);

  // Pagination helper
  const totalPages = nominations?.pagination.pages || 1;
  const handlePageJump = () => {
    const targetPage = parseInt(pageInputValue, 10);
    if (!isNaN(targetPage) && targetPage >= 1 && targetPage <= totalPages) {
      setPage(targetPage);
      setPageInputValue('');
    }
  };

  const bulkAutoMatch = useBulkAutoMatch();
  const bulkExclude = useBulkExcludeNominations();
  const excludeNomination = useExcludeNomination();

  const handleBulkExclude = async () => {
    if (selectedIds.size === 0) return;
    try {
      const result = await bulkExclude.mutateAsync({
        campaignId,
        nominationIds: Array.from(selectedIds),
        reason: bulkExcludeReason.trim() || undefined,
      });
      setShowBulkExcludeDialog(false);
      setBulkExcludeReason('');
      setSelectedIds(new Set());
      console.log(`Excluded ${result.count} nominations`);
    } catch (e) {
      console.error('Bulk exclude failed', e);
    }
  };

  const handleSingleExcludeFromButton = async () => {
    if (!singleExcludeNomination) return;
    try {
      await excludeNomination.mutateAsync({
        campaignId,
        nominationId: singleExcludeNomination.id,
        reason: singleExcludeReason.trim() || undefined,
      });
      setShowSingleExcludeDialog(false);
      setSingleExcludeNomination(null);
      setSingleExcludeReason('');
    } catch (e) {
      console.error('Exclude failed', e);
    }
  };

  const handleBulkMatch = async () => {
    try {
      const result = await bulkAutoMatch.mutateAsync(campaignId);
      setAutoMatchResult(result);
    } catch (error) {
      console.error('Bulk match failed:', error);
    }
  };

  // Inline single-row accept: takes the precomputed top suggestion and applies
  // it via the standard match endpoint (so audit + alias rules are identical
  // to clicking through the dialog).
  const handleInlineAccept = async (
    nominationId: string,
    suggestion: TopSuggestion
  ) => {
    try {
      await matchNomination.mutateAsync({
        campaignId,
        nominationId,
        hcpId: suggestion.hcpId,
        addAlias: !suggestion.isNameMatch,
        matchType: suggestion.matchType,
        matchConfidence: suggestion.score,
      });
    } catch (error) {
      console.error('Inline accept failed:', error);
    }
  };

  // Bulk-accept entry point: partitions selected ids by available top suggestion
  // and confidence. If any selected row has a sub-threshold top suggestion, we
  // show a grouped confirm modal before submitting. High-confidence rows always
  // bundle into the same final submission.
  const handleBulkAccept = async () => {
    if (selectedIds.size === 0 || !topSuggestionsMap) return;
    const highConfIds: string[] = [];
    const lowConfRows: Array<{ id: string; rawName: string; suggestion: TopSuggestion }> = [];
    const noSuggestionRawNames: string[] = [];
    // Array.from avoids the downlevelIteration tsconfig flag that Next requires
    // for `for (const x of Set)` loops.
    for (const id of Array.from(selectedIds)) {
      const top = topSuggestionsMap[id];
      const row = filteredItems.find((n) => n.id === id);
      const rawName = row?.rawNameEntered ?? id;
      if (!top) {
        noSuggestionRawNames.push(rawName);
        continue;
      }
      if (top.score >= LOW_CONF_THRESHOLD) {
        highConfIds.push(id);
      } else {
        lowConfRows.push({ id, rawName, suggestion: top });
      }
    }

    // No confirmation needed — submit immediately.
    if (lowConfRows.length === 0) {
      if (highConfIds.length === 0) return;
      try {
        await bulkAccept.mutateAsync({ campaignId, nominationIds: highConfIds });
        setSelectedIds(new Set());
      } catch (error) {
        console.error('Bulk accept failed:', error);
      }
      return;
    }

    // Open the grouped confirmation modal.
    setBulkAcceptPending({ highConfIds, lowConfRows, noSuggestionRawNames });
  };

  const handleBulkAcceptConfirmed = async () => {
    if (!bulkAcceptPending) return;
    const all = [
      ...bulkAcceptPending.highConfIds,
      ...bulkAcceptPending.lowConfRows.map((r) => r.id),
    ];
    try {
      await bulkAccept.mutateAsync({ campaignId, nominationIds: all });
      setBulkAcceptPending(null);
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Bulk accept (confirmed) failed:', error);
    }
  };

  const handleBulkAcceptHighConfOnly = async () => {
    if (!bulkAcceptPending) return;
    if (bulkAcceptPending.highConfIds.length === 0) {
      setBulkAcceptPending(null);
      return;
    }
    try {
      await bulkAccept.mutateAsync({
        campaignId,
        nominationIds: bulkAcceptPending.highConfIds,
      });
      setBulkAcceptPending(null);
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Bulk accept (high-conf only) failed:', error);
    }
  };

  const handleCloseSurvey = async () => {
    try {
      await closeCampaign.mutateAsync(campaignId);
      setShowCloseConfirm(false);
      router.push(`/admin/campaigns/${campaignId}/scores`);
    } catch (error) {
      console.error('Failed to close campaign:', error);
    }
  };

  const totalNominations = stats
    ? Object.values(stats).reduce((a, b) => a + b, 0)
    : 0;
  const matchedCount = (stats?.MATCHED || 0) + (stats?.NEW_HCP || 0);
  const excludedCount = stats?.EXCLUDED || 0;
  const unresolvedCount = (stats?.UNMATCHED || 0) + (stats?.REVIEW_NEEDED || 0);
  // Progress includes matched, new HCP, and excluded (all are "resolved")
  const resolvedCount = matchedCount + excludedCount;
  const progress = totalNominations > 0 ? Math.round((resolvedCount / totalNominations) * 100) : 0;

  // Check if all nominations are resolved and campaign is still ACTIVE
  const allResolved = totalNominations > 0 && unresolvedCount === 0;
  const canCloseSurvey = allResolved && campaign?.status === 'ACTIVE';

  return (
    <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN', 'TEAM_MEMBER']}>
      <div className="p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/admin/campaigns/${campaignId}`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Campaign
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Nomination Matching</h1>
              {campaign && (
                <p className="text-muted-foreground">{campaign.name}</p>
              )}
            </div>
          </div>
          <Button
            onClick={handleBulkMatch}
            disabled={bulkAutoMatch.isPending || (stats?.UNMATCHED || 0) === 0}
          >
            {bulkAutoMatch.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4 mr-2" />
            )}
            Auto-Match ({stats?.UNMATCHED || 0})
          </Button>
        </div>

        {/* Progress */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>
                  {matchedCount} of {totalNominations} nominations matched
                </span>
                <span className="font-medium">{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-green-500 h-3 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Completion Banner - Show when all nominations are resolved */}
        {canCloseSurvey && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                  <div>
                    <h4 className="font-medium text-green-900">All nominations reviewed!</h4>
                    <p className="text-sm text-green-700">
                      {matchedCount} matched, {excludedCount} excluded. Ready to close survey and calculate scores.
                    </p>
                  </div>
                </div>
                <Button onClick={() => setShowCloseConfirm(true)}>
                  Close Survey & Continue
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card
              className={`cursor-pointer ${statusFilter === 'UNMATCHED' ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setStatusFilter('UNMATCHED')}
            >
              <CardHeader className="pb-2">
                <CardDescription>Unmatched</CardDescription>
                <CardTitle className="text-2xl text-yellow-600">
                  {stats.UNMATCHED || 0}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card
              className={`cursor-pointer ${statusFilter === 'REVIEW_NEEDED' ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setStatusFilter('REVIEW_NEEDED')}
            >
              <CardHeader className="pb-2">
                <CardDescription>Needs Review</CardDescription>
                <CardTitle className="text-2xl text-orange-600">
                  {stats.REVIEW_NEEDED || 0}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card
              className={`cursor-pointer ${statusFilter === 'MATCHED' ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setStatusFilter('MATCHED')}
            >
              <CardHeader className="pb-2">
                <CardDescription>Matched</CardDescription>
                <CardTitle className="text-2xl text-green-600">
                  {stats.MATCHED || 0}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card
              className={`cursor-pointer ${statusFilter === 'NEW_HCP' ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setStatusFilter('NEW_HCP')}
            >
              <CardHeader className="pb-2">
                <CardDescription>New HCP</CardDescription>
                <CardTitle className="text-2xl text-blue-600">
                  {stats.NEW_HCP || 0}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card
              className={`cursor-pointer ${statusFilter === 'EXCLUDED' ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setStatusFilter('EXCLUDED')}
            >
              <CardHeader className="pb-2">
                <CardDescription>Excluded</CardDescription>
                <CardTitle className="text-2xl text-red-600">
                  {stats.EXCLUDED || 0}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>
        )}

        {/* Help Banner - What to do with unmatched nominations */}
        {showHelp && (stats?.UNMATCHED || 0) + (stats?.REVIEW_NEEDED || 0) > 0 && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <HelpCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-blue-900 mb-2">How to handle unmatched nominations</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-blue-800">
                    <div className="flex items-start gap-2">
                      <LinkIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium">Match to HCP</span> - Link to an existing HCP in your database
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <UserPlus className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium">Create New HCP</span> - Add a new HCP (requires NPI)
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Pencil className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium">Fix Typos</span> - Edit the name and re-match
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Ban className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium">Exclude</span> - Invalid entries, self-nominations, non-HCPs
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-blue-700 mt-3">
                    Only <strong>Matched</strong> and <strong>New HCP</strong> nominations count toward survey scores.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-blue-600 hover:text-blue-800 hover:bg-blue-100 -mt-1 -mr-2"
                  onClick={() => setShowHelp(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Nominations Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Nominations</CardTitle>
                <CardDescription>
                  {nominations?.pagination.total || 0} nominations found
                  {(searchQuery.trim() || nominationTypeFilter) && filteredItems.length !== (nominations?.items.length || 0) && (
                    <> ({filteredItems.length} shown after filters)</>
                  )}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Select value={statusFilter || 'all'} onValueChange={(v) => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="UNMATCHED">Unmatched</SelectItem>
                    <SelectItem value="REVIEW_NEEDED">Needs Review</SelectItem>
                    <SelectItem value="MATCHED">Matched</SelectItem>
                    <SelectItem value="NEW_HCP">New HCP</SelectItem>
                    <SelectItem value="EXCLUDED">Excluded</SelectItem>
                  </SelectContent>
                </Select>
                {statusFilter && (
                  <Button variant="ghost" size="sm" onClick={() => setStatusFilter('')}>
                    Clear
                  </Button>
                )}
              </div>
            </div>
            {/* Filter bar */}
            <div className="flex flex-col sm:flex-row gap-3 mt-4 items-start sm:items-center flex-wrap">
              <div className="relative flex-1 max-w-sm min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={searchMode === 'exact' ? 'Exact match (comma-separated): na, n/a, none' : 'Search by name...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={searchMode === 'exact'}
                  onChange={(e) => setSearchMode(e.target.checked ? 'exact' : 'contains')}
                  className="h-4 w-4 cursor-pointer"
                />
                <span>Exact match</span>
              </label>
              <Select value={nominationTypeFilter || 'all'} onValueChange={(v) => setNominationTypeFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All nomination types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All nomination types</SelectItem>
                  <SelectItem value="DISCUSSION_LEADERS">Discussion Leaders</SelectItem>
                  <SelectItem value="REFERRAL_LEADERS">Referral Leaders</SelectItem>
                  <SelectItem value="ADVICE_LEADERS">Advice Leaders</SelectItem>
                  <SelectItem value="NATIONAL_LEADER">National Leaders</SelectItem>
                  <SelectItem value="RISING_STAR">Rising Stars</SelectItem>
                  <SelectItem value="SOCIAL_LEADER">Social Media Leaders</SelectItem>
                  <SelectItem value="REGIONAL_LEADER">Regional Leaders</SelectItem>
                  <SelectItem value="BIASED_LEADER">Biased Leaders</SelectItem>
                  <SelectItem value="NATIONAL_KOL">National KOL</SelectItem>
                </SelectContent>
              </Select>
              {(searchQuery || nominationTypeFilter) && (
                <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setNominationTypeFilter(''); }}>
                  Clear filters
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : !nominations || filteredItems.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No nominations found.
              </p>
            ) : (
              <>
                {/* Bulk action bar — shows when ≥1 row selected */}
                {selectedIds.size > 0 && (
                  <div className="flex items-center justify-between gap-3 mb-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
                    <div className="text-sm text-amber-900">
                      <strong>{selectedIds.size}</strong> nomination{selectedIds.size === 1 ? '' : 's'} selected
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedIds(new Set())}
                      >
                        Clear selection
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleBulkAccept}
                        disabled={bulkAccept.isPending || !topSuggestionsMap}
                      >
                        {bulkAccept.isPending ? (
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                        )}
                        Accept Top Match ({selectedIds.size})
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setBulkExcludeReason('');
                          setShowBulkExcludeDialog(true);
                        }}
                      >
                        <X className="w-4 h-4 mr-1" />
                        Exclude {selectedIds.size}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Top Pagination */}
                {nominations.pagination.pages > 1 && (
                  <div className="flex justify-between items-center mb-4">
                    <p className="text-sm text-muted-foreground">
                      Page {nominations.pagination.page} of {nominations.pagination.pages}
                    </p>
                    <div className="flex gap-2 items-center">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === 1}
                        onClick={() => setPage(page - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === nominations.pagination.pages}
                        onClick={() => setPage(page + 1)}
                      >
                        Next
                      </Button>
                      <div className="flex items-center gap-1 ml-2">
                        <Input
                          className="w-16 h-8 text-sm"
                          placeholder="#"
                          value={pageInputValue}
                          onChange={(e) => setPageInputValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handlePageJump(); }}
                        />
                        <Button variant="outline" size="sm" onClick={handlePageJump}>
                          Go
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">
                        <input
                          type="checkbox"
                          aria-label="Select all on page"
                          checked={
                            filteredItems.length > 0 &&
                            filteredItems.every((n) => n.matchStatus !== 'EXCLUDED' && selectedIds.has(n.id))
                          }
                          onChange={(e) => {
                            const next = new Set(selectedIds);
                            if (e.target.checked) {
                              filteredItems.forEach((n) => {
                                if (n.matchStatus !== 'EXCLUDED') next.add(n.id);
                              });
                            } else {
                              filteredItems.forEach((n) => next.delete(n.id));
                            }
                            setSelectedIds(next);
                          }}
                          className="h-4 w-4 cursor-pointer"
                        />
                      </TableHead>
                      <TableHead>Raw Name Entered</TableHead>
                      <TableHead>Nominated By</TableHead>
                      <TableHead>Nomination Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Matched To</TableHead>
                      <TableHead className="w-[180px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((nomination) => (
                      <TableRow key={nomination.id}>
                        <TableCell>
                          {nomination.matchStatus !== 'EXCLUDED' && (
                            <input
                              type="checkbox"
                              aria-label={`Select nomination ${nomination.rawNameEntered}`}
                              checked={selectedIds.has(nomination.id)}
                              onChange={(e) => {
                                const next = new Set(selectedIds);
                                if (e.target.checked) next.add(nomination.id);
                                else next.delete(nomination.id);
                                setSelectedIds(next);
                              }}
                              className="h-4 w-4 cursor-pointer"
                            />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          "{nomination.rawNameEntered}"
                        </TableCell>
                        <TableCell>
                          {nomination.nominatorHcp.firstName} {nomination.nominatorHcp.lastName}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {(nomination.question.question?.nominationType && NOMINATION_TYPE_LABELS[nomination.question.question.nominationType]) || nomination.question.question?.nominationType || '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge className={STATUS_COLORS[nomination.matchStatus] || ''}>
                              {nomination.matchStatus === 'REVIEW_NEEDED' ? 'Review Needed' : nomination.matchStatus}
                            </Badge>
                            {nomination.matchType && (
                              <div className="flex items-center gap-1.5">
                                <Badge
                                  variant="outline"
                                  className={`text-xs px-1.5 py-0 ${
                                    nomination.matchType === 'exact'
                                      ? 'bg-green-50 text-green-700 border-green-300'
                                      : nomination.matchType === 'primary'
                                        ? 'bg-blue-50 text-blue-700 border-blue-300'
                                        : nomination.matchType === 'alias'
                                          ? 'bg-purple-50 text-purple-700 border-purple-300'
                                          : 'bg-gray-50 text-gray-700 border-gray-300'
                                  }`}
                                >
                                  {MATCH_TYPE_LABELS[nomination.matchType] || nomination.matchType}
                                </Badge>
                                {nomination.matchConfidence != null && (
                                  <span className="text-xs text-muted-foreground font-medium">
                                    {nomination.matchConfidence}%
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {nomination.matchedHcp ? (
                            <span>
                              {nomination.matchedHcp.firstName} {nomination.matchedHcp.lastName}
                              <span className="text-xs text-muted-foreground ml-1">
                                ({nomination.matchedHcp.npi})
                              </span>
                            </span>
                          ) : nomination.matchStatus === 'EXCLUDED' && nomination.excludeReason ? (
                            <span className="text-sm text-muted-foreground italic">
                              {nomination.excludeReason}
                            </span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          {(nomination.matchStatus === 'UNMATCHED' || nomination.matchStatus === 'REVIEW_NEEDED') && (
                            <div className="flex gap-1 items-center flex-wrap">
                              {(() => {
                                // Inline accept link — shown only when the batch
                                // top-suggestions lookup found a candidate.
                                const top = topSuggestionsMap?.[nomination.id];
                                if (!top) return null;
                                const isLowConf = top.score < LOW_CONF_THRESHOLD;
                                return (
                                  <button
                                    type="button"
                                    onClick={() => handleInlineAccept(nomination.id, top)}
                                    disabled={matchNomination.isPending}
                                    title={`Accept: ${top.firstName} ${top.lastName}${top.npi ? ` (NPI ${top.npi})` : ''} — ${top.score}% confidence`}
                                    className={`text-xs underline-offset-2 hover:underline disabled:opacity-50 mr-1 ${
                                      isLowConf ? 'text-amber-700' : 'text-primary'
                                    }`}
                                  >
                                    Accept: {top.firstName} {top.lastName}{' '}
                                    <span className="text-muted-foreground">({top.score}%)</span>
                                  </button>
                                );
                              })()}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditNominationId(nomination.id)}
                                title="Edit name (fix typo)"
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedNominationId(nomination.id)}
                                title={nomination.matchStatus === 'REVIEW_NEEDED' ? 'Review match' : 'Match to HCP'}
                              >
                                <LinkIcon className="w-4 h-4" />
                              </Button>
                              {nomination.matchStatus === 'UNMATCHED' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setNominationForNewHcp(nomination.id);
                                    setShowCreateHcpDialog(true);
                                  }}
                                  title="Create New HCP"
                                >
                                  <UserPlus className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSingleExcludeNomination({ id: nomination.id, rawName: nomination.rawNameEntered });
                                  setSingleExcludeReason('');
                                  setShowSingleExcludeDialog(true);
                                }}
                                title="Exclude this nomination"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Bottom Pagination */}
                {nominations.pagination.pages > 1 && (
                  <div className="flex justify-between items-center mt-4">
                    <p className="text-sm text-muted-foreground">
                      Page {nominations.pagination.page} of {nominations.pagination.pages}
                    </p>
                    <div className="flex gap-2 items-center">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === 1}
                        onClick={() => setPage(page - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === nominations.pagination.pages}
                        onClick={() => setPage(page + 1)}
                      >
                        Next
                      </Button>
                      <div className="flex items-center gap-1 ml-2">
                        <Input
                          className="w-16 h-8 text-sm"
                          placeholder="#"
                          value={pageInputValue}
                          onChange={(e) => setPageInputValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handlePageJump(); }}
                        />
                        <Button variant="outline" size="sm" onClick={handlePageJump}>
                          Go
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Match Dialog */}
        {selectedNominationId && (
          <MatchNominationDialog
            campaignId={campaignId}
            nominationId={selectedNominationId}
            nomination={nominations?.items.find((n) => n.id === selectedNominationId)}
            onClose={() => setSelectedNominationId(null)}
            onCreateNewHcp={(nominationId) => {
              // Close the review dialog and hand off to the create-HCP dialog
              // for the same nomination in a single flow.
              setSelectedNominationId(null);
              setNominationForNewHcp(nominationId);
              setShowCreateHcpDialog(true);
            }}
          />
        )}

        {/* Create HCP Dialog */}
        {showCreateHcpDialog && nominationForNewHcp && (
          <CreateHcpDialog
            campaignId={campaignId}
            nominationId={nominationForNewHcp}
            nomination={nominations?.items.find((n) => n.id === nominationForNewHcp)}
            onClose={() => {
              setShowCreateHcpDialog(false);
              setNominationForNewHcp(null);
            }}
          />
        )}

        {/* Edit Name Dialog */}
        {editNominationId && (
          <EditNominationDialog
            campaignId={campaignId}
            nominationId={editNominationId}
            nomination={nominations?.items.find((n) => n.id === editNominationId)}
            onClose={() => setEditNominationId(null)}
            onSaveAndRematch={(nomId) => {
              setEditNominationId(null);
              setSelectedNominationId(nomId);
            }}
          />
        )}

        {/* Auto-Match Result Dialog */}
        {autoMatchResult && (
          <Dialog open onOpenChange={() => setAutoMatchResult(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  Auto-Match Complete
                </DialogTitle>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-3xl font-bold text-green-600">{autoMatchResult.matched}</p>
                      <p className="text-sm text-muted-foreground">Matched</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-3xl font-bold text-muted-foreground">{autoMatchResult.total - autoMatchResult.matched}</p>
                      <p className="text-sm text-muted-foreground">Remaining</p>
                    </CardContent>
                  </Card>
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  Successfully processed {autoMatchResult.total} nominations.
                  {autoMatchResult.matched > 0 && (
                    <> Check the <strong>Matched</strong> and <strong>Needs Review</strong> tabs to review results.</>
                  )}
                </p>
                {autoMatchResult.errors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <p className="text-sm font-medium text-red-800 mb-1">
                      {autoMatchResult.errors.length} error(s) occurred:
                    </p>
                    <ul className="text-xs text-red-700 list-disc list-inside">
                      {autoMatchResult.errors.slice(0, 5).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                      {autoMatchResult.errors.length > 5 && (
                        <li>...and {autoMatchResult.errors.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button onClick={() => setAutoMatchResult(null)}>
                  Done
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Close Survey Confirmation Dialog */}
        <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Close Survey & Calculate Scores</AlertDialogTitle>
              <AlertDialogDescription>
                This will close the survey for new responses and proceed to score calculation.
                You can reopen the survey later if needed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCloseSurvey}
                disabled={closeCampaign.isPending}
              >
                {closeCampaign.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Close Survey & Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Single Exclude Dialog */}
        <AlertDialog open={showSingleExcludeDialog} onOpenChange={setShowSingleExcludeDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Exclude nomination</AlertDialogTitle>
              <AlertDialogDescription>
                {singleExcludeNomination && (
                  <>
                    Exclude the nomination <strong>&quot;{singleExcludeNomination.rawName}&quot;</strong>?
                    This marks it as excluded so it won&apos;t count in scoring.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-2">
              <Label htmlFor="single-exclude-reason" className="text-sm font-medium">
                Reason <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Textarea
                id="single-exclude-reason"
                value={singleExcludeReason}
                onChange={(e) => setSingleExcludeReason(e.target.value)}
                placeholder="e.g. 'N/A entry' or 'Duplicate'"
                className="mt-1"
                rows={2}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleSingleExcludeFromButton}
                disabled={excludeNomination.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                {excludeNomination.isPending ? 'Excluding...' : 'Confirm Exclude'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk-accept low-confidence confirmation modal.
            Opens when handleBulkAccept finds any selected row with a
            top-suggestion score < LOW_CONF_THRESHOLD. Lets the steward
            confirm all (incl. low-conf) or only the high-conf subset. */}
        {bulkAcceptPending && (
          <Dialog open onOpenChange={(o) => { if (!o) setBulkAcceptPending(null); }}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle>Confirm low-confidence matches</DialogTitle>
                <DialogDescription>
                  {bulkAcceptPending.lowConfRows.length} of {bulkAcceptPending.lowConfRows.length + bulkAcceptPending.highConfIds.length}{' '}
                  selected match{bulkAcceptPending.lowConfRows.length + bulkAcceptPending.highConfIds.length === 1 ? '' : 'es'} are below {LOW_CONF_THRESHOLD}% confidence.
                  Review each before accepting.
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 overflow-auto py-2 space-y-2">
                {bulkAcceptPending.lowConfRows.map((row) => (
                  <div
                    key={row.id}
                    className="border rounded-md p-3 bg-amber-50 border-amber-200"
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <span className="font-medium">&ldquo;{row.rawName}&rdquo;</span>
                          <ChevronRight className="inline w-3 h-3 mx-1 text-muted-foreground" />
                          <span className="font-medium">
                            {row.suggestion.firstName} {row.suggestion.lastName}
                          </span>
                          {row.suggestion.npi && (
                            <span className="text-xs text-muted-foreground ml-1">
                              (NPI {row.suggestion.npi})
                            </span>
                          )}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="bg-amber-100 text-amber-800 border-amber-300 shrink-0"
                      >
                        {row.suggestion.score}%
                      </Badge>
                    </div>
                  </div>
                ))}
                {bulkAcceptPending.highConfIds.length > 0 && (
                  <p className="text-xs text-muted-foreground pt-2">
                    Plus {bulkAcceptPending.highConfIds.length} high-confidence match{bulkAcceptPending.highConfIds.length === 1 ? '' : 'es'} (≥{LOW_CONF_THRESHOLD}%) that will be accepted automatically.
                  </p>
                )}
                {bulkAcceptPending.noSuggestionRawNames.length > 0 && (
                  <div className="border rounded-md p-3 bg-gray-50 border-gray-200">
                    <p className="text-xs text-muted-foreground">
                      <strong>{bulkAcceptPending.noSuggestionRawNames.length}</strong> selected row{bulkAcceptPending.noSuggestionRawNames.length === 1 ? '' : 's'} have no suggestion and will be skipped:
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 italic line-clamp-2">
                      {bulkAcceptPending.noSuggestionRawNames.slice(0, 8).join(', ')}
                      {bulkAcceptPending.noSuggestionRawNames.length > 8 && '…'}
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setBulkAcceptPending(null)}>
                  Cancel
                </Button>
                {bulkAcceptPending.highConfIds.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={handleBulkAcceptHighConfOnly}
                    disabled={bulkAccept.isPending}
                  >
                    Skip low-conf, accept {bulkAcceptPending.highConfIds.length}
                  </Button>
                )}
                <Button
                  onClick={handleBulkAcceptConfirmed}
                  disabled={bulkAccept.isPending}
                >
                  {bulkAccept.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                  )}
                  Accept all {bulkAcceptPending.highConfIds.length + bulkAcceptPending.lowConfRows.length}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Bulk Exclude Dialog */}
        <AlertDialog open={showBulkExcludeDialog} onOpenChange={setShowBulkExcludeDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Exclude {selectedIds.size} nomination{selectedIds.size === 1 ? '' : 's'}</AlertDialogTitle>
              <AlertDialogDescription>
                This will mark all selected nominations as EXCLUDED. They will not count in scoring.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-2">
              <Label htmlFor="bulk-exclude-reason" className="text-sm font-medium">
                Reason <span className="text-muted-foreground text-xs">(optional, applies to all)</span>
              </Label>
              <Textarea
                id="bulk-exclude-reason"
                value={bulkExcludeReason}
                onChange={(e) => setBulkExcludeReason(e.target.value)}
                placeholder="e.g. 'N/A junk entries' or 'Bulk cleanup of duplicates'"
                className="mt-1"
                rows={2}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleBulkExclude}
                disabled={bulkExclude.isPending || selectedIds.size === 0}
                className="bg-red-600 hover:bg-red-700"
              >
                {bulkExclude.isPending ? 'Excluding...' : `Confirm Exclude (${selectedIds.size})`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </RequireAuth>
  );
}

interface MatchNominationDialogProps {
  campaignId: string;
  nominationId: string;
  nomination?: {
    rawNameEntered: string;
    matchStatus: string;
    matchedHcp: { id: string; npi: string; firstName: string; lastName: string } | null;
    matchType: string | null;
    matchConfidence: number | null;
    nominatorHcp: { firstName: string; lastName: string };
  };
  onClose: () => void;
  /**
   * Hand-off to the Create-New-HCP flow for the same nomination. The parent
   * closes this dialog and opens CreateHcpDialog with the rawName pre-filled.
   */
  onCreateNewHcp?: (nominationId: string) => void;
}

function MatchNominationDialog({
  campaignId,
  nominationId,
  nomination,
  onClose,
  onCreateNewHcp,
}: MatchNominationDialogProps) {
  const { data: suggestions, isLoading } = useNominationSuggestions(campaignId, nominationId);
  const matchNomination = useMatchNomination();
  const excludeNomination = useExcludeNomination();

  const isReviewMode = nomination?.matchStatus === 'REVIEW_NEEDED';
  const currentMatchedHcpId = nomination?.matchedHcp?.id || null;

  // Pre-select the currently matched HCP if in review mode
  const [selectedHcpId, setSelectedHcpId] = useState<string | null>(currentMatchedHcpId);
  const [addAlias, setAddAlias] = useState(false);
  const [showExcludeConfirm, setShowExcludeConfirm] = useState(false);
  const [excludeReason, setExcludeReason] = useState('');

  // Get the selected suggestion to check if it's a name match
  const selectedSuggestion = suggestions?.find((s) => s.hcp.id === selectedHcpId);
  const isNameMatch = selectedSuggestion?.isNameMatch ?? false;

  const handleMatch = async () => {
    if (!selectedHcpId) return;

    try {
      // When confirming an existing match in review mode, use 100% confidence
      // to mark it as MATCHED (user has verified the match)
      const isConfirmingCurrentMatch = isReviewMode && selectedHcpId === currentMatchedHcpId;
      const matchType = isConfirmingCurrentMatch ? 'exact' : (selectedSuggestion?.matchType || 'exact');
      const matchConfidence = isConfirmingCurrentMatch ? 100 : (selectedSuggestion?.score || 100);

      // Never add alias if it's already a name match
      const shouldAddAlias = !isNameMatch && addAlias;
      await matchNomination.mutateAsync({
        campaignId,
        nominationId,
        hcpId: selectedHcpId,
        addAlias: shouldAddAlias,
        matchType,
        matchConfidence,
      });
      onClose();
    } catch (error) {
      console.error('Failed to match:', error);
    }
  };

  const handleExclude = async () => {
    try {
      await excludeNomination.mutateAsync({
        campaignId,
        nominationId,
        reason: excludeReason.trim() || undefined,
      });
      onClose();
    } catch (error) {
      console.error('Failed to exclude:', error);
    }
  };

  // Exclude confirmation view
  if (showExcludeConfirm) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Ban className="w-5 h-5" />
              Exclude Nomination
            </DialogTitle>
            <DialogDescription>
              Excluding "{nomination?.rawNameEntered}" from this campaign.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-700">
                This nomination will be excluded from matching and will not be counted in KOL scoring.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="excludeReason">Reason for exclusion (optional)</Label>
              <Textarea
                id="excludeReason"
                placeholder="e.g., Invalid entry, self-nomination, not an HCP..."
                value={excludeReason}
                onChange={(e) => setExcludeReason(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Adding a reason helps others understand why this was excluded.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowExcludeConfirm(false)}>
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={handleExclude}
              disabled={excludeNomination.isPending}
            >
              {excludeNomination.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Ban className="w-4 h-4 mr-2" />
              )}
              Confirm Exclude
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{isReviewMode ? 'Review Match' : 'Match Nomination'}</DialogTitle>
          <DialogDescription>
            "{nomination?.rawNameEntered}" - nominated by{' '}
            {nomination?.nominatorHcp.firstName} {nomination?.nominatorHcp.lastName}
          </DialogDescription>
        </DialogHeader>

        {/* Show current match info in review mode */}
        {isReviewMode && nomination?.matchedHcp && (
          <div className="bg-orange-50 border border-orange-200 rounded-md p-3 mb-2">
            <p className="text-sm font-medium text-orange-800 mb-1">Current Match (Needs Review)</p>
            <p className="text-sm text-orange-700">
              {nomination.matchedHcp.firstName} {nomination.matchedHcp.lastName} (NPI: {nomination.matchedHcp.npi})
              {nomination.matchType && nomination.matchConfidence && (
                <span className="ml-2">
                  — {nomination.matchType} match at {nomination.matchConfidence}% confidence
                </span>
              )}
            </p>
          </div>
        )}

        <div className="flex-1 overflow-auto py-4">
          <h4 className="font-medium mb-3">{isReviewMode ? 'Confirm or Select Different Match' : 'Suggested Matches'}</h4>
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : !suggestions || suggestions.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              <AlertCircle className="w-8 h-8 mx-auto mb-2" />
              <p>No matching HCPs found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {suggestions.map((suggestion) => (
                <div
                  key={suggestion.hcp.id}
                  className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                    selectedHcpId === suggestion.hcp.id
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => {
                    setSelectedHcpId(suggestion.hcp.id);
                    // Only default to adding alias if it's not a name match
                    setAddAlias(!suggestion.isNameMatch);
                  }}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">
                        {suggestion.hcp.firstName} {suggestion.hcp.lastName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        NPI: {suggestion.hcp.npi}
                        {suggestion.hcp.specialty && ` • ${suggestion.hcp.specialty}`}
                        {suggestion.hcp.city && suggestion.hcp.state && (
                          <> • {suggestion.hcp.city}, {suggestion.hcp.state}</>
                        )}
                      </p>
                      {suggestion.hcp.aliases.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Aliases: {suggestion.hcp.aliases.map((a) => a.aliasName).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge
                        variant="outline"
                        className={
                          suggestion.matchType === 'exact'
                            ? 'bg-green-50 text-green-700 border-green-300'
                            : suggestion.matchType === 'primary'
                              ? 'bg-blue-50 text-blue-700 border-blue-300'
                              : suggestion.matchType === 'alias'
                                ? 'bg-purple-50 text-purple-700 border-purple-300'
                                : 'bg-gray-50 text-gray-700'
                        }
                      >
                        {suggestion.matchType === 'exact' && 'Exact Match'}
                        {suggestion.matchType === 'primary' && 'Name Match'}
                        {suggestion.matchType === 'alias' && 'Alias Match'}
                        {suggestion.matchType === 'partial' && 'Partial Match'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {suggestion.score}% confidence
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedHcpId && (
            <div className="mt-4 pt-4 border-t">
              {isNameMatch ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  Name matches HCP record - no alias needed
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="addAlias"
                    checked={addAlias}
                    onCheckedChange={(checked) => setAddAlias(checked as boolean)}
                  />
                  <Label htmlFor="addAlias" className="text-sm">
                    Add "{nomination?.rawNameEntered}" as alias for selected HCP
                  </Label>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => setShowExcludeConfirm(true)}
          >
            <Ban className="w-4 h-4 mr-2" />
            Exclude
          </Button>
          {onCreateNewHcp && (
            <Button
              variant="outline"
              onClick={() => onCreateNewHcp(nominationId)}
              title="Create a brand-new HCP for this nomination (the raw name will be pre-filled)"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Create New HCP
            </Button>
          )}
          <Button
            onClick={handleMatch}
            disabled={!selectedHcpId || matchNomination.isPending}
          >
            {matchNomination.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-2" />
            )}
            {isReviewMode ? 'Confirm Match' : 'Match'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CreateHcpDialogProps {
  campaignId: string;
  nominationId: string;
  nomination?: {
    rawNameEntered: string;
  };
  onClose: () => void;
}

function CreateHcpDialog({
  campaignId,
  nominationId,
  nomination,
  onClose,
}: CreateHcpDialogProps) {
  const createHcpFromNomination = useCreateHcpFromNomination();

  // Parse name into first/last
  const nameParts = (nomination?.rawNameEntered || '').trim().split(/\s+/);
  const initialFirstName = nameParts[0] || '';
  const initialLastName = nameParts.slice(1).join(' ') || '';

  // Same controls as the canonical HCP form dialog: 2-value specialty
  // dropdown + multi-select sub-specialty sourced from DiseaseArea.
  const { data: diseaseAreasData } = useDiseaseAreas();
  const diseaseAreas = diseaseAreasData?.items ?? [];
  const idToName = new Map(diseaseAreas.map((d) => [d.id, d.name]));
  const nameToId = new Map(diseaseAreas.map((d) => [d.name, d.id]));
  const daOptions = diseaseAreas.map((d) => d.name);

  const [formData, setFormData] = useState<{
    npi: string;
    firstName: string;
    lastName: string;
    email: string;
    // v1.15.31: canonical specialty values are field-form (Optometry / Ophthalmology).
    specialty: '' | 'Optometry' | 'Ophthalmology';
    diseaseAreaIds: string[];
    city: string;
    state: string;
  }>({
    npi: '',
    firstName: initialFirstName,
    lastName: initialLastName,
    email: '',
    specialty: '',
    diseaseAreaIds: [],
    city: '',
    state: '',
  });

  const handleSubmit = async () => {
    if (!formData.npi || !formData.firstName || !formData.lastName) {
      return;
    }

    try {
      await createHcpFromNomination.mutateAsync({
        campaignId,
        nominationId,
        hcpData: {
          npi: formData.npi,
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email || null,
          specialty: formData.specialty || null,
          diseaseAreaIds: formData.diseaseAreaIds,
          city: formData.city || null,
          state: formData.state || null,
        },
      });
      onClose();
    } catch (error) {
      console.error('Failed to create HCP:', error);
      alert(error instanceof Error ? error.message : 'Failed to create HCP');
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New HCP</DialogTitle>
          <DialogDescription>
            Create a new HCP record from "{nomination?.rawNameEntered}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="npi">NPI *</Label>
            <Input
              id="npi"
              value={formData.npi}
              onChange={(e) => setFormData({ ...formData, npi: e.target.value })}
              placeholder="10-digit NPI"
              maxLength={10}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="specialty">Specialty</Label>
            <Select
              value={formData.specialty}
              onValueChange={(v) =>
                setFormData({
                  ...formData,
                  specialty: v as '' | 'Optometry' | 'Ophthalmology',
                })
              }
            >
              <SelectTrigger id="specialty">
                <SelectValue placeholder="Select specialty" />
              </SelectTrigger>
              <SelectContent>
                {HCP_SPECIALTIES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Sub-specialty (optional, multi-select)</Label>
            <MultiSelect
              options={daOptions}
              selected={formData.diseaseAreaIds
                .map((id) => idToName.get(id))
                .filter((n): n is string => !!n)}
              onChange={(names) =>
                setFormData({
                  ...formData,
                  diseaseAreaIds: names
                    .map((n) => nameToId.get(n))
                    .filter((id): id is string => !!id),
                })
              }
              placeholder="Select sub-specialty…"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                maxLength={2}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              !formData.npi ||
              formData.npi.length !== 10 ||
              !formData.firstName ||
              !formData.lastName ||
              createHcpFromNomination.isPending
            }
          >
            {createHcpFromNomination.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <UserPlus className="w-4 h-4 mr-2" />
            )}
            Create & Match
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface EditNominationDialogProps {
  campaignId: string;
  nominationId: string;
  nomination?: {
    rawNameEntered: string;
  };
  onClose: () => void;
  onSaveAndRematch?: (nominationId: string) => void;
}

function EditNominationDialog({
  campaignId,
  nominationId,
  nomination,
  onClose,
  onSaveAndRematch,
}: EditNominationDialogProps) {
  const updateRawName = useUpdateNominationRawName();
  const matchNomination = useMatchNomination();
  const [newName, setNewName] = useState(nomination?.rawNameEntered || '');

  // v1.17.6: live exact-match preview. As the user types, debounce 300ms
  // then call the suggestions endpoint with the proposed name. If the top
  // suggestion is an exact name match (isNameMatch=true), surface an
  // inline "Match to existing X" callout — saves the user from the
  // rename → MatchDialog → Create-new-HCP dead end where "this HCP
  // already exists" would otherwise fire.
  const trimmedNewName = newName.trim();
  const hasChanged = trimmedNewName !== nomination?.rawNameEntered;
  const [debouncedName, setDebouncedName] = useState(trimmedNewName);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedName(trimmedNewName), 300);
    return () => clearTimeout(t);
  }, [trimmedNewName]);
  // Only search when the user has actually changed the name AND the
  // debounced value is non-empty. Skip when name matches the original
  // (those suggestions already drive the existing MatchDialog flow).
  const shouldPreview =
    hasChanged && debouncedName.length > 0 && debouncedName === trimmedNewName;
  const { data: previewSuggestions } = useNominationSuggestions(
    campaignId,
    shouldPreview ? nominationId : null,
    shouldPreview ? debouncedName : undefined
  );
  const exactMatchSuggestion = previewSuggestions?.find(
    (s) => s.isNameMatch && s.score >= 90
  );

  const handleSubmit = async () => {
    if (!trimmedNewName) return;

    try {
      await updateRawName.mutateAsync({
        campaignId,
        nominationId,
        rawNameEntered: trimmedNewName,
      });
      onClose();
      // Auto-open the match dialog after save
      if (onSaveAndRematch) {
        onSaveAndRematch(nominationId);
      }
    } catch (error) {
      console.error('Failed to update nomination:', error);
      alert(error instanceof Error ? error.message : 'Failed to update nomination');
    }
  };

  // v1.17.6: inline match path. Skips rename + post-save MatchDialog —
  // goes straight from rename input to a matched nomination via
  // matchNomination. matchType='exact' / confidence=100 reflects the
  // user-confirmed exact name match.
  const handleInlineMatch = async () => {
    if (!exactMatchSuggestion) return;
    try {
      await matchNomination.mutateAsync({
        campaignId,
        nominationId,
        hcpId: exactMatchSuggestion.hcp.id,
        addAlias: false, // name match — no alias needed
        matchType: 'exact',
        matchConfidence: 100,
      });
      onClose();
    } catch (error) {
      console.error('Failed to match:', error);
      alert(error instanceof Error ? error.message : 'Failed to match nomination');
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Nomination Name</DialogTitle>
          <DialogDescription>
            Fix any typos in the name to improve matching accuracy.
            This will trigger a new search for matching HCPs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="rawName">Name</Label>
            <Input
              id="rawName"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter corrected name"
              autoFocus
            />
            {nomination?.rawNameEntered && hasChanged && (
              <p className="text-xs text-muted-foreground mt-1">
                Original: "{nomination.rawNameEntered}"
              </p>
            )}
          </div>

          {/* v1.17.6: inline exact-match callout. Surfaces a one-click
              Match path when the typed name matches an existing HCP. */}
          {exactMatchSuggestion && (
            <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950 p-3 space-y-2">
              <div className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-medium text-blue-900 dark:text-blue-100">
                    Existing HCP with this name found
                  </div>
                  <div className="text-blue-800 dark:text-blue-200">
                    {exactMatchSuggestion.hcp.firstName} {exactMatchSuggestion.hcp.lastName}
                    {exactMatchSuggestion.hcp.npi && (
                      <span className="text-blue-700 dark:text-blue-300"> · NPI {exactMatchSuggestion.hcp.npi}</span>
                    )}
                    {exactMatchSuggestion.hcp.specialty && (
                      <span className="text-blue-700 dark:text-blue-300"> · {exactMatchSuggestion.hcp.specialty}</span>
                    )}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="default"
                onClick={handleInlineMatch}
                disabled={matchNomination.isPending}
                className="w-full"
              >
                {matchNomination.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <LinkIcon className="w-4 h-4 mr-2" />
                )}
                Match to this HCP instead
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!trimmedNewName || !hasChanged || updateRawName.isPending}
          >
            {updateRawName.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Pencil className="w-4 h-4 mr-2" />
            )}
            Save & Re-match
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
