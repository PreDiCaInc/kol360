'use client';

/**
 * Tour context — surfaces the tour engine to consumer components
 * (guide drawer's "Take the tour" button, completion checkmark
 * rendering, "New" chip). Split from the provider so mock impls can
 * feed the context in tests without spinning up the whole engine.
 */

import { createContext, useContext } from 'react';
import type { TourCompletionStore, TourTelemetry } from '@kol360/shared';

export interface TourContextValue {
  /**
   * Start a tour by slug. No-op if the slug isn't in CASE_STUDIES or
   * if a tour is already running. Called by the "Take the tour" button.
   */
  startTour: (slug: string) => void;
  /**
   * Cancel any running tour + clear URL state. Called by the Skip
   * button, ESC key, and (defensively) on route unmount.
   */
  cancelTour: () => void;
  /**
   * True when a tour is currently running. UI can use this to hide
   * competing affordances (drawer button reads "Tour running…" etc.).
   */
  isTourActive: boolean;
  /** Currently active tour slug, or null. */
  activeTourSlug: string | null;
  /** Currently active step index, or null. */
  activeStepIndex: number | null;
  /** Live handle to the completion store — for drawer checkmarks. */
  completionStore: TourCompletionStore;
  /** Live handle to the telemetry sink — mostly for e2e assertions. */
  telemetry: TourTelemetry;
}

export const TourContext = createContext<TourContextValue | null>(null);

/**
 * Consume the tour context. Throws when called outside `<TourProvider>`;
 * consumers should assume they're wrapped.
 */
export function useTourContext(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) {
    throw new Error('useTourContext must be used inside <TourProvider>');
  }
  return ctx;
}
