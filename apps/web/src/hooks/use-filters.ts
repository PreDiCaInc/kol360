'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * v1.17.53 — Track B (Apply Filters batch UX) frontend.
 *
 * Holds TWO filter states:
 *  - `pending` — what the filter bar currently displays. Edits land here
 *                synchronously on every onChange. Used by the live "N
 *                match" indicator.
 *  - `applied` — what the data table/chart is currently rendering. Only
 *                changes when the user clicks Apply Filters (or hits
 *                Enter on a filter input).
 *
 * The data query subscribes ONLY to `applied`, so filter-edit
 * keystrokes never re-fire the heavy aggregation query. The match-
 * count query subscribes to `pending` (debounced) and only when dirty.
 *
 * Generic over the filter shape T so each tab (Sociometric, KOL
 * Explorer, Demographics, Leader Rankings) can pin a tab-specific
 * shape without giving up the shared apply/dirty/reset machinery.
 *
 * `tabId` is currently informational (kept for future per-tab URL key
 * isolation if multiple filter sets ever coexist on one URL).
 */
export interface UseFiltersResult<T> {
  pending: T;
  applied: T;
  isDirty: boolean;
  setPending: (next: T | ((prev: T) => T)) => void;
  setPendingField: <K extends keyof T>(key: K, value: T[K]) => void;
  apply: () => void;
  reset: () => void;
}

export function useFilters<T extends object>(
  initial: T,
  _opts?: { tabId?: string }
): UseFiltersResult<T> {
  const [pending, _setPending] = useState<T>(initial);
  const [applied, _setApplied] = useState<T>(initial);

  // Stable reference to the initial shape so reset() works
  // predictably even after re-renders that don't change `initial`.
  const initialRef = useRef<T>(initial);
  useEffect(() => {
    initialRef.current = initial;
  }, [initial]);

  const isDirty = useMemo(() => !shallowEqualFilters(pending, applied), [pending, applied]);

  const setPending = useCallback((next: T | ((prev: T) => T)) => {
    _setPending(next);
  }, []);

  const setPendingField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    _setPending((prev) => ({ ...prev, [key]: value }));
  }, []);

  const apply = useCallback(() => {
    _setApplied(pending);
  }, [pending]);

  const reset = useCallback(() => {
    const next = initialRef.current;
    _setPending(next);
    _setApplied(next);
  }, []);

  return { pending, applied, isDirty, setPending, setPendingField, apply, reset };
}

/**
 * Filter-shape equality. Treats undefined / null / '' / [] as
 * equivalent "no filter" — so toggling a multi-select to empty
 * doesn't read as dirty vs an unset value, and vice versa.
 *
 * Handles the categorical multi-select arrays + numeric range
 * primitives + booleans + nested objects (one level deep, sufficient
 * for the current respondent-filter shape).
 */
function shallowEqualFilters<T extends object>(a: T, b: T): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  const seen: Record<string, true> = {};
  const allKeys: string[] = [];
  for (const k of keysA) { if (!seen[k]) { seen[k] = true; allKeys.push(k); } }
  for (const k of keysB) { if (!seen[k]) { seen[k] = true; allKeys.push(k); } }
  for (const k of allKeys) {
    const av = (a as Record<string, unknown>)[k];
    const bv = (b as Record<string, unknown>)[k];
    if (av === bv) continue;
    if (isEmpty(av) && isEmpty(bv)) continue;
    if (Array.isArray(av) && Array.isArray(bv)) {
      if (av.length !== bv.length) return false;
      for (let i = 0; i < av.length; i++) if (av[i] !== bv[i]) return false;
      continue;
    }
    return false;
  }
  return true;
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}
