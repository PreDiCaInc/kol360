'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useHcp, useAddHcpAlias, useRemoveHcpAlias, useUpdateHcp } from '@/hooks/use-hcps';
import { useOptOutHcp, useResubscribeHcp } from '@/hooks/use-distribution';
import { useAuth } from '@/lib/auth/auth-provider';
import { useImpersonation } from '@/lib/impersonation-context';
import { RequireAuth } from '@/components/auth/require-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { HcpFormDialog } from '@/components/hcps/hcp-form-dialog';
import {
  ArrowLeft,
  Pencil,
  Plus,
  X,
  User,
  Mail,
  MapPin,
  Stethoscope,
  Calendar,
  Hash,
  BarChart3,
  TrendingUp,
  Ban,
} from 'lucide-react';

// Score field labels for display
const SCORE_FIELDS = [
  { key: 'scorePublications', label: 'Publications' },
  { key: 'scoreClinicalTrials', label: 'Clinical Trials' },
  { key: 'scoreTradePubs', label: 'Trade Publications' },
  { key: 'scoreOrgLeadership', label: 'Org Leadership' },
  { key: 'scoreOrgAwards', label: 'Org Awards' },
  { key: 'scoreConference', label: 'Conference' },
  { key: 'scoreSocialMedia', label: 'Social Media' },
  { key: 'scoreMediaPodcasts', label: 'Media/Podcasts' },
] as const;

export default function HcpDetailPage() {
  const { isImpersonating } = useImpersonation();
  const canEdit = !isImpersonating;
  const { user } = useAuth();
  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN';
  const params = useParams();
  const router = useRouter();
  const hcpId = params.id as string;

  const { data: hcp, isLoading } = useHcp(hcpId);
  const addAlias = useAddHcpAlias();
  const removeAlias = useRemoveHcpAlias();
  const optOutMutation = useOptOutHcp();
  const resubscribeMutation = useResubscribeHcp();

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [newAliasName, setNewAliasName] = useState('');
  const [aliasToDelete, setAliasToDelete] = useState<{ id: string; name: string } | null>(null);

  // Opt Out / Resubscribe state
  const [showOptOutDialog, setShowOptOutDialog] = useState(false);
  const [optOutScope, setOptOutScope] = useState<'CAMPAIGN' | 'GLOBAL'>('GLOBAL');
  const [optOutCampaignId, setOptOutCampaignId] = useState<string>('');
  const [optOutReason, setOptOutReason] = useState('');
  const [resubscribeTarget, setResubscribeTarget] = useState<{ id: string; label: string } | null>(null);
  const [resubscribeReason, setResubscribeReason] = useState('');

  const handleAddAlias = async () => {
    if (!newAliasName.trim()) return;
    try {
      await addAlias.mutateAsync({ hcpId, aliasName: newAliasName.trim() });
      setNewAliasName('');
    } catch (error) {
      console.error('Failed to add alias:', error);
    }
  };

  const handleRemoveAlias = async () => {
    if (!aliasToDelete) return;
    try {
      await removeAlias.mutateAsync({ hcpId, aliasId: aliasToDelete.id });
      setAliasToDelete(null);
    } catch (error) {
      console.error('Failed to remove alias:', error);
    }
  };

  const openOptOut = () => {
    setOptOutScope('GLOBAL');
    setOptOutCampaignId('');
    setOptOutReason('');
    setShowOptOutDialog(true);
  };

  const closeOptOut = () => {
    setShowOptOutDialog(false);
    setOptOutReason('');
  };

  const submitOptOut = async () => {
    if (optOutReason.trim().length < 10) return;
    if (optOutScope === 'CAMPAIGN' && !optOutCampaignId) return;
    try {
      await optOutMutation.mutateAsync({
        hcpId,
        scope: optOutScope,
        campaignId: optOutScope === 'CAMPAIGN' ? optOutCampaignId : undefined,
        reason: optOutReason.trim(),
      });
      closeOptOut();
    } catch (e) {
      console.error('Opt out failed', e);
    }
  };

  const openResubscribe = (id: string, label: string) => {
    setResubscribeTarget({ id, label });
    setResubscribeReason('');
  };

  const closeResubscribe = () => {
    setResubscribeTarget(null);
    setResubscribeReason('');
  };

  const submitResubscribe = async () => {
    if (!resubscribeTarget) return;
    try {
      await resubscribeMutation.mutateAsync({
        optOutId: resubscribeTarget.id,
        reason: resubscribeReason.trim() || undefined,
      });
      closeResubscribe();
    } catch (e) {
      console.error('Resubscribe failed', e);
    }
  };

  if (isLoading) {
    return (
      <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN', 'TEAM_MEMBER']}>
        <div className="p-6">Loading...</div>
      </RequireAuth>
    );
  }

  if (!hcp) {
    return (
      <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN', 'TEAM_MEMBER']}>
        <div className="p-6">
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold">HCP not found</h2>
            <p className="text-muted-foreground mt-2">
              The requested HCP could not be found.
            </p>
            <Button className="mt-4" onClick={() => router.push('/admin/hcps')}>
              Back to HCPs
            </Button>
          </div>
        </div>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN', 'TEAM_MEMBER']}>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/hcps">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Link>
          </Button>
        </div>

        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold">
              {hcp.firstName} {hcp.lastName}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-muted-foreground font-mono text-sm">BE ID: {hcp.beId}</span>
              <span className="text-muted-foreground">|</span>
              <span className="text-muted-foreground font-mono text-sm">NPI: {hcp.npi || "N/A"}</span>
              {hcp.isSurveyTaker && (
                <Badge variant="default" className="ml-2">Survey Taker</Badge>
              )}
              {hcp.isNominated && (
                <Badge variant="secondary" className="ml-1">Nominated</Badge>
              )}
            </div>
          </div>
          {canEdit && (
            <Button variant="outline" onClick={() => setShowEditDialog(true)}>
              <Pencil className="w-4 h-4 mr-2" />
              Edit
            </Button>
          )}
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList>
            <TabsTrigger value="profile">
              <User className="w-4 h-4 mr-2" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="scores">
              <BarChart3 className="w-4 h-4 mr-2" />
              Scores
            </TabsTrigger>
            <TabsTrigger value="campaigns">
              <TrendingUp className="w-4 h-4 mr-2" />
              Campaigns
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile">
            {/* Opt-Out Status Alert */}
            {hcp.optOuts && hcp.optOuts.length > 0 ? (
              <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Ban className="h-4 w-4 text-red-600" />
                    <h4 className="font-medium text-red-800">Opted Out of Communications</h4>
                  </div>
                  {isPlatformAdmin && canEdit && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={openOptOut}
                      className="border-red-300 text-red-700 hover:bg-red-100"
                    >
                      <Ban className="w-3.5 h-3.5 mr-1.5" />
                      Add Opt Out
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  {hcp.optOuts.map((optOut) => {
                    const label = optOut.scope === 'GLOBAL'
                      ? 'All communications'
                      : `Campaign: ${optOut.campaign?.name || 'Unknown'}`;
                    return (
                      <div key={optOut.id} className="flex items-start justify-between gap-2 text-sm">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-red-700">{label}</span>
                          <span className="text-red-600/70 ml-2">
                            — {new Date(optOut.optedOutAt).toLocaleDateString()}
                            {optOut.optedOutVia && ` via ${optOut.optedOutVia}`}
                          </span>
                          {optOut.reason && (
                            <span className="block text-red-600/70">Reason: {optOut.reason}</span>
                          )}
                        </div>
                        {isPlatformAdmin && canEdit && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openResubscribe(optOut.id, label)}
                            className="shrink-0"
                          >
                            Resubscribe
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              isPlatformAdmin && canEdit && (
                <div className="mb-6 flex justify-end">
                  <Button variant="outline" onClick={openOptOut}>
                    <Ban className="w-4 h-4 mr-2" />
                    Opt Out HCP
                  </Button>
                </div>
              )
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Profile Information */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Profile Information</CardTitle>
                  <CardDescription>Basic HCP details and contact information</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="flex items-start gap-3">
                      <User className="w-5 h-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">Full Name</p>
                        <p className="font-medium">
                          {hcp.firstName} {hcp.lastName}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Hash className="w-5 h-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">NPI</p>
                        <p className="font-medium font-mono">{hcp.npi || "N/A"}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Mail className="w-5 h-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">Email</p>
                        <p className="font-medium">{hcp.email || '—'}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Stethoscope className="w-5 h-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">Specialty</p>
                        <p className="font-medium">
                          {hcp.specialty || '—'}
                          {hcp.subSpecialty && (
                            <span className="text-muted-foreground"> / {hcp.subSpecialty}</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">Location</p>
                        <p className="font-medium">
                          {hcp.city && hcp.state
                            ? `${hcp.city}, ${hcp.state}`
                            : hcp.state || hcp.city || '—'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">Years in Practice</p>
                        <p className="font-medium">
                          {hcp.yearsInPractice ? `${hcp.yearsInPractice} years` : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Alias Management */}
              <Card>
                <CardHeader>
                  <CardTitle>Aliases</CardTitle>
                  <CardDescription>Alternative names for matching</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Add new alias */}
                    {canEdit && (
                      <div className="flex gap-2">
                        <Input
                          placeholder="Add alias..."
                          value={newAliasName}
                          onChange={(e) => setNewAliasName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddAlias();
                          }}
                        />
                        <Button
                          size="icon"
                          onClick={handleAddAlias}
                          disabled={!newAliasName.trim() || addAlias.isPending}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    )}

                    {/* Alias list */}
                    <div className="space-y-2">
                      {hcp.aliases.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No aliases defined
                        </p>
                      ) : (
                        hcp.aliases.map((alias) => (
                          <div
                            key={alias.id}
                            className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2"
                          >
                            <span className="text-sm">{alias.aliasName}</span>
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() =>
                                  setAliasToDelete({ id: alias.id, name: alias.aliasName })
                                }
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Scores Tab */}
          <TabsContent value="scores">
            <div className="space-y-6">
              {/* Disease Area Scores - 8 Segments */}
              <Card>
                <CardHeader>
                  <CardTitle>Objective Scores by Disease Area</CardTitle>
                  <CardDescription>8 segment scores based on external data sources</CardDescription>
                </CardHeader>
                <CardContent>
                  {hcp.diseaseAreaScores && hcp.diseaseAreaScores.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="sticky left-0 bg-background">Disease Area</TableHead>
                            {SCORE_FIELDS.map((field) => (
                              <TableHead key={field.key} className="text-right whitespace-nowrap">
                                {field.label}
                              </TableHead>
                            ))}
                            <TableHead className="text-right">Survey</TableHead>
                            <TableHead className="text-right">Composite</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {hcp.diseaseAreaScores.map((score) => {
                            const scoreData = score as unknown as Record<string, unknown>;
                            return (
                              <TableRow key={score.id}>
                                <TableCell className="font-medium sticky left-0 bg-background">
                                  {score.diseaseArea?.name || 'Unknown'}
                                </TableCell>
                                {SCORE_FIELDS.map((field) => (
                                  <TableCell key={field.key} className="text-right">
                                    {scoreData[field.key] != null
                                      ? Number(scoreData[field.key]).toFixed(1)
                                      : '—'}
                                  </TableCell>
                                ))}
                                <TableCell className="text-right">
                                  <Badge variant="outline">
                                    {scoreData.scoreSurvey != null
                                      ? Number(scoreData.scoreSurvey).toFixed(1)
                                      : '—'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Badge variant="secondary">
                                    {scoreData.compositeScore != null
                                      ? Number(scoreData.compositeScore).toFixed(1)
                                      : '—'}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No disease area scores available
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Campaign Scores - Sociometric */}
              <Card>
                <CardHeader>
                  <CardTitle>Campaign Survey Scores</CardTitle>
                  <CardDescription>Sociometric scores from peer nominations</CardDescription>
                </CardHeader>
                <CardContent>
                  {hcp.campaignScores && hcp.campaignScores.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Campaign</TableHead>
                          <TableHead className="text-right">Nominations</TableHead>
                          <TableHead className="text-right">Survey Score</TableHead>
                          <TableHead className="text-right">Composite Score</TableHead>
                          <TableHead className="text-right">Calculated</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {hcp.campaignScores.map((score) => {
                          const scoreData = score as unknown as Record<string, unknown>;
                          return (
                            <TableRow key={score.id}>
                              <TableCell className="font-medium">
                                {score.campaign?.name || 'Unknown'}
                              </TableCell>
                              <TableCell className="text-right">
                                {scoreData.nominationCount != null ? String(scoreData.nominationCount) : '—'}
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge variant="outline">
                                  {scoreData.scoreSurvey != null
                                    ? Number(scoreData.scoreSurvey).toFixed(1)
                                    : '—'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge variant="secondary">
                                  {scoreData.compositeScore != null
                                    ? Number(scoreData.compositeScore).toFixed(1)
                                    : '—'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right text-sm text-muted-foreground">
                                {scoreData.calculatedAt
                                  ? new Date(scoreData.calculatedAt as string).toLocaleDateString()
                                  : '—'}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No campaign scores available
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Score History */}
              {hcp.diseaseAreaScores && hcp.diseaseAreaScores.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Score Summary</CardTitle>
                    <CardDescription>Aggregated metrics across disease areas</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-4 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Disease Areas</p>
                        <p className="text-2xl font-bold">{hcp.diseaseAreaScores.length}</p>
                      </div>
                      <div className="p-4 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Campaigns</p>
                        <p className="text-2xl font-bold">{hcp.campaignScores?.length || 0}</p>
                      </div>
                      <div className="p-4 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Total Nominations</p>
                        <p className="text-2xl font-bold">
                          {hcp.diseaseAreaScores.reduce((sum, s) => {
                            const data = s as unknown as { totalNominationCount?: number };
                            return sum + (data.totalNominationCount || 0);
                          }, 0)}
                        </p>
                      </div>
                      <div className="p-4 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Avg Composite</p>
                        <p className="text-2xl font-bold">
                          {(() => {
                            const scores = hcp.diseaseAreaScores
                              .map((s) => {
                                const data = s as unknown as { compositeScore?: number };
                                return data.compositeScore;
                              })
                              .filter((s) => s != null) as number[];
                            return scores.length > 0
                              ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
                              : '—';
                          })()}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Campaigns Tab */}
          <TabsContent value="campaigns">
            <Card>
              <CardHeader>
                <CardTitle>Campaign History</CardTitle>
                <CardDescription>All campaigns this HCP has participated in</CardDescription>
              </CardHeader>
              <CardContent>
                {hcp.campaignHcps && hcp.campaignHcps.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {hcp.campaignHcps.map((ch) => {
                        const campaignScore = hcp.campaignScores?.find(
                          (cs) => cs.campaign?.id === ch.campaign.id
                        );
                        const scoreData = campaignScore as unknown as { compositeScore?: number } | undefined;
                        return (
                          <TableRow key={ch.campaign.id}>
                            <TableCell className="font-medium">
                              <Link
                                href={`/admin/campaigns/${ch.campaign.id}`}
                                className="text-blue-600 hover:underline"
                              >
                                {ch.campaign.name}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  ch.campaign.status === 'ACTIVE'
                                    ? 'default'
                                    : ch.campaign.status === 'COMPLETED' || ch.campaign.status === 'PUBLISHED'
                                    ? 'secondary'
                                    : 'outline'
                                }
                              >
                                {ch.campaign.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {scoreData?.compositeScore != null ? (
                                <Badge variant="secondary">
                                  {Number(scoreData.compositeScore).toFixed(1)}
                                </Badge>
                              ) : (
                                '—'
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No campaign history
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Edit Dialog */}
        <HcpFormDialog
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          hcpId={hcpId}
        />

        {/* Delete Alias Confirmation */}
        <AlertDialog open={!!aliasToDelete} onOpenChange={() => setAliasToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Alias</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove the alias &quot;{aliasToDelete?.name}&quot;? This
                action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRemoveAlias}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Opt Out dialog */}
        <AlertDialog open={showOptOutDialog} onOpenChange={(open) => !open && closeOptOut()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Opt out HCP from emails</AlertDialogTitle>
              <AlertDialogDescription>
                This will stop emails to <strong>{hcp.firstName} {hcp.lastName}</strong>
                {hcp.email ? <> ({hcp.email})</> : null}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-sm font-medium mb-2 block">Scope</Label>
                <div className="space-y-2">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="hcp-opt-out-scope"
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
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="hcp-opt-out-scope"
                      value="CAMPAIGN"
                      checked={optOutScope === 'CAMPAIGN'}
                      onChange={() => setOptOutScope('CAMPAIGN')}
                      className="mt-0.5"
                      disabled={!hcp.campaignHcps || hcp.campaignHcps.length === 0}
                    />
                    <div className="text-sm">
                      <div className="font-medium">Specific campaign only</div>
                      <div className="text-xs text-muted-foreground">
                        {hcp.campaignHcps && hcp.campaignHcps.length > 0
                          ? 'HCP will not receive emails for the selected campaign'
                          : 'No campaigns assigned'}
                      </div>
                    </div>
                  </label>
                </div>
                {optOutScope === 'CAMPAIGN' && hcp.campaignHcps && hcp.campaignHcps.length > 0 && (
                  <div className="mt-2 ml-6">
                    <select
                      value={optOutCampaignId}
                      onChange={(e) => setOptOutCampaignId(e.target.value)}
                      className="w-full text-sm border rounded-md px-2 py-1.5"
                    >
                      <option value="">Select a campaign...</option>
                      {hcp.campaignHcps.map((ch) => (
                        <option key={ch.campaign.id} value={ch.campaign.id}>
                          {ch.campaign.name} ({ch.campaign.status})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="hcp-opt-out-reason" className="text-sm font-medium">
                  Reason <span className="text-red-600">*</span>
                </Label>
                <Textarea
                  id="hcp-opt-out-reason"
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
                disabled={
                  optOutReason.trim().length < 10 ||
                  (optOutScope === 'CAMPAIGN' && !optOutCampaignId) ||
                  optOutMutation.isPending
                }
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
                    This will reverse the opt-out for <strong>{hcp.firstName} {hcp.lastName}</strong>
                    {hcp.email ? <> ({hcp.email})</> : null}.
                    Scope: <strong>{resubscribeTarget.label}</strong>.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-2">
              <Label htmlFor="hcp-resubscribe-reason" className="text-sm font-medium">
                Reason <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Textarea
                id="hcp-resubscribe-reason"
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
