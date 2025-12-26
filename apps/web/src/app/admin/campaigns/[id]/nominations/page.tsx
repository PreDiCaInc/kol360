'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  useNominations,
  useNominationStats,
  useNominationSuggestions,
  useMatchNomination,
  useCreateHcpFromNomination,
  useExcludeNomination,
  useBulkAutoMatch,
  useUpdateNominationRawName,
} from '@/hooks/use-nominations';
import { useCampaign } from '@/hooks/use-campaigns';
import { RequireAuth } from '@/components/auth/require-auth';
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
} from 'lucide-react';

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
  const campaignId = params.id as string;

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
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

  const { data: campaign } = useCampaign(campaignId);
  const { data: nominations, isLoading } = useNominations(campaignId, {
    status: statusFilter || undefined,
    page,
    limit: 50,
  });
  const { data: stats } = useNominationStats(campaignId);

  const bulkAutoMatch = useBulkAutoMatch();

  const handleBulkMatch = async () => {
    try {
      const result = await bulkAutoMatch.mutateAsync(campaignId);
      setAutoMatchResult(result);
    } catch (error) {
      console.error('Bulk match failed:', error);
    }
  };

  const totalNominations = stats
    ? Object.values(stats).reduce((a, b) => a + b, 0)
    : 0;
  const matchedCount = (stats?.MATCHED || 0) + (stats?.NEW_HCP || 0);
  const excludedCount = stats?.EXCLUDED || 0;
  const reviewCount = stats?.REVIEW_NEEDED || 0;
  // Progress includes matched, new HCP, and excluded (all are "resolved")
  const resolvedCount = matchedCount + excludedCount;
  const progress = totalNominations > 0 ? Math.round((resolvedCount / totalNominations) * 100) : 0;

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
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
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
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : !nominations || nominations.items.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No nominations found.
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Raw Name Entered</TableHead>
                      <TableHead>Nominated By</TableHead>
                      <TableHead>Question</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Matched To</TableHead>
                      <TableHead className="w-[150px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nominations.items.map((nomination) => (
                      <TableRow key={nomination.id}>
                        <TableCell className="font-medium">
                          "{nomination.rawNameEntered}"
                        </TableCell>
                        <TableCell>
                          {nomination.nominatorHcp.firstName} {nomination.nominatorHcp.lastName}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {nomination.question.questionTextSnapshot}
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
                            <div className="flex gap-1">
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
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {nominations.pagination.pages > 1 && (
                  <div className="flex justify-between items-center mt-4">
                    <p className="text-sm text-muted-foreground">
                      Page {nominations.pagination.page} of {nominations.pagination.pages}
                    </p>
                    <div className="flex gap-2">
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
}

function MatchNominationDialog({
  campaignId,
  nominationId,
  nomination,
  onClose,
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

        <DialogFooter className="gap-2">
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

  const [formData, setFormData] = useState({
    npi: '',
    firstName: initialFirstName,
    lastName: initialLastName,
    email: '',
    specialty: '',
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
            <Input
              id="specialty"
              value={formData.specialty}
              onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
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
}

function EditNominationDialog({
  campaignId,
  nominationId,
  nomination,
  onClose,
}: EditNominationDialogProps) {
  const updateRawName = useUpdateNominationRawName();
  const [newName, setNewName] = useState(nomination?.rawNameEntered || '');

  const handleSubmit = async () => {
    if (!newName.trim()) return;

    try {
      await updateRawName.mutateAsync({
        campaignId,
        nominationId,
        rawNameEntered: newName.trim(),
      });
      onClose();
    } catch (error) {
      console.error('Failed to update nomination:', error);
      alert(error instanceof Error ? error.message : 'Failed to update nomination');
    }
  };

  const hasChanged = newName.trim() !== nomination?.rawNameEntered;

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
            {nomination?.rawNameEntered && newName.trim() !== nomination.rawNameEntered && (
              <p className="text-xs text-muted-foreground mt-1">
                Original: "{nomination.rawNameEntered}"
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!newName.trim() || !hasChanged || updateRawName.isPending}
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
