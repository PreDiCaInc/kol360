'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useHcp, useAddHcpAlias, useRemoveHcpAlias, useUpdateHcp } from '@/hooks/use-hcps';
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
} from 'lucide-react';

// Score field labels for display
const SCORE_FIELDS = [
  { key: 'scorePublications', label: 'Publications' },
  { key: 'scoreClinicalTrials', label: 'Clinical Trials' },
  { key: 'scoreTradePubs', label: 'Trade Publications' },
  { key: 'scoreOrgLeadership', label: 'Org Leadership' },
  { key: 'scoreOrgAwareness', label: 'Org Awareness' },
  { key: 'scoreConference', label: 'Conference' },
  { key: 'scoreSocialMedia', label: 'Social Media' },
  { key: 'scoreMediaPodcasts', label: 'Media/Podcasts' },
] as const;

export default function HcpDetailPage() {
  const params = useParams();
  const router = useRouter();
  const hcpId = params.id as string;

  const { data: hcp, isLoading } = useHcp(hcpId);
  const addAlias = useAddHcpAlias();
  const removeAlias = useRemoveHcpAlias();

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [newAliasName, setNewAliasName] = useState('');
  const [aliasToDelete, setAliasToDelete] = useState<{ id: string; name: string } | null>(null);

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

  if (isLoading) {
    return (
      <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
        <div className="p-6">Loading...</div>
      </RequireAuth>
    );
  }

  if (!hcp) {
    return (
      <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
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
    <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
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
            <p className="text-muted-foreground font-mono">NPI: {hcp.npi}</p>
          </div>
          <Button variant="outline" onClick={() => setShowEditDialog(true)}>
            <Pencil className="w-4 h-4 mr-2" />
            Edit
          </Button>
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
                        <p className="font-medium font-mono">{hcp.npi}</p>
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
      </div>
    </RequireAuth>
  );
}
