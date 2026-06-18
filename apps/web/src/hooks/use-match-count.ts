'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

/**
 * v1.17.53 — Track B (Apply Filters batch UX) frontend.
 *
 * Hooks for the live "N match" indicator displayed next to the Apply
 * Filters button.
 *
 * Backend: GET /api/v1/insights/:diseaseAreaId/match-count?type=...
 *   - type=kols       → distinct HCPs (Sociometric, KOL Explorer, Benchmarking)
 *   - type=respondents → distinct respondents (Demographics)
 * And: GET /api/v1/insights/:diseaseAreaId/kol-profile/:hcpId/match-count
 *   → distinct nominators of an HCP (KOL Profile drill-down — not used
 *     yet; provided for the follow-on PR)
 *
 * Each hook:
 *   - Fires ONLY when `enabled` is true. The tab passes `isDirty` as
 *     `enabled` so the count fires only while the user has uncommitted
 *     filter edits — the post-apply or initial-load state is read off
 *     the existing data response's total instead.
 *   - Debounces the request 250ms so dropdown click-storms don't fan
 *     out a request per click.
 *   - staleTime=0: filter state can shift quickly; we want fresh
 *     counts on every settled keystroke.
 */

const DEBOUNCE_MS = 250;

function useDebounced<T>(value: T, ms = DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(handle);
  }, [value, ms]);
  return debounced;
}

// v1.17.31: arrays serialize as REPEATED params (?k=A&k=B), never CSV.
// CSV silently shredded values containing commas (e.g. "Dry Eye
// (including OSD, MGD, and NK)"). See docs/findings/splitcsv-comma-bug.
function appendParam(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return;
  if (Array.isArray(value)) {
    value.forEach((v) => {
      if (v !== undefined && v !== null && v !== '') params.append(key, String(v));
    });
    return;
  }
  params.append(key, String(value));
}

function buildQuery(
  clientId: string | undefined,
  type: string,
  filters: Record<string, unknown>
): string {
  const p = new URLSearchParams();
  p.set('type', type);
  if (clientId) p.set('clientId', clientId);
  for (const [k, v] of Object.entries(filters)) appendParam(p, k, v);
  return p.toString();
}

export function useKolMatchCount(
  diseaseAreaId: string,
  pendingFilters: Record<string, unknown>,
  clientId?: string,
  enabled = true
) {
  const debounced = useDebounced(pendingFilters);

  return useQuery({
    queryKey: ['match-count', 'kols', diseaseAreaId, clientId, debounced],
    queryFn: () =>
      apiClient.get<{ count: number }>(
        `/api/v1/insights/${diseaseAreaId}/match-count?${buildQuery(clientId, 'kols', debounced)}`
      ),
    enabled: !!diseaseAreaId && !!clientId && enabled,
    staleTime: 0,
  });
}

export function useRespondentMatchCount(
  diseaseAreaId: string,
  pendingFilters: Record<string, unknown>,
  clientId?: string,
  enabled = true
) {
  const debounced = useDebounced(pendingFilters);

  return useQuery({
    queryKey: ['match-count', 'respondents', diseaseAreaId, clientId, debounced],
    queryFn: () =>
      apiClient.get<{ count: number }>(
        `/api/v1/insights/${diseaseAreaId}/match-count?${buildQuery(clientId, 'respondents', debounced)}`
      ),
    enabled: !!diseaseAreaId && !!clientId && enabled,
    staleTime: 0,
  });
}

export function useNominatorMatchCount(
  diseaseAreaId: string,
  hcpId: string,
  pendingFilters: Record<string, unknown>,
  clientId?: string,
  enabled = true
) {
  const debounced = useDebounced(pendingFilters);

  return useQuery({
    queryKey: ['match-count', 'nominators', diseaseAreaId, hcpId, clientId, debounced],
    queryFn: () => {
      const p = new URLSearchParams();
      if (clientId) p.set('clientId', clientId);
      for (const [k, v] of Object.entries(debounced)) appendParam(p, k, v);
      return apiClient.get<{ count: number }>(
        `/api/v1/insights/${diseaseAreaId}/kol-profile/${hcpId}/match-count?${p.toString()}`
      );
    },
    enabled: !!diseaseAreaId && !!hcpId && !!clientId && enabled,
    staleTime: 0,
  });
}
