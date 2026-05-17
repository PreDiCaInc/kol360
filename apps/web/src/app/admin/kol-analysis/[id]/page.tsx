'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  useKolAnalysis,
  useUpdateKolAnalysisCampaigns,
  useUpdateKolAnalysis,
  useRecalculateKolAnalysis,
  useAvailableCampaigns,
  useDedupReport,
  useExplainHcp,
  type AnalysisWeights,
  type AnalysisCalcStatus,
} from '@/hooks/use-kol-analysis';
import { useHcps } from '@/hooks/use-hcps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ArrowLeft, RefreshCw, Loader2, Plus } from 'lucide-react';

const WEIGHT_FIELDS: Array<{ key: keyof AnalysisWeights; label: string }> = [
  { key: 'weightPublications', label: 'Publications' },
  { key: 'weightClinicalTrials', label: 'Clinical Trials' },
  { key: 'weightTradePubs', label: 'Trade Publications' },
  { key: 'weightOrgLeadership', label: 'Org Leadership' },
  { key: 'weightOrgAwards', label: 'Org Awards' },
  { key: 'weightConference', label: 'Conference' },
  { key: 'weightSocialMedia', label: 'Social Media' },
  { key: 'weightMediaPodcasts', label: 'Media / Podcasts' },
  { key: 'weightSurvey', label: 'Survey (Sociometric)' },
];

function StatusBadge({ status }: { status: AnalysisCalcStatus }) {
  const map: Record<AnalysisCalcStatus, { label: string; cls: string }> = {
    idle: { label: 'Needs recalc', cls: 'bg-amber-50 text-amber-700 border-amber-300' },
    running: { label: 'Running…', cls: 'bg-blue-50 text-blue-700 border-blue-300' },
    done: { label: 'Up to date', cls: 'bg-green-50 text-green-700 border-green-300' },
    error: { label: 'Error', cls: 'bg-red-50 text-red-700 border-red-300' },
  };
  const s = map[status];
  return <Badge variant="outline" className={s.cls}>{s.label}</Badge>;
}

export default function KolAnalysisDetailPage() {
  const { id } = useParams() as { id: string };
  const { data: analysis, isLoading } = useKolAnalysis(id);
  const updateCampaigns = useUpdateKolAnalysisCampaigns();
  const updateAnalysis = useUpdateKolAnalysis();
  const recalc = useRecalculateKolAnalysis();

  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [weights, setWeights] = useState<AnalysisWeights | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addSel, setAddSel] = useState<Record<string, boolean>>({});
  const { data: available } = useAvailableCampaigns(showAdd ? id : '');

  // Score troubleshooting: search an HCP, explain their calc.
  const [explainQuery, setExplainQuery] = useState('');
  const [explainHcpId, setExplainHcpId] = useState<string | null>(null);
  const explainQ = explainQuery.trim();
  const { data: hcpSearch } = useHcps({ query: explainQ, limit: 8 });
  const { data: explain, isLoading: explainLoading } = useExplainHcp(id, explainHcpId);
  const { data: dedupItems } = useDedupReport(id);

  const handleAddCampaigns = async () => {
    const toAdd = Object.entries(addSel)
      .filter(([, v]) => v)
      .map(([campaignId]) => ({ campaignId, included: true }));
    if (toAdd.length === 0) return;
    await updateCampaigns.mutateAsync({ id, campaigns: toAdd });
    setShowAdd(false);
    setAddSel({});
  };

  useEffect(() => {
    if (analysis) {
      setIncluded(
        Object.fromEntries(analysis.campaigns.map((c) => [c.campaignId, c.included]))
      );
      setWeights(analysis.weightsJson);
    }
  }, [analysis]);

  if (isLoading || !analysis || !weights) {
    return <div className="p-6 text-muted-foreground">Loading…</div>;
  }

  const weightSum = WEIGHT_FIELDS.reduce((s, f) => s + (Number(weights[f.key]) || 0), 0);
  const weightsValid = Math.abs(weightSum - 100) < 0.01;

  const campaignsDirty = analysis.campaigns.some(
    (c) => included[c.campaignId] !== c.included
  );
  const weightsDirty = WEIGHT_FIELDS.some(
    (f) => Number(weights[f.key]) !== Number(analysis.weightsJson[f.key])
  );

  return (
    <div className="p-6">
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link href="/admin/kol-analysis">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to analyses
        </Link>
      </Button>

      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold">{analysis.name}</h1>
          <p className="text-muted-foreground mt-1">
            {analysis.client.name} · {analysis.diseaseArea.name} ·{' '}
            {analysis._count.scores} scored HCPs
          </p>
          <div className="flex items-center gap-3 mt-2">
            <StatusBadge status={analysis.calcStatus} />
            {analysis.lastCalculatedAt && (
              <span className="text-xs text-muted-foreground">
                Last recalculated {new Date(analysis.lastCalculatedAt).toLocaleString()}
              </span>
            )}
          </div>
          {analysis.calcStatus === 'error' && analysis.calcError && (
            <p className="text-sm text-red-600 mt-2">Error: {analysis.calcError}</p>
          )}
        </div>
        <Button
          onClick={() => recalc.mutate(id)}
          disabled={recalc.isPending || analysis.calcStatus === 'running'}
        >
          {recalc.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Recalculate
        </Button>
      </div>

      {(campaignsDirty || weightsDirty) && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Unsaved changes. Save, then click Recalculate to apply them to the scores.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Campaign curation */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Campaigns</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
                <Plus className="w-4 h-4 mr-1.5" />
                Add campaigns
              </Button>
            </div>
            <CardDescription>
              Toggle which campaigns feed this analysis. Excluded campaigns are
              not pooled. Save, then Recalculate.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Responses</TableHead>
                  <TableHead className="text-right">Nominations</TableHead>
                  <TableHead className="text-right">Included</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analysis.campaigns.map((c) => (
                  <TableRow key={c.campaignId}>
                    <TableCell className="font-medium">{c.campaign.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{c.campaign.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.responseCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.nominationCount}
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={included[c.campaignId] ?? c.included}
                        onCheckedChange={(v) =>
                          setIncluded((prev) => ({ ...prev, [c.campaignId]: v }))
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4 flex justify-end">
              <Button
                variant="outline"
                disabled={!campaignsDirty || updateCampaigns.isPending}
                onClick={() =>
                  updateCampaigns.mutate({
                    id,
                    campaigns: analysis.campaigns.map((c) => ({
                      campaignId: c.campaignId,
                      included: included[c.campaignId] ?? c.included,
                    })),
                  })
                }
              >
                {updateCampaigns.isPending ? 'Saving…' : 'Save campaign selection'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Weights */}
        <Card>
          <CardHeader>
            <CardTitle>Weights</CardTitle>
            <CardDescription>Composite = weighted objective + survey. Must sum to 100.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {WEIGHT_FIELDS.map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-2">
                  <Label htmlFor={f.key} className="text-sm">{f.label}</Label>
                  <Input
                    id={f.key}
                    type="number"
                    min={0}
                    max={100}
                    className="w-20 text-right"
                    value={weights[f.key]}
                    onChange={(e) =>
                      setWeights((w) => w && { ...w, [f.key]: Number(e.target.value) })
                    }
                  />
                </div>
              ))}
              <div
                className={`flex justify-between text-sm font-medium pt-2 border-t ${
                  weightsValid ? 'text-green-700' : 'text-red-600'
                }`}
              >
                <span>Total</span>
                <span>{weightSum}{weightsValid ? '' : ' (must be 100)'}</span>
              </div>
              <Button
                className="w-full"
                variant="outline"
                disabled={!weightsDirty || !weightsValid || updateAnalysis.isPending}
                onClick={() => updateAnalysis.mutate({ id, weights })}
              >
                {updateAnalysis.isPending ? 'Saving…' : 'Save weights'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Deduped respondents — survey-takers who appeared in >1 included
          campaign; only their most-recent response counts. */}
      {dedupItems && dedupItems.length > 0 && (
        <Card className="mt-6 border-amber-200">
          <CardHeader>
            <CardTitle className="text-amber-800">
              Deduped respondents ({dedupItems.length})
            </CardTitle>
            <CardDescription>
              These survey-takers responded in more than one included campaign.
              Only their most-recent response is counted; older responses
              (and their nominations) are dropped to avoid double-counting.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Respondent</TableHead>
                  <TableHead>Kept (most recent)</TableHead>
                  <TableHead>Dropped</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dedupItems.map((d) => (
                  <TableRow key={d.respondentHcpId}>
                    <TableCell className="font-medium">
                      {d.respondentName}
                      {d.respondentNpi && (
                        <span className="text-muted-foreground text-xs ml-1">
                          (NPI {d.respondentNpi})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {d.kept.campaignName}
                      <span className="text-muted-foreground">
                        {' '}· {new Date(d.kept.respondedAt).toLocaleDateString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {d.dropped.map((x) => (
                        <div key={x.campaignId} className="text-muted-foreground">
                          {x.campaignName} ·{' '}
                          {new Date(x.respondedAt).toLocaleDateString()} ·{' '}
                          {x.nominationsDropped} nom dropped
                        </div>
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Score troubleshooting — explain how a given HCP's score was derived. */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Score troubleshooting</CardTitle>
          <CardDescription>
            Search an HCP to see exactly how their score was calculated:
            per-type counts vs the pooled max, the survey mean, and the
            weighted composite — cross-checked against the stored value.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="Search HCP by name or NPI…"
              value={explainQuery}
              onChange={(e) => {
                setExplainQuery(e.target.value);
                setExplainHcpId(null);
              }}
              className="max-w-sm"
            />
          </div>

          {!explainHcpId && explainQ.length >= 2 && hcpSearch?.items && (
            <div className="border rounded-md divide-y mb-4 max-w-sm">
              {hcpSearch.items.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">No matches</div>
              ) : (
                hcpSearch.items.map((h) => (
                  <button
                    key={h.id}
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-muted/50"
                    onClick={() => setExplainHcpId(h.id)}
                  >
                    {h.firstName} {h.lastName}
                    {h.npi && (
                      <span className="text-muted-foreground text-xs ml-1">
                        (NPI {h.npi})
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          {explainHcpId && explainLoading && (
            <p className="text-sm text-muted-foreground">Computing…</p>
          )}

          {explainHcpId && explain && !explainLoading && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">
                  {explain.hcp?.name ?? 'HCP'}
                  {explain.hcp?.npi && (
                    <span className="text-muted-foreground text-sm ml-2">
                      NPI {explain.hcp.npi}
                    </span>
                  )}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setExplainHcpId(null);
                    setExplainQuery('');
                  }}
                >
                  Clear
                </Button>
              </div>

              {!explain.found ? (
                <p className="text-sm text-amber-700">
                  {explain.reason || 'No score for this HCP in this analysis.'}
                </p>
              ) : (
                <>
                  {explain.inSyncWithStored === false && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      Recomputed composite differs from the stored value —
                      the analysis likely needs a Recalculate.
                    </div>
                  )}

                  <div>
                    <h4 className="font-medium mb-2 text-sm">
                      Survey score — per nomination type
                    </h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Count</TableHead>
                          <TableHead className="text-right">Pooled max</TableHead>
                          <TableHead>Formula</TableHead>
                          <TableHead className="text-right">Score</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {explain.survey!.perType.map((p) => (
                          <TableRow key={p.nominationType}>
                            <TableCell>{p.nominationType}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {p.count}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {p.pooledMax}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {p.formula}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {p.score == null ? '—' : p.score.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <p className="text-sm text-muted-foreground mt-2">
                      Survey = mean of present type scores ={' '}
                      <strong>
                        {explain.survey!.scoreSurvey == null
                          ? '—'
                          : explain.survey!.scoreSurvey.toFixed(2)}
                      </strong>{' '}
                      · total nominations {explain.survey!.nominationCount}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2 text-sm">
                      Composite — weighted objective + survey
                    </h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Component</TableHead>
                          <TableHead className="text-right">Value</TableHead>
                          <TableHead className="text-right">Weight %</TableHead>
                          <TableHead className="text-right">Contribution</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {explain.composite!.objective.map((o) => (
                          <TableRow key={o.field}>
                            <TableCell>
                              {o.field.replace('score', '')}
                              {!o.hasData && (
                                <span className="text-muted-foreground text-xs ml-1">
                                  (no data → 0)
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {o.value.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {o.weight}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {o.contribution.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableCell>Survey</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {explain.survey!.scoreSurvey == null
                              ? '—'
                              : explain.survey!.scoreSurvey.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {explain.composite!.surveyWeight}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {explain.composite!.surveyContribution.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                    <div className="flex justify-between text-sm mt-2 pt-2 border-t">
                      <span className="font-medium">Composite (recomputed)</span>
                      <span className="font-semibold tabular-nums">
                        {explain.composite!.computed.toFixed(2)}
                      </span>
                    </div>
                    {explain.stored && (
                      <div className="flex justify-between text-sm text-muted-foreground mt-1">
                        <span>
                          Stored (last recalc{' '}
                          {new Date(explain.stored.calculatedAt).toLocaleDateString()})
                        </span>
                        <span className="tabular-nums">
                          {explain.stored.compositeScore == null
                            ? '—'
                            : explain.stored.compositeScore.toFixed(2)}
                          {explain.inSyncWithStored ? ' ✓' : ' ⚠'}
                        </span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add campaigns to this analysis</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Campaigns in <strong>{analysis.diseaseArea.name}</strong> not yet linked.
            Other clients&apos; campaigns are marked — including them shares that
            data into this analysis.
          </p>
          <div className="max-h-80 overflow-auto border rounded-md divide-y mt-2">
            {!available || available.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                No more campaigns available in this disease area.
              </div>
            ) : (
              available.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={!!addSel[c.id]}
                    onChange={(e) =>
                      setAddSel((p) => ({ ...p, [c.id]: e.target.checked }))
                    }
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.clientName} · {c.status} · {c.responseCount} responses ·{' '}
                      {c.nominationCount} nominations
                    </div>
                  </div>
                  {c.crossClient && (
                    <Badge
                      variant="outline"
                      className="bg-purple-50 text-purple-700 border-purple-300 shrink-0"
                    >
                      from {c.clientName}
                    </Badge>
                  )}
                </label>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddCampaigns}
              disabled={
                Object.values(addSel).every((v) => !v) || updateCampaigns.isPending
              }
            >
              {updateCampaigns.isPending ? 'Adding…' : 'Add selected'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
