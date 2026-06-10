'use client';

import { useState } from 'react';
import { useLeaderRankings } from '@/hooks/use-insights-report';
import { LeaderTable } from '@/components/insights/tables/leader-table';
import type { LeaderTableItem } from '@/components/insights/tables/leader-table';
import { apiClient } from '@/lib/api';
import type { LeaderRankingsResponse } from '@kol360/shared';
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
  { value: 'NATIONAL_LEADER', label: 'National Leaders', color: 'bg-yellow-600' },
  { value: 'DISCUSSION_LEADERS', label: 'Discussion Leaders', color: 'bg-blue-500' },
  { value: 'ADVICE_LEADERS', label: 'Advice Leaders', color: 'bg-purple-500' },
  { value: 'RISING_STAR', label: 'Rising Stars', color: 'bg-pink-500' },
  { value: 'REFERRAL_LEADERS', label: 'Referral Leaders', color: 'bg-green-500' },
  { value: 'SOCIAL_LEADER', label: 'Social Media Leaders', color: 'bg-cyan-500' },
  { value: 'BIASED_LEADER', label: 'Biased Leaders', color: 'bg-red-500' },
];

// Tab 4 columns: Name, Total (=count), Specialty, Influencer Type, State.
// 2026-06-02 Group D: Total moved from last to first data column (pteam
// + customer feedback — most important number, was being scrolled off on
// narrower viewports). Default sort is already 'count' DESC (panel state).
// v1.17.27: Count back to the LAST column to match the Benchmarking
// LeaderTable convention. Descriptors first, count block last; with
// only one count column the count IS the block, so it lands at the end.
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

  // v1.17.32: export the FULL list by re-fetching with limit=5000.
  // Same client/clientId scope as the visible query; the LeaderTable
  // component handles the NPI column and the rank renumber.
  const getAllItemsForExport = async (): Promise<LeaderTableItem[]> => {
    const params = new URLSearchParams();
    params.append('nominationType', nominationType);
    if (clientId) params.append('clientId', clientId);
    params.append('limit', '5000');
    params.append('page', '1');
    const full = await apiClient.get<LeaderRankingsResponse>(
      `/api/v1/insights/${diseaseAreaId}/leader-rankings?${params.toString()}`
    );
    return (full?.items ?? []).map((it) => ({
      rank: it.rank,
      name: it.name,
      hcpId: it.hcpId,
      npi: (it as { npi?: string | null }).npi ?? null,
      specialty: it.specialty,
      influencerType: it.influencerType,
      state: it.state,
      city: (it as { city?: string | null }).city ?? null,
      count: it.count,
    }));
  };

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
      getAllItemsForExport={getAllItemsForExport}
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

      {/* v1.17.24: single-column layout so every leader table gets the
          full viewport width and all 6 columns (Leader / Count /
          Specialty / Influencer Type / State / Rank) fit without
          horizontal scroll. Customer-reported: "some people might not
          realize they have to scroll". The prior lg:grid-cols-2 split
          forced each table into ~half the page, which overflowed at
          common laptop widths. */}
      <div className="grid grid-cols-1 gap-6">
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
