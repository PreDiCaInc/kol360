'use client';

import { useCallback, useEffect, useState } from 'react';

// v1.17.41 — per-table column-visibility state with localStorage
// persistence. Designed to layer on top of the Insights tables
// (KOL Explorer + Sociometric Summary) where the user wants to
// hide noise columns (Degree, City) while keeping sticky # + Name
// always visible.
//
// Storage key is per-table (caller supplies). Hidden keys are
// stored — visible is the default state — so a new column added
// later auto-shows for existing users.

export interface ColumnVisibility {
  /** True when the given column key should render. */
  isVisible: (key: string) => boolean;
  /** Toggle a single column's visibility. */
  toggle: (key: string) => void;
  /** The current set of hidden keys (for the selector UI). */
  hidden: Set<string>;
  /** Reset to the default-hidden set. */
  reset: () => void;
}

export function useColumnVisibility(
  storageKey: string,
  defaultHidden: readonly string[]
): ColumnVisibility {
  const defaultSet = new Set<string>(defaultHidden);

  const [hidden, setHidden] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return defaultSet;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === null) return defaultSet;
      const parsed = JSON.parse(stored) as string[];
      if (!Array.isArray(parsed)) return defaultSet;
      return new Set(parsed);
    } catch {
      return defaultSet;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(hidden)));
    } catch {
      // Ignore quota / private-mode errors. Selection just stays
      // in-memory for the session.
    }
  }, [hidden, storageKey]);

  const isVisible = useCallback((key: string) => !hidden.has(key), [hidden]);

  const toggle = useCallback((key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const reset = useCallback(() => setHidden(new Set(defaultHidden)), [defaultHidden]);

  return { isVisible, toggle, hidden, reset };
}
