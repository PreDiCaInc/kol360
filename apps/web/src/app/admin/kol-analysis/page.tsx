'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useKolAnalyses,
  useCreateKolAnalysis,
  type AnalysisCalcStatus,
} from '@/hooks/use-kol-analysis';
import { useClients } from '@/hooks/use-clients';
import { useDiseaseAreas } from '@/hooks/use-disease-areas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BarChart3, ChevronRight, Plus } from 'lucide-react';

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

export default function KolAnalysesPage() {
  const { data: analyses, isLoading } = useKolAnalyses();
  const router = useRouter();
  const createAnalysis = useCreateKolAnalysis();
  const { data: clientsData } = useClients();
  const { data: diseaseAreasData } = useDiseaseAreas();

  const [showCreate, setShowCreate] = useState(false);
  const [newClientId, setNewClientId] = useState('');
  const [newDaId, setNewDaId] = useState('');
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async () => {
    setCreateError(null);
    try {
      const res = await createAnalysis.mutateAsync({
        clientId: newClientId,
        diseaseAreaId: newDaId,
        name: newName.trim(),
      });
      setShowCreate(false);
      setNewClientId('');
      setNewDaId('');
      setNewName('');
      router.push(`/admin/kol-analysis/${res.id}`);
    } catch (e) {
      setCreateError(
        e instanceof Error ? e.message : 'Failed to create analysis (may already exist)'
      );
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold">KOL Analyses</h1>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Analysis
        </Button>
      </div>
      <p className="text-muted-foreground mb-6">
        One scoring analysis per client &amp; disease area. Curate which campaigns
        feed it (including other clients&apos; campaigns in the same disease area),
        set weights, and recalculate. Scores pool nominations across the included
        campaigns and normalize once.
      </p>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-muted-foreground">Loading…</div>
          ) : !analyses || analyses.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              No analyses yet. They are seeded per client &amp; disease area.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Analysis</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Disease Area</TableHead>
                  <TableHead className="text-right">Campaigns</TableHead>
                  <TableHead className="text-right">Scored HCPs</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analyses.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/admin/kol-analysis/${a.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {a.name}
                      </Link>
                    </TableCell>
                    <TableCell>{a.client?.name ?? '—'}</TableCell>
                    <TableCell>{a.diseaseArea?.name ?? '—'}</TableCell>
                    <TableCell className="text-right">{a._count.campaigns}</TableCell>
                    <TableCell className="text-right">{a._count.scores}</TableCell>
                    <TableCell><StatusBadge status={a.calcStatus} /></TableCell>
                    <TableCell>
                      <Link href={`/admin/kol-analysis/${a.id}`}>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New KOL Analysis</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="mb-1.5 block">Client</Label>
              <Select value={newClientId} onValueChange={setNewClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client…" />
                </SelectTrigger>
                <SelectContent>
                  {clientsData?.items.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.isLite ? ' (Lite)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Disease Area</Label>
              <Select value={newDaId} onValueChange={setNewDaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select disease area…" />
                </SelectTrigger>
                <SelectContent>
                  {diseaseAreasData?.items.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="an-name" className="mb-1.5 block">Name</Label>
              <Input
                id="an-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Dry Eye — Lite Client"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Create the analysis, then add campaigns (including other clients&apos;
              campaigns in this disease area) from the detail page.
            </p>
            {createError && (
              <p className="text-sm text-red-600">{createError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                !newClientId ||
                !newDaId ||
                newName.trim().length === 0 ||
                createAnalysis.isPending
              }
            >
              {createAnalysis.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
