'use client';

import { useState } from 'react';
import { useLeaderRankings } from '@/hooks/use-insights-report';
import { LeaderTable } from '@/components/insights/tables/leader-table';
import type { NominationType } from '@kol360/shared';
import type { LeaderTableColumn } from '@/components/insights/tables/leader-table';

interface Props {
  diseaseAreaId: string;
  onKolSelect?: (kolId: string) => void;
  clientId?: string;
}

const NOMINATION_TYPES: {
  value: NominationType;
  label: string;
  color: string;
}[] = [
  { value: 'DISCUSSION_LEADERS', label: 'Discussion Leaders', color: 'bg-blue-500' },
  { value: 'REFERRAL_LEADERS', label: 'Referral Leaders', color: 'bg-green-500' },
  { value: 'ADVICE_LEADERS', label: 'Advice Leaders', color: 'bg-purple-500' },
  { value: 'NATIONAL_LEADER', label: 'National Leaders', color: 'bg-yellow-600' },
  { value: 'RISING_STAR', label: 'Rising Stars', color: 'bg-pink-500' },
  { value: 'SOCIAL_LEADER', label: 'Social Media Influencers', color: 'bg-cyan-500' },
];

// Tab 4 columns: Name, Specialty, Influencer Type, State, Count (no City)
const COLUMNS: LeaderTableColumn[] = ['name', 'specialty', 'influencerType', 'state', 'count'];

function SociometricPanel({
  diseaseAreaId,
  nominationType,
  label,
  color,
  onKolSelect,
  clientId,
}: {
  diseaseAreaId: string;
  nominationType: NominationType;
  label: string;
  color: string;
  onKolSelect?: (kolId: string) => void;
  clientId?: string;
}) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [sortBy, setSortBy] = useState('count');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const { data, isLoading } = useLeaderRankings(diseaseAreaId, nominationType, {
    page,
    limit,
  }, clientId);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
  };

  const rawItems = (data?.items || []).map((item) => ({
    rank: item.rank,
    name: item.name,
    hcpId: item.hcpId,
    specialty: item.specialty,
    influencerType: item.influencerType,
    state: item.state,
    count: item.count,
  }));

  // Client-side sorting (API returns sorted by count desc)
  const items = [...rawItems].sort((a, b) => {
    const field = sortBy as keyof typeof a;
    const aVal = a[field] ?? '';
    const bVal = b[field] ?? '';
    const cmp = typeof aVal === 'number' && typeof bVal === 'number'
      ? aVal - bVal
      : String(aVal).localeCompare(String(bVal));
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  // Re-assign ranks after sorting
  items.forEach((item, i) => { item.rank = (page - 1) * limit + i + 1; });

  const maxCount = items.length > 0 ? Math.max(...items.map((i) => i.count)) : 1;

  return (
    <LeaderTable
      title={label}
      titleColor={color}
      items={items}
      columns={COLUMNS}
      total={data?.total || 0}
      page={page}
      limit={limit}
      totalPages={data?.totalPages || 1}
      isLoading={isLoading}
      onPageChange={setPage}
      onLimitChange={handleLimitChange}
      onSort={handleSort}
      sortBy={sortBy}
      sortOrder={sortOrder}
      onKolClick={(hcpId) => {
        if (onKolSelect) onKolSelect(hcpId);
        else console.log('KOL clicked:', hcpId);
      }}
      maxCount={maxCount}
    />
  );
}

export function SociometricTablesTab({ diseaseAreaId, onKolSelect, clientId }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Sociometric Tables</h2>
        <p className="text-sm text-muted-foreground">
          Per-category leader tables with influencer type classification
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {NOMINATION_TYPES.map((type) => (
          <SociometricPanel
            key={type.value}
            diseaseAreaId={diseaseAreaId}
            nominationType={type.value}
            label={type.label}
            color={type.color}
            onKolSelect={onKolSelect}
            clientId={clientId}
          />
        ))}
      </div>
    </div>
  );
}
