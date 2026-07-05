/**
 * Tour engine primitives — schema, anchors, cross-route wait,
 * completion store, telemetry. Consumed by:
 *   - apps/web/src/components/tours/tour-provider.tsx (runtime)
 *   - apps/web/src/content/insights-guide/guide-content.ts (authored steps)
 *   - Insights UI components (via tourAnchor(...))
 *
 * See docs/findings/insights-use-case-tours-interactive-walkthroughs-2026-07-04.md
 */

export * from './anchors';
export * from './types';
export * from './wait-for-element';
export * from './completion-store';
export * from './telemetry';
