/**
 * v1.17.63 — Insights Use Cases guide content.
 *
 * Source: docs/Sun Pharma - Case Study.docx (extracted to .txt for
 * authoring; the 12 embedded screenshots copied into
 * apps/web/public/help/insights-guide/). Rebranded in-product per
 * pteam decision — no "Sun Pharma" mentions; case studies are
 * generic and apply to every tenant.
 *
 * Edit this file to update the guide. No CMS — the markdown source
 * lives in source control + ships with the release. Screenshots go
 * under apps/web/public/help/insights-guide/.
 *
 * v1.17.72 — extended with `tour?: TourStep[]` for the interactive
 * walkthrough layer. See docs/findings/insights-use-case-tours-
 * interactive-walkthroughs-2026-07-04.md.
 *
 * Ticket: docs/findings/insights-use-case-guide-presentation-2026-06-24.md
 */

import type { TourStep, TourSummary } from '@kol360/shared';

export interface GuideStep {
  /** Optional step number. Renders as "Step N." if set. */
  n?: number;
  /** Paragraph(s) describing the step. */
  body: string;
  /** Optional inline note rendered in muted italic below the body. */
  note?: string;
  /** Optional screenshot under /help/insights-guide/. */
  image?: string;
  /** Alt text for the screenshot. */
  imageAlt?: string;
}

export interface CaseStudy {
  /** Used as the URL anchor — case-1, case-2, etc. */
  slug: string;
  title: string;
  /** Which Insights tab(s) the case study primarily exercises. */
  tabs: string[];
  /** Scenario paragraph that sets up the case. */
  scenario: string;
  /** Step-by-step body. */
  steps: GuideStep[];
  /**
   * v1.17.72 — Optional interactive tour steps. When present, the
   * guide drawer renders a "▶ Take the tour" button alongside "Read
   * guide". Absence → tour button hidden, static screenshots only.
   *
   * A checkpoint tooltip is auto-inserted at render time between the
   * last 'intro' and first 'deep-dive' step.
   */
  tour?: TourStep[];
  /**
   * v1.17.72 — Optional "Show me the summary" text digest surfaced in
   * Phase 3. Bullets recap the case-study takeaways without requiring
   * the user to complete the tour or read the full guide.
   */
  tourSummary?: TourSummary;
}

export interface PracticeScenario {
  slug: string;
  title: string;
  /** Setup paragraph framing the scenario. */
  scenario: string;
  /** "Try it yourself" prompt — no answer given. */
  prompt: string;
}

export const CASE_STUDIES: CaseStudy[] = [
  {
    slug: 'case-1-fl-optometrist-dinner',
    title: 'Organizing a Doctor Dinner in Florida',
    tabs: ['Benchmarking', 'KOL Profile'],
    scenario:
      'You want to host a series of optometrist doctor dinners in Florida, California, and New York, and need to pick KOLs whose reputation resonates with potential attendees in those geographies.',
    steps: [
      {
        n: 1,
        body: 'Navigate to the Insights Dashboard and click the Benchmarking tab.',
        image: 'case-1-step-1.png',
        imageAlt: 'Insights dashboard with the Benchmarking tab highlighted.',
      },
      {
        n: 2,
        body: 'Apply a State of Practice filter set to "Florida, California, and New York."',
        note: 'If you care about WHERE the KOL practices, use the Leader Filters. If you care about WHERE the respondents who nominated them practice, use the Respondent Filters. Both surfaces are available on this tab.',
        image: 'case-1-step-2.png',
        imageAlt: 'State of Practice filter chip with FL / CA / NY selected.',
      },
      {
        n: 3,
        body: 'Because the target audience is optometrists, filter further by setting the Respondent Role to "Optometrist."',
        image: 'case-1-step-3.png',
        imageAlt: 'Respondent Role filter set to Optometrist.',
      },
      {
        n: 4,
        body: 'Read the top KOLs nominated across each leadership category. These are your speaker shortlist candidates — names that came up most often in the filter you specified.',
        image: 'case-1-step-4.png',
        imageAlt: 'Benchmarking leader rankings showing top KOLs per nomination type.',
      },
      {
        n: 5,
        body: 'Click any KOL\'s name to open the KOL Profile drill-down. The profile shows tabulated scores across leadership categories plus metadata on the doctors who nominated them.',
        image: 'case-1-step-5.png',
        imageAlt: 'Full KOL Profile drill-down — score breakdown, per-type nomination counts, Respondent Filters bar, nominations by role and state, Nominations table, and demographic sub-charts (Practice Setting, Core Focus, Treatment Decile, DED Patients, Total Monthly Patients, Years in Practice).',
      },
      {
        n: 6,
        body: 'In the KOL Profile, read the Nominations table at the bottom. The doctors, practice settings, and practice focus areas listed there are real attendees you can use to shape your dinner invite list.',
        image: 'case-1-step-6.png',
        imageAlt: 'Nominations table within the KOL Profile drill-down.',
      },
    ],
    // v1.17.72 — pilot tour for Case Study 1. Quick intro = 3 steps
    // (basics: Benchmarking + State filter + top-3 leaders); Deep dive
    // = 4 steps (Respondent Role, KOL Profile drill via drawer, then
    // Nominators table + demographics on the opened profile panel).
    //
    // Architecture note: KOL Profile is NOT a separate route — it's a
    // `selectedKolId` state change inside kol-explorer.tsx that opens
    // an inline profile panel. The tour spec originally described this
    // as a route change; reality is a state/drawer change. Same
    // waitForElement machinery still applies (profile panel loads
    // data async, so nominators-table renders after the click), just
    // with `target-click` advance instead of `route-change`.
    tour: [
      // ── Quick intro ───────────────────────────────────────────────
      {
        target: 'tab-benchmarking',
        segment: 'intro',
        title: 'Open Benchmarking',
        body: 'Benchmarking shows leaders across nomination categories. Click here to start.',
        placement: 'bottom',
        // Clicking the Benchmarking tab auto-advances the tour. Next
        // button in the tooltip works as a manual override.
        advanceOn: 'target-click',
        highlight: 'pulse',
      },
      {
        target: 'filter-state',
        segment: 'intro',
        requiredTab: 'dynamic-benchmarking',
        title: 'Pick your states',
        body: 'Open the State filter and select Florida, California, and New York.',
        placement: 'bottom',
        advanceOn: 'next-button',
        highlight: 'pulse',
      },
      {
        target: 'leader-table',
        segment: 'intro',
        requiredTab: 'dynamic-benchmarking',
        title: 'Review the top leaders',
        body: 'The top-ranked KOLs across each nomination category are your speaker shortlist candidates.',
        placement: 'top',
        advanceOn: 'next-button',
        highlight: 'outline',
      },
      // ── Deep dive ─────────────────────────────────────────────────
      {
        target: 'filter-respondent-role',
        segment: 'deep-dive',
        requiredTab: 'dynamic-benchmarking',
        title: 'Focus on Optometrists',
        body: 'Since the target audience is optometrists, narrow the Respondent Role filter to Optometrist.',
        placement: 'bottom',
        advanceOn: 'next-button',
        highlight: 'pulse',
      },
      {
        target: 'kol-row-first',
        segment: 'deep-dive',
        requiredTab: 'dynamic-benchmarking',
        title: 'Drill into a KOL',
        body: 'Click any KOL name to open their profile panel. It loads async — the tour will wait.',
        placement: 'right',
        advanceOn: 'target-click',
        highlight: 'pulse',
      },
      {
        target: 'nominators-table',
        segment: 'deep-dive',
        title: 'Read the Nominations table',
        body: 'These are the real doctors who nominated this KOL. Their practice settings and focus areas shape your invite list.',
        placement: 'top',
        advanceOn: 'next-button',
        highlight: 'outline',
      },
      {
        target: 'demographics-panel',
        segment: 'deep-dive',
        title: 'Understand the mix',
        body: 'Scroll to see practice-setting, core-focus, and years-in-practice distributions. Ready to apply this to your own scenario?',
        placement: 'top',
        advanceOn: 'next-button',
        highlight: 'none',
      },
    ],
    tourSummary: {
      bullets: [
        'Open Benchmarking + filter State to FL / CA / NY for a shortlist.',
        'Add Respondent Role = Optometry to tighten to your audience.',
        'Drill into a KOL to see who nominated them + their demographic mix.',
        'The Nominations table doubles as an invite-list source.',
      ],
      readGuideAnchor: 'case-1-fl-optometrist-dinner',
    },
  },
  {
    slug: 'case-2-seco-discussion',
    title: 'SECO Dinner — Discussion and Advice Leaders',
    tabs: ['Benchmarking'],
    scenario:
      'You\'re hosting a SECO-sponsored dinner for optometrists across Georgia, Florida, and Alabama. You want to identify Discussion Leaders and Advice Leaders best positioned to lead the program — speakers whose voice will resonate with attendees in those geographies.',
    steps: [
      {
        n: 1,
        body: 'Open the Benchmarking tab and apply filters for State (GA, FL, AL) and Respondent Role (Optometrist). Click Apply Filters when you\'re done — the panels update once filters are committed.',
        image: 'case-2-step-1.png',
        imageAlt: 'Benchmarking with GA/FL/AL state filter and Optometrist role filter applied.',
      },
      {
        n: 2,
        body: 'The Discussion Leaders and Advice Leaders panels now show speakers ranked by nominations from your target audience. Use the column sort to walk down the list — or change the rows-per-page to widen the candidate pool.',
        note: 'Both panels support exporting to Excel via the icon in the footer. Useful when you\'re sharing the shortlist with a team.',
        image: 'case-2-step-2.png',
        imageAlt: 'Discussion Leaders and Advice Leaders panels with sortable columns.',
      },
    ],
    tour: [
      // ── Quick intro ───────────────────────────────────────────────
      {
        target: 'tab-benchmarking',
        segment: 'intro',
        title: 'Open Benchmarking',
        body: 'Benchmarking ranks leaders across nomination categories — the surface for Discussion + Advice Leaders.',
        placement: 'bottom',
        advanceOn: 'target-click',
        highlight: 'pulse',
      },
      {
        target: 'filter-state',
        segment: 'intro',
        requiredTab: 'dynamic-benchmarking',
        title: 'Pick GA, FL, AL',
        body: 'Open the State filter and select Georgia, Florida, and Alabama — SECO\'s footprint.',
        placement: 'bottom',
        advanceOn: 'next-button',
        highlight: 'pulse',
      },
      {
        target: 'filter-respondent-role',
        segment: 'intro',
        requiredTab: 'dynamic-benchmarking',
        title: 'Narrow to Optometrists',
        body: 'Set Respondent Role to Optometrist so the rankings reflect who your audience actually listens to.',
        placement: 'bottom',
        advanceOn: 'next-button',
        highlight: 'pulse',
      },
      {
        target: 'btn-apply-filters',
        segment: 'intro',
        requiredTab: 'dynamic-benchmarking',
        title: 'Apply the filters',
        body: 'Click Apply Filters to commit — the panels refresh with your filtered candidate pool.',
        placement: 'bottom',
        advanceOn: 'target-click',
        highlight: 'pulse',
      },
      // ── Deep dive ─────────────────────────────────────────────────
      {
        target: 'leader-table',
        segment: 'deep-dive',
        requiredTab: 'dynamic-benchmarking',
        title: 'Scan the panels',
        body: 'Walk down the Discussion Leaders and Advice Leaders panels. The names at the top are your speaker shortlist — nominated most often by your filtered audience.',
        placement: 'top',
        advanceOn: 'next-button',
        highlight: 'outline',
      },
      {
        target: 'leader-table',
        segment: 'deep-dive',
        requiredTab: 'dynamic-benchmarking',
        title: 'Sort + export',
        body: 'Click any column header to re-sort. Use the export icon in each panel\'s footer to pull an Excel copy for the team.',
        placement: 'top',
        advanceOn: 'next-button',
        highlight: 'none',
      },
    ],
    tourSummary: {
      bullets: [
        'Benchmarking + state filter GA/FL/AL + role Optometrist = SECO shortlist.',
        'Discussion Leaders + Advice Leaders panels drive the invite list.',
        'Panels support column sort + Excel export for team sharing.',
      ],
      readGuideAnchor: 'case-2-seco-discussion',
    },
  },
  {
    slug: 'case-3-seco-rising-stars',
    title: 'SECO Dinner — Identifying Rising Stars',
    tabs: ['Sociometric Leaders'],
    scenario:
      'Same OD respondent base across GA, FL, and AL, but you want to shift focus from established leaders to Rising Stars — emerging influencers worth tracking and cultivating ahead of future engagements.',
    steps: [
      {
        n: 1,
        body: 'Rising Stars are visible from the same Benchmarking panels as Discussion and Advice Leaders. But if you want the deeper detail — who has been classified as which influencer type — the Sociometric Leaders tab is the better surface.',
        image: 'case-3-step-1.png',
        imageAlt: 'Sociometric Leaders tab showing influencer type classifications.',
      },
      {
        // v1.17.66 — image dropped per docs/findings/insights-guide-v1.1-image-refresh-2026-07-01.md.
        // The sort-arrow UI is self-evident; the removed screenshot only showed
        // "result after clicking the arrow" which didn't teach anything the
        // user can't see in real time. Text unchanged.
        n: 2,
        body: 'Apply the same filters as Case Study 2 (GA / FL / AL state, Optometrist role) and click Apply Filters. Click the sort arrow on the Rising Stars panel to rank by nominations received — descending puts the strongest candidates at the top.',
      },
    ],
    tour: [
      // ── Quick intro ───────────────────────────────────────────────
      {
        target: 'tab-sociometric-leaders',
        segment: 'intro',
        title: 'Open Sociometric Leaders',
        body: 'This tab classifies each KOL by influencer type — the surface where Rising Stars are called out explicitly.',
        placement: 'bottom',
        advanceOn: 'target-click',
        highlight: 'pulse',
      },
      {
        target: 'filter-state',
        segment: 'intro',
        requiredTab: 'sociometric-leaders',
        title: 'Reuse the SECO footprint',
        body: 'State filter to GA, FL, AL — same audience as Case Study 2.',
        placement: 'bottom',
        advanceOn: 'next-button',
        highlight: 'pulse',
      },
      {
        target: 'filter-respondent-role',
        segment: 'intro',
        requiredTab: 'sociometric-leaders',
        title: 'Optometrist audience',
        body: 'Respondent Role → Optometrist, matching the SECO attendee base.',
        placement: 'bottom',
        advanceOn: 'next-button',
        highlight: 'pulse',
      },
      {
        target: 'btn-apply-filters',
        segment: 'intro',
        requiredTab: 'sociometric-leaders',
        title: 'Apply',
        body: 'Commit the filters — Sociometric refreshes with the filtered pool.',
        placement: 'bottom',
        advanceOn: 'target-click',
        highlight: 'pulse',
      },
      // ── Deep dive ─────────────────────────────────────────────────
      {
        target: 'sociometric-table',
        segment: 'deep-dive',
        requiredTab: 'sociometric-leaders',
        title: 'Find the Rising Star column',
        body: 'The Rising Stars column tags emerging influencers — future speaker candidates worth cultivating now.',
        placement: 'top',
        advanceOn: 'next-button',
        highlight: 'outline',
      },
      {
        target: 'sociometric-table',
        segment: 'deep-dive',
        requiredTab: 'sociometric-leaders',
        title: 'Sort by nominations',
        body: 'Click the sort arrow on the Rising Stars column, descending. The top names are the strongest emerging candidates for the SECO program.',
        placement: 'top',
        advanceOn: 'next-button',
        highlight: 'none',
      },
    ],
    tourSummary: {
      bullets: [
        'Sociometric Leaders tab exposes influencer-type classification per KOL.',
        'Reuse SECO filters (GA/FL/AL, Optometrist) → Apply.',
        'Rising Stars column ranks emerging KOLs — sort descending for the shortlist.',
      ],
      readGuideAnchor: 'case-3-seco-rising-stars',
    },
  },
  {
    slug: 'case-4-nynj-symposium',
    title: 'NY/NJ Symposium — Main Stage Speaker Selection',
    tabs: ['Sociometric Leaders', 'Benchmarking'],
    scenario:
      'You\'re building a symposium for an ophthalmology program across New York and New Jersey, focused specifically on Cornea and Dry Eye specialists. The goal: identify National Leaders for the main stage AND the Rising Stars worth featuring alongside them.',
    steps: [
      {
        n: 1,
        body: 'Apply state filters for NY and NJ, Respondent Role set to Ophthalmologist, and Sub-Specialty set to Cornea and Dry Eye. Use the Sociometric Leaders tab to see the National Leaders and Rising Stars columns side-by-side.',
        note: 'Sort and export still work the same way as the other tabs.',
        image: 'case-4-step-1.png',
        imageAlt: 'Sociometric Leaders tab showing National Leaders and Rising Stars for NY/NJ.',
      },
    ],
    tour: [
      // ── Quick intro ───────────────────────────────────────────────
      {
        target: 'tab-sociometric-leaders',
        segment: 'intro',
        title: 'Open Sociometric Leaders',
        body: 'Symposium main-stage picks need both National Leaders + Rising Stars — Sociometric shows them together.',
        placement: 'bottom',
        advanceOn: 'target-click',
        highlight: 'pulse',
      },
      {
        target: 'filter-state',
        segment: 'intro',
        requiredTab: 'sociometric-leaders',
        title: 'Pick NY, NJ',
        body: 'State filter to New York and New Jersey — the symposium\'s audience geography.',
        placement: 'bottom',
        advanceOn: 'next-button',
        highlight: 'pulse',
      },
      {
        target: 'filter-respondent-role',
        segment: 'intro',
        requiredTab: 'sociometric-leaders',
        title: 'Ophthalmologist audience',
        body: 'Respondent Role → Ophthalmologist, so the leaders reflect surgical/medical KOL recognition.',
        placement: 'bottom',
        advanceOn: 'next-button',
        highlight: 'pulse',
      },
      {
        target: 'filter-specialty',
        segment: 'intro',
        requiredTab: 'sociometric-leaders',
        title: 'Cornea + Dry Eye focus',
        body: 'Core Focus → Cornea and Dry Eye — narrows the ranking to sub-specialty peers.',
        placement: 'bottom',
        advanceOn: 'next-button',
        highlight: 'pulse',
      },
      {
        target: 'btn-apply-filters',
        segment: 'intro',
        requiredTab: 'sociometric-leaders',
        title: 'Apply',
        body: 'Commit the filters — Sociometric refreshes with the NY/NJ ophthalmology pool.',
        placement: 'bottom',
        advanceOn: 'target-click',
        highlight: 'pulse',
      },
      // ── Deep dive ─────────────────────────────────────────────────
      {
        target: 'sociometric-table',
        segment: 'deep-dive',
        requiredTab: 'sociometric-leaders',
        title: 'Compare the columns',
        body: 'National Leaders on one column, Rising Stars on another. The main stage names come from the top of Nationals; the "featured alongside" from the top of Rising Stars.',
        placement: 'top',
        advanceOn: 'next-button',
        highlight: 'outline',
      },
      {
        target: 'sociometric-table',
        segment: 'deep-dive',
        requiredTab: 'sociometric-leaders',
        title: 'Sort + export',
        body: 'Sort either column descending to pull your shortlist. Excel export from the panel footer works the same as Benchmarking.',
        placement: 'top',
        advanceOn: 'next-button',
        highlight: 'none',
      },
    ],
    tourSummary: {
      bullets: [
        'Sociometric surfaces National Leaders + Rising Stars side-by-side.',
        'NY/NJ + Ophthalmologist + Cornea/Dry Eye = symposium-specific pool.',
        'Nationals for the main stage, Rising Stars for pairing.',
      ],
      readGuideAnchor: 'case-4-nynj-symposium',
    },
  },
  {
    slug: 'case-5-trade-and-national',
    title: 'Combining Trade Publication Visibility + National Leader Status',
    tabs: ['Total Weighted Score'],
    scenario:
      'You want to identify speakers/KOLs by combining two signals: visibility in trade publications AND standing as a National Leader. Using a weighted score that blends both factors surfaces candidates who carry credibility in the literature AND peer recognition — the gold standard for speaker selection.',
    steps: [
      {
        n: 1,
        body: 'Open the Total Weighted Score tab. Set the weights to emphasize Trade Publications and the National Leader segment. Apply any geography or role filters that matter for your audience. The results refresh as soon as the filters are applied.',
        image: 'case-5-step-1.png',
        imageAlt: 'Total Weighted Score tab with Trade Pubs and National Leader weights configured.',
      },
      {
        n: 2,
        body: 'Sort the Trade Publication column descending to surface the top names. The composite weighted score column shows who scores well across BOTH signals, not just one.',
        note: 'Use the scale-filter sliders to constrain the score range if you want to focus on a tighter band — e.g. only KOLs in the top quintile across both signals.',
      },
    ],
    tour: [
      // ── Quick intro ───────────────────────────────────────────────
      {
        target: 'tab-total-weighted-score',
        segment: 'intro',
        title: 'Open Total Weighted Score',
        body: 'This tab blends multiple KOL signals into a single composite score you can tune. It\'s where "credible in the literature AND recognized by peers" becomes a single ranking.',
        placement: 'bottom',
        advanceOn: 'target-click',
        highlight: 'pulse',
      },
      {
        target: 'filter-state',
        segment: 'intro',
        requiredTab: 'total-weighted-score',
        title: 'Apply geography (optional)',
        body: 'Pick states if your program is regional. Skip if you want a national ranking.',
        placement: 'bottom',
        advanceOn: 'next-button',
        highlight: 'pulse',
      },
      {
        target: 'filter-respondent-role',
        segment: 'intro',
        requiredTab: 'total-weighted-score',
        title: 'Narrow the audience',
        body: 'Respondent Role scopes which peers\' nominations count toward the score.',
        placement: 'bottom',
        advanceOn: 'next-button',
        highlight: 'pulse',
      },
      {
        target: 'btn-apply-filters',
        segment: 'intro',
        requiredTab: 'total-weighted-score',
        title: 'Apply',
        body: 'Commit the filters — the weighted table refreshes with your scoped pool.',
        placement: 'bottom',
        advanceOn: 'target-click',
        highlight: 'pulse',
      },
      // ── Deep dive ─────────────────────────────────────────────────
      {
        target: 'leader-table',
        segment: 'deep-dive',
        requiredTab: 'total-weighted-score',
        title: 'Sort by Trade Pubs',
        body: 'Click the Trade Publications column header to sort descending. The top names are your highest-visibility literature-side candidates.',
        placement: 'top',
        advanceOn: 'next-button',
        highlight: 'outline',
      },
      {
        target: 'leader-table',
        segment: 'deep-dive',
        requiredTab: 'total-weighted-score',
        title: 'Read the composite',
        body: 'The composite Weighted Score column shows who scores well across BOTH Trade Publications AND National Leader — the double-signal shortlist.',
        placement: 'top',
        advanceOn: 'next-button',
        highlight: 'none',
      },
    ],
    tourSummary: {
      bullets: [
        'Total Weighted Score blends multiple KOL signals into one composite ranking.',
        'Tune weights + filters, then commit.',
        'Sort Trade Pubs to see visibility; Weighted Score column shows double-signal strength.',
      ],
      readGuideAnchor: 'case-5-trade-and-national',
    },
  },
];

export const PRACTICE_SCENARIOS: PracticeScenario[] = [
  {
    slug: 'scenario-1-tx-optometric-dinner',
    title: 'Texas Optometric Association Dinner Program',
    scenario:
      'You\'re organizing a dinner program at the Texas Optometric Association and need to identify the right speakers, discussion leaders, and target doctors for the event.',
    prompt:
      'Who are the top Discussion Leaders suited to speak at the dinner? Now look at the broader respondent list — which doctors would you flag as ideal attendees for the invite list?',
  },
  {
    slug: 'scenario-2-national-webinar',
    title: 'National Webinar Broadcast',
    scenario:
      'You\'re hosting a national webinar across the US and want to identify the top 2 National Leaders alongside Rising Stars to feature.',
    prompt:
      'Run a national-level search (no state filter) and identify the top 2 National Leaders. Then switch to the Rising Stars segment — who would you pair with those 2 leaders to round out the webinar lineup?',
  },
  {
    slug: 'scenario-3-ca-formulary-win',
    title: 'CA Formulary Win — Speaker Selection',
    scenario:
      'You want to drive a formulary win for your product in California and need to identify speakers by combining Organizational Leaders and Social Media Leaders — the two groups most likely to drive awareness and adoption.',
    prompt:
      'Apply the weighted score filter for California, combining the Organizational Leader and Social Media Leader segments. Who rises to the top once both are weighted together? How does this differ from looking at either segment alone?',
  },
  {
    slug: 'scenario-4-aaopt-advisory-board',
    title: 'AAOpt Advisory Board — Corporate Setting, High-Volume Dry Eye',
    scenario:
      'You need to assemble a 7-person advisory board for the American Academy of Optometry, focused on optometrists in corporate / high-volume dry eye patient settings.',
    prompt:
      'Filter for OD respondents in a corporate practice setting with high dry eye patient volume. From this filtered list, identify your top 7 candidates for the advisory board. What criteria pushed certain names to the top of your list?',
  },
];

/**
 * Short orientation copy shown for each Insights tab in the per-tab
 * info popover. Each entry deep-links to the case study (or studies)
 * that exercise this tab as the primary surface.
 */
export interface TabHelpEntry {
  /** Human-readable tab name. Matches the on-tab label. */
  tab: 'Sociometric Leaders' | 'KOL Explorer' | 'Demographics' | 'Benchmarking' | 'Total Weighted Score';
  oneLiner: string;
  bullets: string[];
  /** Slugs of CASE_STUDIES that primarily exercise this tab. */
  caseStudySlugs: string[];
}

export const TAB_HELP: TabHelpEntry[] = [
  {
    tab: 'Benchmarking',
    oneLiner: 'Compare leaders across nomination categories side-by-side.',
    bullets: [
      'Pick speakers for events',
      'Identify category leaders by region or role',
      'Build advisory board shortlists',
    ],
    caseStudySlugs: ['case-1-fl-optometrist-dinner', 'case-2-seco-discussion'],
  },
  {
    tab: 'Sociometric Leaders',
    oneLiner: 'See KOLs grouped by influencer type — National Leaders, Rising Stars, Regional Leaders, and more.',
    bullets: [
      'Find Rising Stars worth cultivating',
      'Pair established National Leaders with emerging voices',
      'Understand how the KOL universe is structured by influence tier',
    ],
    caseStudySlugs: ['case-3-seco-rising-stars', 'case-4-nynj-symposium'],
  },
  {
    tab: 'Total Weighted Score',
    oneLiner: 'Blend multiple nomination signals into one composite score, weighted to your priorities.',
    bullets: [
      'Surface KOLs strong across multiple dimensions, not just one',
      'Combine reputation signals (Trade Pubs + National Leader, etc.)',
      'Run "what-if" weight scenarios for speaker selection',
    ],
    caseStudySlugs: ['case-5-trade-and-national'],
  },
  {
    tab: 'KOL Explorer',
    oneLiner: 'Browse the full KOL list with sortable scores per segment.',
    bullets: [
      'Find a specific HCP by name or NPI',
      'Drill into any KOL profile to see their nominators',
      'Filter the full universe by demographic + score criteria',
    ],
    caseStudySlugs: [],
  },
  {
    tab: 'Demographics',
    oneLiner: 'Understand the demographic mix of who\'s nominating KOLs.',
    bullets: [
      'Confirm your respondent panel matches your target audience',
      'Compare nominator profiles across filter slices',
      'Spot gaps in coverage (e.g. underrepresented specialties)',
    ],
    caseStudySlugs: [],
  },
];
