'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useLeaderRankings, useInsightsFilterOptions } from '@/hooks/use-insights-report';
import { LeaderTable } from '@/components/insights/tables/leader-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Filter, X, Search } from 'lucide-react';
import type { NominationType } from '@kol360/shared';
import type { LeaderTableColumn } from '@/components/insights/tables/leader-table';

interface Props {
  diseaseAreaId: string;
  onKolSelect?: (kolId: string) => void;
  clientId?: string;
}

interface LeaderFilters {
  specialty?: string;
  state?: string;
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

const COLUMNS: LeaderTableColumn[] = ['name', 'specialty', 'city', 'state', 'count'];

function LeaderRankingPanel({
  diseaseAreaId,
  nominationType,
  label,
  color,
  onKolSelect,
  clientId,
  filters,
  searchTerm,
  onSearchChange,
}: {
  diseaseAreaId: string;
  nominationType: NominationType;
  label: string;
  color: string;
  onKolSelect?: (kolId: string) => void;
  clientId?: string;
  filters: LeaderFilters;
  searchTerm: string;
  onSearchChange: (value: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [sortBy, setSortBy] = useState('count');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Build API options with filters
  const apiOptions = useMemo(() => {
    const opts: Record<string, string | number> = { page, limit };
    if (filters.specialty) opts.specialty = filters.specialty;
    if (filters.state) opts.state = filters.state;
    return opts;
  }, [page, limit, filters]);

  const { data, isLoading } = useLeaderRankings(diseaseAreaId, nominationType, apiOptions, clientId);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [filters.specialty, filters.state]);

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
    city: item.city,
    state: item.state,
    count: item.count,
  }));

  // Client-side sorting (API returns sorted by count desc)
  const sortedItems = [...rawItems].sort((a, b) => {
    const field = sortBy as keyof typeof a;
    const aVal = a[field] ?? '';
    const bVal = b[field] ?? '';
    const cmp = typeof aVal === 'number' && typeof bVal === 'number'
      ? aVal - bVal
      : String(aVal).localeCompare(String(bVal));
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  // Client-side name filter
  const items = useMemo(() => {
    if (!searchTerm.trim()) return sortedItems;
    const term = searchTerm.toLowerCase();
    return sortedItems.filter(item => item.name.toLowerCase().includes(term));
  }, [sortedItems, searchTerm]);

  // Re-assign ranks after sorting/filtering
  items.forEach((item, i) => { item.rank = (page - 1) * limit + i + 1; });

  const maxCount = items.length > 0 ? Math.max(...items.map((i) => i.count)) : 1;

  return (
    <div className="space-y-2">
      {/* KOL name search for this panel */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder={`Search ${label}...`}
          className="h-8 pl-8 text-xs"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
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
    </div>
  );
}

export function LeaderRankingsTab({ diseaseAreaId, onKolSelect, clientId }: Props) {
  const [filters, setFilters] = useState<LeaderFilters>({});
  const { data: filterOptions } = useInsightsFilterOptions(diseaseAreaId);

  // Per-panel search terms
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});

  const handleSearchChange = useCallback((nominationType: string, value: string) => {
    setSearchTerms(prev => ({ ...prev, [nominationType]: value }));
  }, []);

  const hasActiveFilters = Object.values(filters).some(v => v !== undefined && v !== '');
  const hasActiveSearch = Object.values(searchTerms).some(v => v.trim() !== '');

  const handleClearAll = useCallback(() => {
    setFilters({});
    setSearchTerms({});
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">KOL360 Leaders</h2>
        <p className="text-sm text-muted-foreground">
          Top leaders ranked by nomination count across 6 categories
        </p>
      </div>

      {/* Filter Bar */}
      <div className="bg-muted/50 rounded-lg p-4 print:hidden">
        <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
          <Filter className="h-4 w-4" />
          <span>Leader Filters</span>
          {(hasActiveFilters || hasActiveSearch) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="ml-2 text-muted-foreground hover:text-foreground h-7 px-2"
            >
              <X className="h-3 w-3 mr-1" />
              Clear All
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">KOL Specialty</Label>
            <Select
              value={filters.specialty || 'all'}
              onValueChange={(v) => setFilters(prev => ({ ...prev, specialty: v === 'all' ? undefined : v }))}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All Specialties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Specialties</SelectItem>
                {(filterOptions?.specialties || []).map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">KOL State</Label>
            <Select
              value={filters.state || 'all'}
              onValueChange={(v) => setFilters(prev => ({ ...prev, state: v === 'all' ? undefined : v }))}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All States" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {(filterOptions?.states || []).map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {NOMINATION_TYPES.map((type) => (
          <LeaderRankingPanel
            key={type.value}
            diseaseAreaId={diseaseAreaId}
            nominationType={type.value}
            label={type.label}
            color={type.color}
            onKolSelect={onKolSelect}
            clientId={clientId}
            filters={filters}
            searchTerm={searchTerms[type.value] || ''}
            onSearchChange={(v) => handleSearchChange(type.value, v)}
          />
        ))}
      </div>
    </div>
  );
}
