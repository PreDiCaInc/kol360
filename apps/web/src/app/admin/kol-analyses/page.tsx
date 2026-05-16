'use client';

import Link from 'next/link';
import { useKolAnalyses, type AnalysisCalcStatus } from '@/hooks/use-kol-analyses';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BarChart3, ChevronRight } from 'lucide-react';

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

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-2">
        <BarChart3 className="w-6 h-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold">KOL Analyses</h1>
      </div>
      <p className="text-muted-foreground mb-6">
        One scoring analysis per client &amp; disease area. Curate which campaigns
        feed it, set weights, and recalculate. Scores pool nominations across the
        included campaigns and normalize once.
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
                        href={`/admin/kol-analyses/${a.id}`}
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
                      <Link href={`/admin/kol-analyses/${a.id}`}>
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
    </div>
  );
}
