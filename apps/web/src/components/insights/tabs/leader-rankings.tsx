'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLeaderRankings } from '@/hooks/use-insights-report';
import type { NominationType } from '@kol360/shared';

interface Props {
  diseaseAreaId: string;
}

const NOMINATION_TYPES: { value: NominationType; label: string; color: string }[] = [
  { value: 'DISCUSSION_LEADERS', label: 'Discussion Leaders', color: 'bg-blue-500' },
  { value: 'REFERRAL_LEADERS', label: 'Referral Leaders', color: 'bg-green-500' },
  { value: 'ADVICE_LEADERS', label: 'Advice Leaders', color: 'bg-purple-500' },
  { value: 'NATIONAL_LEADER', label: 'National Leaders', color: 'bg-yellow-500' },
  { value: 'RISING_STAR', label: 'Rising Stars', color: 'bg-pink-500' },
  { value: 'SOCIAL_LEADER', label: 'Social Leaders', color: 'bg-cyan-500' },
];

function RankingTable({
  diseaseAreaId,
  nominationType,
}: {
  diseaseAreaId: string;
  nominationType: NominationType;
}) {
  const { data, isLoading } = useLeaderRankings(diseaseAreaId, nominationType, {
    limit: 15,
  });

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!data?.items.length) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground">
        No data available
      </div>
    );
  }

  const maxCount = data.items[0]?.count || 1;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[50px]">#</TableHead>
          <TableHead>Leader</TableHead>
          <TableHead>Specialty</TableHead>
          <TableHead>Location</TableHead>
          <TableHead className="w-[150px]">Count</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.items.map((item) => (
          <TableRow key={item.hcpId}>
            <TableCell className="font-medium">{item.rank}</TableCell>
            <TableCell>{item.name}</TableCell>
            <TableCell>{item.specialty || '-'}</TableCell>
            <TableCell>
              {item.city && item.state ? `${item.city}, ${item.state}` : item.state || '-'}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <div
                  className="h-2 bg-primary rounded-full"
                  style={{ width: `${(item.count / maxCount) * 100}%` }}
                />
                <span className="text-sm font-mono">{item.count}</span>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function LeaderRankingsTab({ diseaseAreaId }: Props) {
  const [activeType, setActiveType] = useState<NominationType>('DISCUSSION_LEADERS');

  return (
    <div className="space-y-6">
      <Tabs value={activeType} onValueChange={(v) => setActiveType(v as NominationType)}>
        <TabsList className="grid w-full grid-cols-6">
          {NOMINATION_TYPES.map((type) => (
            <TabsTrigger key={type.value} value={type.value} className="text-xs">
              {type.label.split(' ')[0]}
            </TabsTrigger>
          ))}
        </TabsList>

        {NOMINATION_TYPES.map((type) => (
          <TabsContent key={type.value} value={type.value}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${type.color}`} />
                  {type.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RankingTable diseaseAreaId={diseaseAreaId} nominationType={type.value} />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
