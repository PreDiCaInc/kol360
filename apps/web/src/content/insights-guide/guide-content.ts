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
 * Ticket: docs/findings/insights-use-case-guide-presentation-2026-06-24.md
 */

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
