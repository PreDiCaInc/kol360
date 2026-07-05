/**
 * Tour content schema — TourStep + supporting types.
 *
 * A `TourStep` lives in `guide-content.ts` alongside the existing
 * static `steps: GuideStep[]` array. Two segments per case study
 * (Quick intro / Deep dive), separated by an auto-inserted checkpoint
 * step at render time.
 *
 * See docs/findings/insights-use-case-tours-interactive-walkthroughs-2026-07-04.md
 * §"Architecture / 2. Tour content lives with the existing
 * case-study content" and §"Content authoring — Quick intro + Deep
 * dive per case study".
 */

import type { TourAnchor } from './anchors';

/**
 * Which segment a step belongs to. Used to auto-insert a checkpoint
 * tooltip at the boundary between 'intro' and 'deep-dive'.
 */
export type TourSegment = 'intro' | 'deep-dive';

/**
 * Insights dashboard tabs a step may require to be active. Values MUST
 * match the string used by `insights-dashboard.tsx`'s
 * `<Tabs value={activeTab}>` — used for `activeTab === requiredTab`
 * comparison in the TourProvider.
 */
export type InsightsTab =
  | 'introduction'
  | 'demographics'
  | 'dynamic-benchmarking'
  | 'sociometric-leaders'
  | 'total-weighted-score';

/**
 * How a step's Next transition fires.
 *   - 'next-button'  (default) — user clicks Next in the tooltip
 *   - 'target-click' — auto-advance when the target element is clicked
 *   - 'tab-change'   — auto-advance when the required tab becomes active
 *   - 'route-change' — auto-advance when the required route is entered
 *
 * `route-change` triggers the `waitForElement` cross-route wait — the
 * highest-risk transition in the system. See wait-for-element.ts.
 */
export type TourAdvanceMode =
  | 'next-button'
  | 'target-click'
  | 'tab-change'
  | 'route-change';

export type TourHighlight = 'pulse' | 'outline' | 'none';

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'auto';

export interface TourStep {
  /**
   * Element the tooltip attaches to. Compile-time-checked against
   * `TOUR_ANCHORS` — a typo here is a TypeScript error.
   */
  target: TourAnchor;

  /**
   * Which segment this step belongs to. A checkpoint tooltip is
   * auto-inserted at render time at the last intro → first deep-dive
   * boundary.
   */
  segment: TourSegment;

  /** Tab expected to be active BEFORE this step. Null = no constraint. */
  requiredTab?: InsightsTab | null;

  /** Route expected. Null = any. Path-only match; ignore query. */
  requiredRoute?: string | null;

  /** Bold title. Kept short (≤ ~5 words). */
  title: string;

  /** 1-2 sentences of context. Markdown supported for links/emphasis. */
  body: string;

  /** Where to place the tooltip relative to the target. Default 'auto'. */
  placement?: TourPlacement;

  /** How this step advances. Default 'next-button'. */
  advanceOn?: TourAdvanceMode;

  /** Highlight style on the target element. Default 'pulse'. */
  highlight?: TourHighlight;
}

/**
 * Every telemetry event fired by the tour engine. Kept as a discriminated
 * literal union so consumers can exhaustive-switch and unit tests can
 * assert on strings without importing runtime.
 */
export type TourEvent =
  | 'tour.launched'
  | 'tour.step_advanced'
  | 'tour.checkpoint_reached'
  | 'tour.completed'
  | 'tour.skipped'
  | 'tour.abandoned'
  | 'tour.anchor_missing';

/**
 * Aggregated summary payload for a completed case study — surfaced by
 * "Show me the summary" (Phase 3) instead of the "Skip to end" anti-
 * pattern. Kept optional on the CaseStudy shape so authoring a case
 * without a summary still compiles.
 */
export interface TourSummary {
  /** 3-5 bullets recapping the case study's takeaways. */
  bullets: string[];
  /** Optional pointer to the static "Read guide" content anchor. */
  readGuideAnchor?: string;
}
