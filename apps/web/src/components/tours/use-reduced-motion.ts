'use client';

/**
 * useReducedMotion — reactive hook that returns true when the user's
 * OS-level "reduce motion" preference is set (macOS System Settings
 * > Accessibility > Display > Reduce Motion; Windows Settings >
 * Accessibility > Visual Effects > Animation Effects; etc.).
 *
 * Tour usage: when true, the pulse animation on target elements is
 * disabled and the highlight falls back to a static outline. This is
 * a hard a11y requirement per the spec, not a nice-to-have.
 */

import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.(QUERY).matches ?? false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return;
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    // addEventListener is the modern API; a small fallback covers
    // Safari < 14 which still ships in the wild.
    if ('addEventListener' in mq) {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    // @ts-expect-error legacy Safari
    mq.addListener(handler);
    return () => {
      // @ts-expect-error legacy Safari
      mq.removeListener(handler);
    };
  }, []);

  return reduced;
}
