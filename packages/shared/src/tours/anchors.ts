/**
 * Tour anchor registry — single source of truth for every element a
 * TourStep can attach to.
 *
 * The two-layered typing (`TOUR_ANCHORS` const object + `TourAnchor`
 * derived union) is what turns a rename mistake into a TypeScript
 * error rather than a silent runtime failure. `tourAnchor(id)` returns
 * the `data-tour-id` attribute pair for a component; adding a new
 * anchor here is a one-line change; using an unknown anchor is a
 * compile-time reject.
 *
 * See docs/findings/insights-use-case-tours-interactive-walkthroughs-2026-07-04.md
 * §"Architecture / 1. Anchor UI elements — tourAnchor() typed helper".
 */

export const TOUR_ANCHORS = {
  // Dashboard shell tabs (Insights dashboard). Anchor names track the
  // actual tab values in insights-dashboard.tsx (not the shorter labels
  // that render in the UI), so anchor-to-element mapping is 1:1 and
  // Agent A doesn't have to guess which shortened alias applies.
  'tab-introduction':          'tab-introduction',
  'tab-demographics':          'tab-demographics',
  'tab-benchmarking':          'tab-benchmarking',       // Actual tab value: 'dynamic-benchmarking'
  'tab-sociometric-leaders':   'tab-sociometric-leaders',
  'tab-total-weighted-score':  'tab-total-weighted-score',

  // Filters (shared across leader-rankings + kol-explorer surfaces)
  'filter-state':              'filter-state',
  'filter-specialty':          'filter-specialty',
  'filter-respondent-role':    'filter-respondent-role',
  'filter-influencer-type':    'filter-influencer-type',
  'btn-apply-filters':         'btn-apply-filters',

  // Leader Table + KOL Explorer table anchors
  'kol-row-first':             'kol-row-first',
  'leader-table':              'leader-table',
  // v1.17.77 — KOL scores table on the Total Weighted Score tab
  // (KolExplorerTab component). Distinct from `leader-table` which
  // lives inside LeaderTable on the Benchmarking tab.
  'weighted-score-table':      'weighted-score-table',

  // KOL Profile (route-change target — Case Study 1 Deep dive step 6)
  'kol-profile-header':        'kol-profile-header',
  'nominators-table':          'nominators-table',
  'demographics-panel':        'demographics-panel',

  // Sociometric Summary
  'sociometric-table':         'sociometric-table',
} as const;

/**
 * Union of every valid anchor id. Use as `TourStep['target']` so tour
 * content is compile-time-checked against the anchor registry.
 */
export type TourAnchor = keyof typeof TOUR_ANCHORS;

/**
 * Spread the returned object onto a React element to attach the tour
 * anchor. Compile-time-safe: `tourAnchor('unknown')` is a TS error.
 *
 * Usage:
 *   <TabsTrigger value="dynamic-benchmarking" {...tourAnchor('tab-benchmarking')}>
 *
 * The output shape stays a plain `data-tour-id` attribute — the whole
 * tour engine (Shepherd, waitForElement, e2e specs) reads via
 * `document.querySelector('[data-tour-id="..."]')`.
 */
export function tourAnchor(id: TourAnchor): { 'data-tour-id': string } {
  return { 'data-tour-id': TOUR_ANCHORS[id] };
}

/**
 * Build the CSS selector Shepherd + waitForElement use to find an
 * anchor. Kept as a helper so the attribute-name convention lives in
 * exactly one place (this file).
 */
export function tourAnchorSelector(id: TourAnchor): string {
  return `[data-tour-id="${TOUR_ANCHORS[id]}"]`;
}
