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
  type AnalysisWeights,
  type AnalysisCalcStatus,
} from '@/hooks/use-kol-analyses';
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
        <Link href="/admin/kol-analyses">
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
                      {c.clientName} · {c.status}
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
