'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useCampaignScores,
  useCalculateSurveyScores,
} from '@/hooks/use-campaign-scores';
import { useNominationStats } from '@/hooks/use-nominations';
import { useCampaign, usePublishCampaign } from '@/hooks/use-campaigns';
import { RequireAuth } from '@/components/auth/require-auth';
import { Button } from '@/components/ui/button';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
  ArrowLeft,
  Calculator,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  Award,
  ChevronRight,
  LayoutDashboard,
} from 'lucide-react';

// Nomination type labels for display
const NOMINATION_TYPE_LABELS: Record<string, string> = {
  NATIONAL_KOL: 'National KOL',
  RISING_STAR: 'Rising Star',
  REGIONAL_EXPERT: 'Regional Expert',
  DIGITAL_INFLUENCER: 'Digital Influencer',
  CLINICAL_EXPERT: 'Clinical Expert',
};

// Field name mapping for accessing score data
const NOMINATION_TYPE_FIELDS: Record<string, { score: string; count: string }> = {
  NATIONAL_KOL: { score: 'scoreNationalKol', count: 'countNationalKol' },
  RISING_STAR: { score: 'scoreRisingStar', count: 'countRisingStar' },
  REGIONAL_EXPERT: { score: 'scoreRegionalExpert', count: 'countRegionalExpert' },
  DIGITAL_INFLUENCER: { score: 'scoreDigitalInfluencer', count: 'countDigitalInfluencer' },
  CLINICAL_EXPERT: { score: 'scoreClinicalExpert', count: 'countClinicalExpert' },
};

export default function CampaignScoresPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;

  const [showCalculateResult, setShowCalculateResult] = useState<{
    processed: number;
    updated: number;
  } | null>(null);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);

  const { data: campaign } = useCampaign(campaignId);
  const { data: scores, isLoading } = useCampaignScores(campaignId);
  const { data: nominationStats } = useNominationStats(campaignId);

  const calculateSurveyScores = useCalculateSurveyScores();
  const publishCampaign = usePublishCampaign();

  const handleCalculateScores = async () => {
    try {
      const result = await calculateSurveyScores.mutateAsync(campaignId);
      setShowCalculateResult(result);
    } catch (error) {
      console.error('Score calculation failed:', error);
    }
  };

  const handlePublish = async () => {
    try {
      await publishCampaign.mutateAsync(campaignId);
      setShowPublishConfirm(false);
      router.push(`/admin/campaigns/${campaignId}/dashboard`);
    } catch (error) {
      console.error('Publish failed:', error);
    }
  };

  // Calculate summary stats from nomination stats
  const totalNominations = nominationStats
    ? Object.values(nominationStats).reduce((a, b) => a + (b || 0), 0)
    : 0;
  const matchedCount =
    (nominationStats?.MATCHED || 0) + (nominationStats?.NEW_HCP || 0);
  const unmatchedCount = nominationStats?.UNMATCHED || 0;
  const reviewNeededCount = nominationStats?.REVIEW_NEEDED || 0;

  const canCalculate = matchedCount > 0;
  const hasUnmatchedWarning = unmatchedCount > 0 || reviewNeededCount > 0;
  const hasExistingScores = scores && scores.items.length > 0;

  return (
    <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
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
              <h1 className="text-2xl font-bold">Survey Scores</h1>
              {campaign && (
                <p className="text-muted-foreground">{campaign.name}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleCalculateScores}
              disabled={calculateSurveyScores.isPending || !canCalculate}
              variant={hasExistingScores ? 'outline' : 'default'}
            >
              {calculateSurveyScores.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Calculator className="w-4 h-4 mr-2" />
              )}
              {hasExistingScores ? 'Recalculate Scores' : 'Calculate Survey Scores'}
            </Button>
            {hasExistingScores && campaign?.status === 'CLOSED' && (
              <Button onClick={() => setShowPublishConfirm(true)}>
                Publish Results
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
            {campaign?.status === 'PUBLISHED' && (
              <Button onClick={() => router.push(`/admin/campaigns/${campaignId}/dashboard`)} variant="outline">
                <LayoutDashboard className="w-4 h-4 mr-2" />
                View Dashboard
              </Button>
            )}
          </div>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Nominations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalNominations}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Matched
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-green-600">
                  {matchedCount}
                </span>
                {totalNominations > 0 && (
                  <Badge variant="secondary">
                    {Math.round((matchedCount / totalNominations) * 100)}%
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Review
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-orange-600">
                  {unmatchedCount + reviewNeededCount}
                </span>
                {hasUnmatchedWarning && (
                  <AlertTriangle className="w-4 h-4 text-orange-500" />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                HCPs with Scores
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{scores?.total || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Warning Banner */}
        {hasUnmatchedWarning && (
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-orange-800">
                  Some nominations need attention
                </p>
                <p className="text-sm text-orange-700">
                  {unmatchedCount > 0 && (
                    <span>{unmatchedCount} unmatched. </span>
                  )}
                  {reviewNeededCount > 0 && (
                    <span>{reviewNeededCount} need review. </span>
                  )}
                  <Link
                    href={`/admin/campaigns/${campaignId}/nominations`}
                    className="underline hover:no-underline"
                  >
                    Go to Nominations
                  </Link>{' '}
                  to resolve before calculating final scores.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Scores Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Survey Score Rankings
                </CardTitle>
                <CardDescription>
                  HCPs ranked by survey score based on nomination counts.
                  Score formula: (nominations / max nominations) x 100
                </CardDescription>
              </div>
              {scores && scores.maxNominations > 0 && (
                <Badge variant="outline" className="text-sm">
                  Max nominations: {scores.maxNominations}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : !scores || scores.items.length === 0 ? (
              <div className="text-center py-12">
                <Award className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No scores calculated yet</h3>
                <p className="text-muted-foreground mb-4">
                  Click &quot;Calculate Survey Scores&quot; to generate scores from matched nominations.
                </p>
                {!canCalculate && (
                  <p className="text-sm text-orange-600">
                    You need at least one matched nomination to calculate scores.
                  </p>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Rank</TableHead>
                    <TableHead>HCP</TableHead>
                    <TableHead>NPI</TableHead>
                    <TableHead>Specialty</TableHead>
                    {/* Dynamic columns for each nomination type */}
                    {scores.nominationTypes && scores.nominationTypes.length > 0 ? (
                      scores.nominationTypes.map((type) => (
                        <TableHead key={type} className="text-center">
                          <div className="text-xs">
                            {NOMINATION_TYPE_LABELS[type] || type}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            Count / Score
                          </div>
                        </TableHead>
                      ))
                    ) : null}
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Avg Score</TableHead>
                    <TableHead className="w-32">Score Bar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scores.items.map((score, index) => {
                    const surveyScore = score.scoreSurvey
                      ? parseFloat(score.scoreSurvey as string)
                      : 0;
                    // Type the score as Record for dynamic field access
                    const scoreData = score as Record<string, unknown>;
                    return (
                      <TableRow key={score.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {index < 3 ? (
                              <Badge
                                variant={
                                  index === 0
                                    ? 'default'
                                    : index === 1
                                    ? 'secondary'
                                    : 'outline'
                                }
                              >
                                #{index + 1}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">
                                #{index + 1}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {score.hcp.firstName} {score.hcp.lastName}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {score.hcp.npi}
                        </TableCell>
                        <TableCell>
                          {score.hcp.specialty || (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        {/* Dynamic cells for each nomination type */}
                        {scores.nominationTypes && scores.nominationTypes.length > 0 ? (
                          scores.nominationTypes.map((type) => {
                            const fields = NOMINATION_TYPE_FIELDS[type];
                            const count = fields ? (scoreData[fields.count] as number) || 0 : 0;
                            const typeScore = fields && scoreData[fields.score]
                              ? parseFloat(scoreData[fields.score] as string)
                              : null;
                            return (
                              <TableCell key={type} className="text-center">
                                {count > 0 ? (
                                  <div>
                                    <span className="font-medium">{count}</span>
                                    <span className="text-muted-foreground mx-1">/</span>
                                    <span className="text-primary font-semibold">
                                      {typeScore !== null ? typeScore.toFixed(0) : '-'}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                            );
                          })
                        ) : null}
                        <TableCell className="text-right font-medium">
                          {score.nominationCount}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-bold text-lg">
                            {surveyScore.toFixed(1)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full transition-all"
                              style={{ width: `${surveyScore}%` }}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Calculate Result Dialog */}
        <Dialog
          open={!!showCalculateResult}
          onOpenChange={() => setShowCalculateResult(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                Survey Scores Calculated
              </DialogTitle>
              <DialogDescription>
                Survey scores have been calculated based on matched nominations.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold">
                      {showCalculateResult?.processed || 0}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      HCPs processed
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold text-green-600">
                      {showCalculateResult?.updated || 0}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Scores updated
                    </p>
                  </CardContent>
                </Card>
              </div>
              <p className="text-sm text-muted-foreground">
                The survey score is calculated as: (nomination count / max
                nominations) x 100. HCPs with the most nominations receive a
                score of 100.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => setShowCalculateResult(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Publish Confirmation Dialog */}
        <AlertDialog open={showPublishConfirm} onOpenChange={setShowPublishConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Publish Results</AlertDialogTitle>
              <AlertDialogDescription>
                This will publish the KOL scores and make them final. This action cannot be undone.
                Are you sure you want to proceed?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handlePublish}
                disabled={publishCampaign.isPending}
              >
                {publishCampaign.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Publish Results
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </RequireAuth>
  );
}
