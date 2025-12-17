'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTopKols } from '@/hooks/use-dashboards';

interface TopKolsTableProps {
  campaignId: string;
  limit?: number;
}

export function TopKolsTable({ campaignId, limit = 10 }: TopKolsTableProps) {
  const { data: kols, isLoading } = useTopKols(campaignId, limit);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top KOLs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 animate-pulse bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top KOLs</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Specialty</TableHead>
              <TableHead>State</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="text-right">Nominations</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {kols?.map((kol, index) => (
              <TableRow key={kol.id}>
                <TableCell className="font-medium">{index + 1}</TableCell>
                <TableCell>
                  {kol.firstName} {kol.lastName}
                </TableCell>
                <TableCell>{kol.specialty || '-'}</TableCell>
                <TableCell>{kol.state || '-'}</TableCell>
                <TableCell className="text-right">
                  {kol.compositeScore?.toFixed(1) ?? '-'}
                </TableCell>
                <TableCell className="text-right">{kol.nominationCount}</TableCell>
              </TableRow>
            ))}
            {(!kols || kols.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No KOL scores available yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
