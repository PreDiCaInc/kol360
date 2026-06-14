/**
 * v1.17.40 — Single source of truth for the scoreSurvey + compositeScore
 * methodology. Both backend (kol-analysis.service.ts) and frontend
 * (score-tooltip component) read from this module so the formula and
 * the explainer cannot drift apart.
 *
 * Why this exists: prior to 4.1.20 the formula was buried in the
 * service. Customer's analyst saw scoreSurvey=100 for one HCP and
 * scoreSurvey=0 for another, with no in-product path to understanding
 * why. This module surfaces the math.
 *
 * Background: docs/findings/score-survey-formula-match-customer-2026-06-14.md.
 */

/**
 * Nomination types that contribute to scoreSurvey. Matches Sun Pharma's
 * published "Total Sociometric Weighted Score" methodology.
 *
 * Reproduces the customer's reference file to the 2nd decimal across
 * 2,301 HCPs (csv/Sun Pharma Sociometric Score Calculations.xlsx).
 */
export const SURVEY_INCLUDED_NOMINATION_TYPES = [
  'NATIONAL_LEADER',
  'DISCUSSION_LEADERS',
  'ADVICE_LEADERS',
  'RISING_STAR',
] as const;

/**
 * Nomination types that DO NOT contribute to scoreSurvey. The customer's
 * analytics intentionally drops these; an HCP whose nominations land
 * entirely in these categories will have scoreSurvey=0.
 */
export const SURVEY_EXCLUDED_NOMINATION_TYPES = [
  'REFERRAL_LEADERS',
  'SOCIAL_LEADER',
  'BIASED_LEADER',
  'REGIONAL_LEADER',
] as const;

const NOMINATION_TYPE_LABELS: Record<string, string> = {
  NATIONAL_LEADER: 'National Leader',
  DISCUSSION_LEADERS: 'Discussion Leaders',
  ADVICE_LEADERS: 'Advice Leaders',
  RISING_STAR: 'Rising Star',
  REFERRAL_LEADERS: 'Referral Leaders',
  SOCIAL_LEADER: 'Social Leader',
  BIASED_LEADER: 'Biased Leader',
  REGIONAL_LEADER: 'Regional Leader',
};

export function nominationTypeLabel(t: string): string {
  return NOMINATION_TYPE_LABELS[t] ?? t;
}

const includedLabels = SURVEY_INCLUDED_NOMINATION_TYPES.map(nominationTypeLabel).join(', ');
const excludedLabels = SURVEY_EXCLUDED_NOMINATION_TYPES.map(nominationTypeLabel).join(', ');

/**
 * Tooltip text for the Survey Score column header on every Insights
 * surface. Names the included + excluded categories explicitly so the
 * "why is X=100 and Y=0?" question is answerable in-product.
 */
export const SURVEY_SCORE_TOOLTIP =
  `Sum of nominations across the counted leadership categories, normalized so the top KOL in this analysis = 100.\n\n` +
  `Counted (${SURVEY_INCLUDED_NOMINATION_TYPES.length}): ${includedLabels}.\n\n` +
  `Not counted: ${excludedLabels}.\n\n` +
  `Formula: (sum of counted-type nominations) ÷ (max-such-sum across HCPs) × 100.`;

/**
 * Tooltip text for the Composite Score column header. Default-weight
 * blend; per-analysis weights may differ if the admin overrode them in
 * the analysis config.
 */
export const COMPOSITE_SCORE_TOOLTIP =
  `Weighted blend of segment scores (0–100 each). Default weights:\n\n` +
  `• Publications 10%\n` +
  `• Clinical Trials 15%\n` +
  `• Trade Publications 10%\n` +
  `• Organizational Leadership 10%\n` +
  `• Organizational Awards 10%\n` +
  `• Conference Activity 10%\n` +
  `• Social Media 5%\n` +
  `• Media (Podcasts/Blogs) 5%\n` +
  `• Sociometric Survey 25%\n\n` +
  `Per-analysis weights may differ if overridden in the analysis config.`;

/**
 * Tooltip text for each per-category nomination column. Used both on
 * the Sociometric Summary matrix (raw nomination counts) and on the
 * KOL Explorer score columns (per-category-max-normalized scores).
 * The wording stays neutral on count-vs-score so the same component
 * works on both surfaces.
 */
export const PER_CATEGORY_SCORE_TOOLTIP =
  `Nominations received in this leadership category.\n\n` +
  `Only some categories contribute to the Survey Score — hover the Survey Score column header to see which counted categories are included.`;
