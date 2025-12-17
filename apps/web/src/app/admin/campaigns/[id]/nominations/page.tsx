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
} from '@/hooks/use-nominations';
import { useCampaign } from '@/hooks/use-campaigns';
import { RequireAuth } from '@/components/auth/require-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  UNMATCHED: 'bg-yellow-100 text-yellow-700',
  MATCHED: 'bg-green-100 text-green-700',
  NEW_HCP: 'bg-blue-100 text-blue-700',
  EXCLUDED: 'bg-red-100 text-red-700',
};

export default function NominationsPage() {
  const params = useParams();
  const campaignId = params.id as string;

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [selectedNominationId, setSelectedNominationId] = useState<string | null>(null);
  const [showCreateHcpDialog, setShowCreateHcpDialog] = useState(false);
  const [nominationForNewHcp, setNominationForNewHcp] = useState<string | null>(null);

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
      alert(`Auto-matched ${result.matched} of ${result.total} nominations`);
    } catch (error) {
      console.error('Bulk match failed:', error);
    }
  };

  const totalNominations = stats
    ? Object.values(stats).reduce((a, b) => a + b, 0)
    : 0;
  const matchedCount = (stats?.MATCHED || 0) + (stats?.NEW_HCP || 0);
  const progress = totalNominations > 0 ? Math.round((matchedCount / totalNominations) * 100) : 0;

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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All statuses</SelectItem>
                    <SelectItem value="UNMATCHED">Unmatched</SelectItem>
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
                          <Badge className={STATUS_COLORS[nomination.matchStatus] || ''}>
                            {nomination.matchStatus}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {nomination.matchedHcp ? (
                            <span>
                              {nomination.matchedHcp.firstName} {nomination.matchedHcp.lastName}
                              <span className="text-xs text-muted-foreground ml-1">
                                ({nomination.matchedHcp.npi})
                              </span>
                            </span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          {nomination.matchStatus === 'UNMATCHED' && (
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedNominationId(nomination.id)}
                                title="Match to HCP"
                              >
                                <LinkIcon className="w-4 h-4" />
                              </Button>
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
      </div>
    </RequireAuth>
  );
}

interface MatchNominationDialogProps {
  campaignId: string;
  nominationId: string;
  nomination?: {
    rawNameEntered: string;
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

  const [selectedHcpId, setSelectedHcpId] = useState<string | null>(null);
  const [addAlias, setAddAlias] = useState(true);

  const handleMatch = async () => {
    if (!selectedHcpId) return;

    try {
      await matchNomination.mutateAsync({
        campaignId,
        nominationId,
        hcpId: selectedHcpId,
        addAlias,
      });
      onClose();
    } catch (error) {
      console.error('Failed to match:', error);
    }
  };

  const handleExclude = async () => {
    try {
      await excludeNomination.mutateAsync({ campaignId, nominationId });
      onClose();
    } catch (error) {
      console.error('Failed to exclude:', error);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Match Nomination</DialogTitle>
          <DialogDescription>
            "{nomination?.rawNameEntered}" - nominated by{' '}
            {nomination?.nominatorHcp.firstName} {nomination?.nominatorHcp.lastName}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto py-4">
          <h4 className="font-medium mb-3">Suggested Matches</h4>
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
                  onClick={() => setSelectedHcpId(suggestion.hcp.id)}
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
                    <Badge
                      variant="outline"
                      className={
                        suggestion.score >= 90
                          ? 'bg-green-50 text-green-700'
                          : suggestion.score >= 70
                            ? 'bg-yellow-50 text-yellow-700'
                            : ''
                      }
                    >
                      {suggestion.score}% match
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedHcpId && (
            <div className="flex items-center gap-2 mt-4 pt-4 border-t">
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

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleExclude}
            disabled={excludeNomination.isPending}
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
            Match
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
