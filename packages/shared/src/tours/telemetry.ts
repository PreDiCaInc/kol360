/**
 * TourTelemetry — swap-safe contract for tour-event emission.
 *
 * Phase 1 ships `LoggingTourTelemetry` which just writes structured
 * log lines. Phase 3 flips to a real analytics impl (Amplitude,
 * PostHog, etc.) via a config flag — the interface is the seam. Every
 * TourEvent listed in `types.ts` fires from Phase 1 as a no-op stub,
 * so Phase 3's analytics wire-up is a swap, not a build.
 *
 * See docs/findings/insights-use-case-tours-interactive-walkthroughs-2026-07-04.md
 * §"Phasing / Phase 1 — TourTelemetry interface sketched" and
 * §"Telemetry event schema — defined now, fires as stubs in Phase 1".
 */

import type { TourEvent } from './types';

export interface TourTelemetry {
  track(event: TourEvent, payload: Record<string, unknown>): void;
}

/**
 * Phase 1 impl — structured `console.info` output. Structured so a
 * later Phase 3 analytics swap can grep + backfill events from
 * CloudWatch if needed.
 *
 * NB: kept `console.info` rather than importing an app-level logger
 * because this file lives in `packages/shared` and cannot pull in
 * apps/api or apps/web dependencies. If the web app wants to route
 * these through its own logger, it can wrap `LoggingTourTelemetry`
 * and forward `track()` calls.
 */
export class LoggingTourTelemetry implements TourTelemetry {
  track(event: TourEvent, payload: Record<string, unknown>): void {
    // Structured single-line JSON so a Phase 3 swap can grep this and
    // backfill events if the analytics wire-up came late.
    // eslint-disable-next-line no-console
    console.info('[tour-telemetry]', JSON.stringify({ event, ...payload }));
  }
}

/**
 * Convenience null impl for tests + SSR. Tour tests should assert on
 * a `SpyTourTelemetry` (below), not this.
 */
export class NoopTourTelemetry implements TourTelemetry {
  track(): void {
    // intentionally empty
  }
}

/**
 * Test double — captures every event for assertion in unit / e2e
 * tests. NOT for production use; exported so both the shared package
 * tests and the web app's Playwright specs can share the same double.
 */
export class SpyTourTelemetry implements TourTelemetry {
  public readonly events: Array<{ event: TourEvent; payload: Record<string, unknown> }> = [];

  track(event: TourEvent, payload: Record<string, unknown>): void {
    this.events.push({ event, payload });
  }

  clear(): void {
    this.events.length = 0;
  }

  /**
   * Assertion helper — count how many times a specific event fired.
   * Common test shape: after running a tour, expect exactly one
   * `tour.launched` and one `tour.completed`.
   */
  countOf(event: TourEvent): number {
    return this.events.filter((e) => e.event === event).length;
  }
}
