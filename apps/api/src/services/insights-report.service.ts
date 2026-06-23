import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { logger } from '../lib/logger';
import {
  InsightsFilter,
  LeaderRankingQuery,
  InsightsSummary,
  KolExplorerResponse,
  KolExplorerItem,
  LeaderRankingsResponse,
  LeaderRankingItem,
  KolProfile,
  KolProfileWithNominators,
  NominatorItem,
  NominatorDemographics,
  SociometricSummaryResponse,
  SociometricSummaryItem,
  DistributionItem,
  NOMINATION_TYPES,
  NominationType,
} from '@kol360/shared';

// Map nomination type enum to score field names
const NOMINATION_TYPE_FIELDS: Record<NominationType, { score: string; count: string }> = {
  DISCUSSION_LEADERS: { score: 'scoreDiscussionLeaders', count: 'countDiscussionLeaders' },
  REFERRAL_LEADERS: { score: 'scoreReferralLeaders', count: 'countReferralLeaders' },
  ADVICE_LEADERS: { score: 'scoreAdviceLeaders', count: 'countAdviceLeaders' },
  NATIONAL_LEADER: { score: 'scoreNationalLeader', count: 'countNationalLeader' },
  RISING_STAR: { score: 'scoreRisingStar', count: 'countRisingStar' },
  SOCIAL_LEADER: { score: 'scoreSocialLeader', count: 'countSocialLeader' },
  REGIONAL_LEADER: { score: 'scoreRegionalLeader', count: 'countRegionalLeader' },
  BIASED_LEADER: { score: 'scoreBiasedLeader', count: 'countBiasedLeader' },
};

/**
 * INFLUENCER TYPE CLASSIFICATION THRESHOLDS
 *
 * Live values live in the `InfluencerThreshold` table (singleton row,
 * id='default'). Edit them directly in DB (Prisma Studio for test,
 * psql for prod) to tune classification without a redeploy.
 *
 * The constants below are the seed defaults and the in-code fallback if
 * the row is somehow missing. Keep them in sync with the seed INSERT in
 * `20260528_add_influencer_threshold_table/migration.sql`.
 *
 * Classification logic:
 * - National Leaders: composite >= minComposite AND survey >= minSurvey
 * - Rising Stars:     survey >= minSurvey AND composite < maxComposite
 * - Regional Influencers: everyone else
 *
 * Score ranges: 0-100 (normalized scores).
 */
type InfluencerThresholds = {
  nationalLeader: { minCompositeScore: number; minSurveyScore: number };
  risingStar:     { minSurveyScore: number; maxCompositeScore: number };
};

const DEFAULT_INFLUENCER_THRESHOLDS: InfluencerThresholds = {
  nationalLeader: { minCompositeScore: 30, minSurveyScore: 50 },
  risingStar:     { minSurveyScore: 30, maxCompositeScore: 30 },
};

// Module-level cache for the InfluencerThreshold singleton — perf pass #7.
// Operational tuning (the prod-rel-4.1.7 documented `UPDATE` flow) tolerates
// up to 60s lag before new values propagate, which matches this TTL.
const INFLUENCER_THRESHOLDS_TTL_MS = 60_000;
let influencerThresholdsCache: { value: InfluencerThresholds; expiresAt: number } | null = null;

// Score row from HcpAnalysisScore, keyed by hcpId.
type AnalysisScoreRow = Prisma.HcpAnalysisScoreGetPayload<object>;
type ObjectiveRow = Prisma.HcpDiseaseAreaScoreGetPayload<object>;

// US 50 + DC. Used by getFilterOptions to filter out non-US state codes
// (Canadian provinces, country codes, etc.) that legacy NPI imports left
// scattered in the Hcp.state column. Hardcoded because all current
// customers are US-only; future per-client `region` setting can supersede.
const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC',
]);

/**
 * v1.17.5: shared respondent-filter shape. Drives:
 *   - getDemographics      (filters which respondents' answers feed the aggregations)
 *   - getLeaderRankings    (filters which nominations count toward leader rank)
 *   - getSociometricSummary (filters which nominations count toward sociometric counts)
 *
 * 4 categorical filters are multi-select; 3 are min/max range filters.
 * An empty/undefined filter on a field means "no filter on that field".
 * An empty Map / no-arg call to `hasAnyRespondentFilter()` means
 * "skip filtering entirely" (caller should use the pre-aggregated path
 * to avoid the live Nomination scan).
 */
export interface RespondentFilters {
  respondentRoles?: string[];
  coreFocuses?: string[];
  stateOfPractices?: string[];
  practiceSettings?: string[];
  yearsMin?: number;
  yearsMax?: number;
  monthlyPatientsMin?: number;
  monthlyPatientsMax?: number;
  dedPatientsMin?: number;
  dedPatientsMax?: number;
}

// v1.17.47 — parse the numeric portion of a "Decile N" label so
// distributions can be re-sorted into ordinal order (1 → 10) instead
// of the count-desc default applied by mapToDistribution /
// mapToSimpleDistribution. Returns 0 for malformed inputs so they
// land at the start (safe default; doesn't reorder valid deciles).
function decileNum(label: string): number {
  const m = /(\d+)/.exec(label);
  return m ? parseInt(m[1], 10) : 0;
}

function hasAnyRespondentFilter(f?: RespondentFilters): boolean {
  if (!f) return false;
  return (
    (f.respondentRoles?.length ?? 0) > 0 ||
    (f.coreFocuses?.length ?? 0) > 0 ||
    (f.stateOfPractices?.length ?? 0) > 0 ||
    (f.practiceSettings?.length ?? 0) > 0 ||
    f.yearsMin !== undefined ||
    f.yearsMax !== undefined ||
    f.monthlyPatientsMin !== undefined ||
    f.monthlyPatientsMax !== undefined ||
    f.dedPatientsMin !== undefined ||
    f.dedPatientsMax !== undefined
  );
}

/**
 * Thrown by analysis-backed read methods when clientId is omitted. The route
 * layer catches this and returns 400. Replaces the prior silent-zero
 * behavior where an omitted clientId looked indistinguishable from "this
 * (client, DA) has no analysis configured" — that ambiguity hid 5 latent
 * prop-forwarding bugs on the Insights Dashboard for ~2 months.
 */
export class MissingClientIdError extends Error {
  constructor() {
    super('clientId is required for analysis-backed insights endpoints');
    this.name = 'MissingClientIdError';
  }
}

export class InsightsReportService {
  /**
   * Resolve the curated KolAnalysis for a (client, disease area).
   * Throws MissingClientIdError when clientId is absent (programming error;
   * route maps it to 400). Returns null when clientId is present but no
   * analysis exists — callers render "not configured".
   */
  private async resolveAnalysis(
    clientId: string | undefined,
    diseaseAreaId: string
  ): Promise<{ id: string } | null> {
    if (!clientId) throw new MissingClientIdError();
    return prisma.kolAnalysis.findUnique({
      where: { clientId_diseaseAreaId: { clientId, diseaseAreaId } },
      select: { id: true },
    });
  }

  /** Analysis (survey/composite/per-type) scores keyed by hcpId. */
  private async loadAnalysisScores(
    analysisId: string
  ): Promise<Map<string, AnalysisScoreRow>> {
    const rows = await prisma.hcpAnalysisScore.findMany({ where: { analysisId } });
    return new Map(rows.map((r) => [r.hcpId, r]));
  }

  /** Included campaign IDs for an analysis (the curated, pooled set). */
  private async loadIncludedCampaignIds(analysisId: string): Promise<string[]> {
    const links = await prisma.kolAnalysisCampaign.findMany({
      where: { analysisId, included: true },
      select: { campaignId: true },
    });
    return links.map((l) => l.campaignId);
  }

  /**
   * v1.17.50 — campaigns accessible to (clientId, diseaseAreaId) for
   * dashboard-level aggregation: the UNION of
   *   (a) campaigns owned by this client in this DA, AND
   *   (b) campaigns INCLUDED in this (client, DA) KolAnalysis
   * (which can come from OTHER clients, esp. for lite clients).
   *
   * Why this exists: pre-4.1.30 getSummary / getDemographics /
   * getKolNominationMetadata scoped only by (a). Lite clients own 0
   * campaigns by design, so every dashboard stat read 0 even when
   * their KolAnalysis included 6+ campaigns from real clients. This
   * helper unifies the access surface so lite + regular clients both
   * see the right aggregation.
   *
   * For regular clients with both owned + included sets, this is a
   * UNION — they keep seeing their owned campaigns AND get any cross-
   * client included ones surfaced (rare but architecturally consistent).
   */
  private async resolveAccessibleCampaignIds(
    clientId: string,
    diseaseAreaId: string
  ): Promise<string[]> {
    const [ownedRows, analysis] = await Promise.all([
      prisma.campaign.findMany({
        where: { clientId, diseaseAreaId },
        select: { id: true },
      }),
      prisma.kolAnalysis.findUnique({
        where: { clientId_diseaseAreaId: { clientId, diseaseAreaId } },
        select: { id: true },
      }),
    ]);
    const ids = new Set(ownedRows.map((r) => r.id));
    if (analysis) {
      const includedLinks = await prisma.kolAnalysisCampaign.findMany({
        where: { analysisId: analysis.id, included: true },
        select: { campaignId: true },
      });
      for (const l of includedLinks) ids.add(l.campaignId);
    }
    return [...ids];
  }

  /**
   * Live objective scores (Publications…MediaPodcasts) for HCPs in a DA.
   * Objective data is NOT stored on the analysis — read live so re-uploads
   * flow through (locked decision).
   */
  private async loadObjectiveScores(
    hcpIds: string[],
    diseaseAreaId: string
  ): Promise<Map<string, ObjectiveRow>> {
    if (hcpIds.length === 0) return new Map();
    const rows = await prisma.hcpDiseaseAreaScore.findMany({
      where: { hcpId: { in: hcpIds }, diseaseAreaId, isCurrent: true },
    });
    return new Map(rows.map((r) => [r.hcpId, r]));
  }

  /**
   * v1.17.42 — data-team-managed influencer-type classification
   * per (HCP, disease area). Replaces the computed
   * determineInfluencerType() output. When the manual value is unset
   * for an HCP, the column reads empty (null) in the response — no
   * algorithmic fallback. Loaded once per request for cheap
   * per-HCP lookup in the read loops.
   */
  private async loadManualInfluencerTypes(
    hcpIds: string[],
    diseaseAreaId: string,
  ): Promise<Map<string, string>> {
    if (hcpIds.length === 0) return new Map();
    const rows = await prisma.hcpDiseaseArea.findMany({
      where: { hcpId: { in: hcpIds }, diseaseAreaId },
      select: { hcpId: true, influencerType: true },
    });
    const out = new Map<string, string>();
    for (const r of rows) {
      if (r.influencerType) out.set(r.hcpId, r.influencerType);
    }
    return out;
  }

  /**
   * v1.17.5 / v1.17.50: companion to getFilteredResponseIds. Given a
   * set of response IDs that pass respondent filters, count nominations
   * per HCP per nomination-type, restricted to nominations whose
   * responseId is in the set. Used by getLeaderRankings +
   * getSociometricSummary to recompute per-type counts on the fly when
   * respondent filters are active (bypassing the pre-aggregated
   * HcpAnalysisScore counts).
   *
   * Returns: hcpId -> (nominationType -> count). HCPs with zero filtered
   * nominations don't appear in the map.
   */
  private async computeRespondentFilteredCounts(
    filteredResponseIds: Set<string>
  ): Promise<Map<string, Map<NominationType, number>>> {
    if (filteredResponseIds.size === 0) return new Map();

    const nominations = await prisma.nomination.findMany({
      where: {
        responseId: { in: [...filteredResponseIds] },
        matchStatus: { in: ['MATCHED', 'NEW_HCP'] },
        matchedHcpId: { not: null },
      },
      select: {
        matchedHcpId: true,
        question: { select: { nominationType: true } },
      },
    });

    const counts = new Map<string, Map<NominationType, number>>();
    for (const n of nominations) {
      if (!n.matchedHcpId) continue;
      const type = n.question.nominationType as NominationType;
      let perType = counts.get(n.matchedHcpId);
      if (!perType) {
        perType = new Map<NominationType, number>();
        counts.set(n.matchedHcpId, perType);
      }
      perType.set(type, (perType.get(type) ?? 0) + 1);
    }
    return counts;
  }

  /**
   * v1.17.50 (perf-pass-C #1): single-SQL replacement for the
   * loadAnswersForRespondentFilter → computeFilteredResponseIds chain.
   *
   * The old chain:
   *   1. Fetched ALL SurveyResponseAnswer rows in scope (~10K+ on prod,
   *      with answerJson + nested question/response objects — multi-MB
   *      payload) via Prisma.
   *   2. Ran 7 sequential JS filter passes building successive Sets.
   *   3. Returned the intersection.
   *
   * Profiling on prod (per pteam ticket 2026-06-16): 2-9s per request,
   * dominated by payload transfer + JS aggregation, not SQL execution
   * time itself.
   *
   * This rewrite collapses both steps into one $queryRaw that returns
   * just the matching responseId set. Each active filter becomes one
   * EXISTS clause; inactive filters are spliced out entirely (no
   * runtime cost). Estimated 2-5× faster on the filter-active path,
   * with payload dropped to a small CUID-string set.
   *
   * Semantics MUST match computeFilteredResponseIds exactly — see the
   * v1.17.30 Core Focus fix and the v1.17.5 history. Question-text
   * matches reproduce the JS `.toLowerCase().includes(...)` checks as
   * `LOWER(...) LIKE '%...%'`. Numeric extraction matches parseNumber's
   * "strip non-digit-dot, only cast if shape is valid" guard.
   *
   * Scoped to:
   *   - included campaign IDs
   *   - status = 'COMPLETED'
   *   - excludeInternalEmails: if ANY included campaign has the flag
   *     on, apply globally (matches old loadAnswersForRespondentFilter
   *     uniform-global behavior; differs from getDemographics dedup
   *     path which honors each campaign's flag separately).
   */
  private async getFilteredResponseIds(
    filters: RespondentFilters,
    includedCampaignIds: string[]
  ): Promise<Set<string>> {
    if (includedCampaignIds.length === 0) return new Set();

    const campaigns = await prisma.campaign.findMany({
      where: { id: { in: includedCampaignIds } },
      select: { excludeInternalEmails: true },
    });
    const excludeInternal = campaigns.some((c) => c.excludeInternalEmails);

    // Build active-filter clauses. Inactive dimensions contribute
    // nothing to the WHERE.
    const conditions: Prisma.Sql[] = [];

    // categorical: respondentRoles → "primary medical specialty" question
    if (filters.respondentRoles && filters.respondentRoles.length > 0) {
      conditions.push(Prisma.sql`
        EXISTS (
          SELECT 1
          FROM "SurveyResponseAnswer" a
          JOIN "SurveyQuestion" q ON q.id = a."questionId"
          JOIN "Question" qq ON qq.id = q."questionId"
          WHERE a."responseId" = sr.id
            AND LOWER(q."questionTextSnapshot") LIKE '%primary medical specialty%'
            AND COALESCE(
              CASE WHEN qq.type = 'SINGLE_CHOICE' THEN a."answerJson"->>'selected' END,
              a."answerText"
            ) = ANY(${filters.respondentRoles}::text[])
        )
      `);
    }

    // categorical (MULTI/SINGLE-CHOICE): coreFocuses → "core focus" question
    if (filters.coreFocuses && filters.coreFocuses.length > 0) {
      conditions.push(Prisma.sql`
        EXISTS (
          SELECT 1
          FROM "SurveyResponseAnswer" a
          JOIN "SurveyQuestion" q ON q.id = a."questionId"
          JOIN "Question" qq ON qq.id = q."questionId"
          WHERE a."responseId" = sr.id
            AND LOWER(q."questionTextSnapshot") LIKE '%core focus%'
            AND (
              (qq.type = 'MULTI_CHOICE' AND EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(
                  COALESCE(a."answerJson"->'selected', '[]'::jsonb)
                ) x WHERE x = ANY(${filters.coreFocuses}::text[])
              ))
              OR (qq.type <> 'MULTI_CHOICE' AND COALESCE(
                CASE WHEN qq.type = 'SINGLE_CHOICE' THEN a."answerJson"->>'selected' END,
                a."answerText"
              ) = ANY(${filters.coreFocuses}::text[]))
            )
        )
      `);
    }

    // categorical: stateOfPractices → Hcp.state (not an answer)
    if (filters.stateOfPractices && filters.stateOfPractices.length > 0) {
      conditions.push(Prisma.sql`rh.state = ANY(${filters.stateOfPractices}::text[])`);
    }

    // categorical (MULTI/SINGLE-CHOICE): practiceSettings → "practice setting" question
    if (filters.practiceSettings && filters.practiceSettings.length > 0) {
      conditions.push(Prisma.sql`
        EXISTS (
          SELECT 1
          FROM "SurveyResponseAnswer" a
          JOIN "SurveyQuestion" q ON q.id = a."questionId"
          JOIN "Question" qq ON qq.id = q."questionId"
          WHERE a."responseId" = sr.id
            AND LOWER(q."questionTextSnapshot") LIKE '%practice setting%'
            AND (
              (qq.type = 'MULTI_CHOICE' AND EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(
                  COALESCE(a."answerJson"->'selected', '[]'::jsonb)
                ) x WHERE x = ANY(${filters.practiceSettings}::text[])
              ))
              OR (qq.type <> 'MULTI_CHOICE' AND COALESCE(
                CASE WHEN qq.type = 'SINGLE_CHOICE' THEN a."answerJson"->>'selected' END,
                a."answerText"
              ) = ANY(${filters.practiceSettings}::text[]))
            )
        )
      `);
    }

    // numeric range: years → "years"+"practice" question
    if (filters.yearsMin !== undefined || filters.yearsMax !== undefined) {
      const yMin = filters.yearsMin ?? null;
      const yMax = filters.yearsMax ?? null;
      conditions.push(Prisma.sql`
        EXISTS (
          SELECT 1
          FROM "SurveyResponseAnswer" a
          JOIN "SurveyQuestion" q ON q.id = a."questionId"
          WHERE a."responseId" = sr.id
            AND LOWER(q."questionTextSnapshot") LIKE '%years%'
            AND LOWER(q."questionTextSnapshot") LIKE '%practice%'
            AND CASE
              WHEN REGEXP_REPLACE(COALESCE(a."answerText", ''), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
              THEN REGEXP_REPLACE(COALESCE(a."answerText", ''), '[^0-9.]', '', 'g')::numeric
              ELSE NULL
            END IS NOT NULL
            AND (${yMin}::numeric IS NULL OR CASE
              WHEN REGEXP_REPLACE(COALESCE(a."answerText", ''), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
              THEN REGEXP_REPLACE(COALESCE(a."answerText", ''), '[^0-9.]', '', 'g')::numeric
              ELSE NULL
            END >= ${yMin}::numeric)
            AND (${yMax}::numeric IS NULL OR CASE
              WHEN REGEXP_REPLACE(COALESCE(a."answerText", ''), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
              THEN REGEXP_REPLACE(COALESCE(a."answerText", ''), '[^0-9.]', '', 'g')::numeric
              ELSE NULL
            END <= ${yMax}::numeric)
        )
      `);
    }

    // numeric range: monthly patients → "how many patients" NOT "dry eye"
    if (filters.monthlyPatientsMin !== undefined || filters.monthlyPatientsMax !== undefined) {
      const mMin = filters.monthlyPatientsMin ?? null;
      const mMax = filters.monthlyPatientsMax ?? null;
      conditions.push(Prisma.sql`
        EXISTS (
          SELECT 1
          FROM "SurveyResponseAnswer" a
          JOIN "SurveyQuestion" q ON q.id = a."questionId"
          WHERE a."responseId" = sr.id
            AND LOWER(q."questionTextSnapshot") LIKE '%how many patients%'
            AND LOWER(q."questionTextSnapshot") NOT LIKE '%dry eye%'
            AND CASE
              WHEN REGEXP_REPLACE(COALESCE(a."answerText", ''), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
              THEN REGEXP_REPLACE(COALESCE(a."answerText", ''), '[^0-9.]', '', 'g')::numeric
              ELSE NULL
            END IS NOT NULL
            AND (${mMin}::numeric IS NULL OR CASE
              WHEN REGEXP_REPLACE(COALESCE(a."answerText", ''), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
              THEN REGEXP_REPLACE(COALESCE(a."answerText", ''), '[^0-9.]', '', 'g')::numeric
              ELSE NULL
            END >= ${mMin}::numeric)
            AND (${mMax}::numeric IS NULL OR CASE
              WHEN REGEXP_REPLACE(COALESCE(a."answerText", ''), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
              THEN REGEXP_REPLACE(COALESCE(a."answerText", ''), '[^0-9.]', '', 'g')::numeric
              ELSE NULL
            END <= ${mMax}::numeric)
        )
      `);
    }

    // numeric range: dry-eye patients → "dry eye" AND "patient"
    if (filters.dedPatientsMin !== undefined || filters.dedPatientsMax !== undefined) {
      const dMin = filters.dedPatientsMin ?? null;
      const dMax = filters.dedPatientsMax ?? null;
      conditions.push(Prisma.sql`
        EXISTS (
          SELECT 1
          FROM "SurveyResponseAnswer" a
          JOIN "SurveyQuestion" q ON q.id = a."questionId"
          WHERE a."responseId" = sr.id
            AND LOWER(q."questionTextSnapshot") LIKE '%dry eye%'
            AND LOWER(q."questionTextSnapshot") LIKE '%patient%'
            AND CASE
              WHEN REGEXP_REPLACE(COALESCE(a."answerText", ''), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
              THEN REGEXP_REPLACE(COALESCE(a."answerText", ''), '[^0-9.]', '', 'g')::numeric
              ELSE NULL
            END IS NOT NULL
            AND (${dMin}::numeric IS NULL OR CASE
              WHEN REGEXP_REPLACE(COALESCE(a."answerText", ''), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
              THEN REGEXP_REPLACE(COALESCE(a."answerText", ''), '[^0-9.]', '', 'g')::numeric
              ELSE NULL
            END >= ${dMin}::numeric)
            AND (${dMax}::numeric IS NULL OR CASE
              WHEN REGEXP_REPLACE(COALESCE(a."answerText", ''), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
              THEN REGEXP_REPLACE(COALESCE(a."answerText", ''), '[^0-9.]', '', 'g')::numeric
              ELSE NULL
            END <= ${dMax}::numeric)
        )
      `);
    }

    const filterFrag = conditions.length === 0
      ? Prisma.empty
      : Prisma.sql` AND ${Prisma.join(conditions, ' AND ')}`;
    const excludeFrag = excludeInternal
      ? Prisma.sql` AND (rh.email IS NULL OR rh.email NOT LIKE '%@bio-exec.com')`
      : Prisma.empty;

    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT sr.id
      FROM "SurveyResponse" sr
      LEFT JOIN "Hcp" rh ON rh.id = sr."respondentHcpId"
      WHERE sr."campaignId" IN (${Prisma.join(includedCampaignIds)})
        AND sr.status = 'COMPLETED'
        ${excludeFrag}
        ${filterFrag}
    `;
    return new Set(rows.map((r) => r.id));
  }

  /**
   * Get summary stats for a disease area (analysis-backed).
   */
  async getSummary(diseaseAreaId: string, clientId?: string): Promise<InsightsSummary> {
    try {
      const analysis = await this.resolveAnalysis(clientId, diseaseAreaId);
      if (!analysis) {
        return {
          totalKols: 0,
          totalRespondents: 0,
          totalNominations: 0,
          totalCampaigns: 0,
          averageCompositeScore: null,
          notConfigured: true,
        };
      }

      // v1.17.50: accessible campaigns = owned UNION analysis-included.
      // Old behavior scoped by owned-only, which broke lite clients (own
      // 0 campaigns). See resolveAccessibleCampaignIds doc.
      const campaignIds = await this.resolveAccessibleCampaignIds(clientId!, diseaseAreaId);
      const noCampaigns = campaignIds.length === 0;

      const [scoreAgg, totalNominations, totalRespondentsRow] = await Promise.all([
        // KOL count + avg composite from the analysis's scores.
        prisma.hcpAnalysisScore.aggregate({
          where: { analysisId: analysis.id },
          _count: { _all: true },
          _avg: { compositeScore: true },
        }),
        noCampaigns
          ? Promise.resolve(0)
          : prisma.nomination.count({
              where: { response: { campaignId: { in: campaignIds } } },
            }),
        // totalRespondents — one row per respondent (most-recent completed
        // response per HCP), with each campaign's own excludeInternalEmails
        // flag honored. Matches getDemographics' definition so the top tile
        // and the Demographics-tab header agree. See PR notes on the
        // dedup rule for the "most-recent SurveyResponse per respondent;
        // all dimensions derived from THAT one response" semantic.
        noCampaigns
          ? Promise.resolve([{ total: 0 }] as { total: number }[])
          : prisma.$queryRaw<{ total: number }[]>`
              SELECT COUNT(*)::int AS total
              FROM (
                SELECT DISTINCT ON (sr."respondentHcpId") sr.id
                FROM "SurveyResponse" sr
                JOIN "Campaign" c ON c.id = sr."campaignId"
                LEFT JOIN "Hcp" h ON h.id = sr."respondentHcpId"
                WHERE sr."campaignId" IN (${Prisma.join(campaignIds)})
                  AND sr.status = 'COMPLETED'
                  AND (
                    c."excludeInternalEmails" = false
                    OR h.email IS NULL
                    OR h.email NOT LIKE '%@bio-exec.com'
                  )
                ORDER BY sr."respondentHcpId", sr."completedAt" DESC NULLS LAST
              ) latest_per_respondent
            `,
      ]);

      return {
        totalKols: scoreAgg._count._all,
        totalRespondents: totalRespondentsRow[0]?.total ?? 0,
        totalNominations,
        totalCampaigns: campaignIds.length,
        averageCompositeScore: scoreAgg._avg.compositeScore
          ? Number(scoreAgg._avg.compositeScore)
          : null,
      };
    } catch (error) {
      logger.error('Error fetching insights summary', { diseaseAreaId, error });
      throw error;
    }
  }

  /**
   * Get KOL Explorer data - paginated list of all KOLs with their scores
   */
  async getKolExplorer(
    diseaseAreaId: string,
    filters: InsightsFilter,
    clientId?: string
  ): Promise<KolExplorerResponse> {
    try {
      const {
        page, limit, sortBy, sortOrder, search, specialty, state,
        specialties, states, influencerType, influencerTypes, ...scoreFilters
      } = filters;

      const emptyPage: KolExplorerResponse = {
        items: [], total: 0, page, limit, totalPages: 0,
      };

      const analysis = await this.resolveAnalysis(clientId, diseaseAreaId);
      if (!analysis) return emptyPage;

      // Analysis defines the HCP set + survey/composite; objective scores
      // are joined live from HcpDiseaseAreaScore. With two tables we can't
      // do mixed where/orderBy in one query — the analysis HCP set is
      // bounded (hundreds), so merge + filter + sort + paginate in app.
      const scoreMap = await this.loadAnalysisScores(analysis.id);
      const hcpIds = [...scoreMap.keys()];
      if (hcpIds.length === 0) return emptyPage;

      const [objMap, hcps, influencerTypeMap] = await Promise.all([
        this.loadObjectiveScores(hcpIds, diseaseAreaId),
        // Perf pass #6 (KOL Explorer): narrow from full Hcp row (~20 columns)
        // to the 7 actually consumed downstream. Specialties relation kept
        // for the primary-specialty join.
        prisma.hcp.findMany({
          where: { id: { in: hcpIds } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            specialty: true,
            city: true,
            state: true,
            npi: true,
            specialties: {
              where: { isPrimary: true },
              include: { specialty: true },
              take: 1,
            },
          },
        }),
        // v1.17.42 — data-team-managed influencer-type per (HCP, DA).
        this.loadManualInfluencerTypes(hcpIds, diseaseAreaId),
      ]);

      const num = (v: unknown): number | null => (v == null ? null : Number(v));
      const inRange = (v: number | null, min?: number, max?: number) => {
        if (min !== undefined && (v == null || v < min)) return false;
        if (max !== undefined && (v == null || v > max)) return false;
        return true;
      };
      const searchLc = search?.toLowerCase();
      const specSet = specialties && specialties.length > 0 ? new Set(specialties) : null;
      const stateSet = states && states.length > 0 ? new Set(states) : null;
      // v1.17.42 — thresholds no longer loaded here; manual map
      // (influencerTypeMap above) is the source of truth.
      const influencerTypeFilter =
        influencerTypes && influencerTypes.length > 0
          ? influencerTypes
          : influencerType
            ? [influencerType]
            : null;

      type Row = KolExplorerItem & { _sortName: string; _sortSpecialty: string };
      const rows: Row[] = [];

      for (const hcp of hcps) {
        const a = scoreMap.get(hcp.id);
        if (!a) continue;
        const o = objMap.get(hcp.id);

        // HCP attribute filters
        if (searchLc) {
          const fullName = `${hcp.firstName} ${hcp.lastName}`.toLowerCase();
          const hit =
            fullName.includes(searchLc) ||
            (hcp.npi ?? '').includes(search!);
          if (!hit) continue;
        }
        if (specSet && !(hcp.specialty && specSet.has(hcp.specialty))) continue;
        else if (!specSet && specialty && hcp.specialty !== specialty) continue;
        if (stateSet && !(hcp.state && stateSet.has(hcp.state))) continue;
        else if (!stateSet && state && hcp.state !== state) continue;

        const scorePublications = num(o?.scorePublications);
        const scoreTradePubs = num(o?.scoreTradePubs);
        const scoreOrgLeadership = num(o?.scoreOrgLeadership);
        const scoreOrgAwards = num(o?.scoreOrgAwards);
        const scoreClinicalTrials = num(o?.scoreClinicalTrials);
        const scoreConference = num(o?.scoreConference);
        const scoreSocialMedia = num(o?.scoreSocialMedia);
        const scoreMediaPodcasts = num(o?.scoreMediaPodcasts);
        const scoreSurvey = num(a.scoreSurvey);
        const compositeScore = num(a.compositeScore);

        // Score-range filters (objective live, survey/composite from analysis)
        if (!inRange(scorePublications, scoreFilters.scorePublicationsMin, scoreFilters.scorePublicationsMax)) continue;
        if (!inRange(scoreTradePubs, scoreFilters.scoreTradePubsMin, scoreFilters.scoreTradePubsMax)) continue;
        if (!inRange(scoreOrgLeadership, scoreFilters.scoreOrgLeadershipMin, scoreFilters.scoreOrgLeadershipMax)) continue;
        if (!inRange(scoreOrgAwards, scoreFilters.scoreOrgAwardsMin, scoreFilters.scoreOrgAwardsMax)) continue;
        if (!inRange(scoreClinicalTrials, scoreFilters.scoreClinicalTrialsMin, scoreFilters.scoreClinicalTrialsMax)) continue;
        if (!inRange(scoreConference, scoreFilters.scoreConferenceMin, scoreFilters.scoreConferenceMax)) continue;
        if (!inRange(scoreSocialMedia, scoreFilters.scoreSocialMediaMin, scoreFilters.scoreSocialMediaMax)) continue;
        if (!inRange(scoreMediaPodcasts, scoreFilters.scoreMediaPodcastsMin, scoreFilters.scoreMediaPodcastsMax)) continue;
        if (!inRange(scoreSurvey, scoreFilters.scoreSurveyMin, scoreFilters.scoreSurveyMax)) continue;
        if (!inRange(compositeScore, scoreFilters.compositeScoreMin, scoreFilters.compositeScoreMax)) continue;

        const primarySpecialty =
          hcp.specialties[0]?.specialty?.name || hcp.specialty;
        // v1.17.42 — manual classification (data-team-managed). No
        // algorithmic fallback: missing entries read as null. The
        // pteam-loaded CSV per disease area populates this.
        const influencerTypeVal = influencerTypeMap.get(hcp.id) ?? null;
        if (
          influencerTypeFilter &&
          (!influencerTypeVal || !influencerTypeFilter.includes(influencerTypeVal))
        ) {
          continue;
        }

        rows.push({
          id: hcp.id,
          npi: hcp.npi, // v1.17.32: surfaced for the full-list export
          name: `${hcp.firstName} ${hcp.lastName}`,
          firstName: hcp.firstName,
          lastName: hcp.lastName,
          specialty: primarySpecialty,
          // v1.15.31: post canonical-flip the field-form 'Ophthalmology' is what
          // the API returns; the .includes() matches both 'Ophthalmolog' (current)
          // and the legacy 'Ophthalmologist' shape so any residual data still
          // buckets correctly.
          degree: primarySpecialty?.includes('Ophthalmolog') ? 'MD' : 'OD',
          city: hcp.city,
          state: hcp.state,
          influencerType: influencerTypeVal,
          scorePublications,
          scoreTradePubs,
          scoreOrgLeadership,
          scoreOrgAwards,
          scoreClinicalTrials,
          scoreConference,
          scoreSocialMedia,
          scoreMediaPodcasts,
          scoreSurvey,
          compositeScore,
          _sortName: `${hcp.lastName} ${hcp.firstName}`.toLowerCase(),
          _sortSpecialty: (primarySpecialty ?? '').toLowerCase(),
        });
      }

      const VALID_SCORE_FIELDS = new Set([
        'compositeScore', 'scorePublications', 'scoreTradePubs',
        'scoreOrgLeadership', 'scoreOrgAwards', 'scoreClinicalTrials',
        'scoreConference', 'scoreSocialMedia', 'scoreMediaPodcasts',
        'scoreSurvey',
      ]);
      const dir = sortOrder === 'asc' ? 1 : -1;
      rows.sort((x, y) => {
        if (sortBy === 'name') return x._sortName < y._sortName ? -dir : x._sortName > y._sortName ? dir : 0;
        if (sortBy === 'specialty') return x._sortSpecialty < y._sortSpecialty ? -dir : x._sortSpecialty > y._sortSpecialty ? dir : 0;
        const field = sortBy && VALID_SCORE_FIELDS.has(sortBy) ? sortBy : 'compositeScore';
        const xv = (x[field as keyof KolExplorerItem] as number | null) ?? -Infinity;
        const yv = (y[field as keyof KolExplorerItem] as number | null) ?? -Infinity;
        return xv < yv ? -dir : xv > yv ? dir : 0;
      });

      const total = rows.length;
      const start = (page - 1) * limit;
      const items: KolExplorerItem[] = rows
        .slice(start, start + limit)
        .map(({ _sortName, _sortSpecialty, ...item }) => item);

      return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
    } catch (error) {
      logger.error('Error fetching KOL explorer data', { diseaseAreaId, filters, error });
      throw error;
    }
  }

  /**
   * Get leader rankings by nomination type.
   *
   * v1.17.5: when `respondentFilters` is provided, counts are recomputed
   * on the fly from filtered nominations (bypassing the pre-aggregated
   * HcpAnalysisScore counts). When omitted, uses the fast pre-aggregated
   * path. Influencer-type classification still comes from the analysis's
   * scoreMap (the score itself isn't recomputed under a respondent filter
   * — that would require a full pooled re-normalization).
   */
  async getLeaderRankings(
    diseaseAreaId: string,
    query: LeaderRankingQuery,
    clientId?: string,
    respondentFilters?: RespondentFilters
  ): Promise<LeaderRankingsResponse> {
    try {
    const { nominationType, page, limit, specialty, state, specialties, states } = query;

    const empty: LeaderRankingsResponse = {
      nominationType, items: [], total: 0, page, limit, totalPages: 0,
    };

    const analysis = await this.resolveAnalysis(clientId, diseaseAreaId);
    if (!analysis) return empty;

    const countField = NOMINATION_TYPE_FIELDS[nominationType].count as
      keyof AnalysisScoreRow;
    const scoreMap = await this.loadAnalysisScores(analysis.id);

    let ranked: Array<{ hcpId: string; count: number; score: AnalysisScoreRow | undefined }>;
    if (hasAnyRespondentFilter(respondentFilters)) {
      // Recompute counts from filtered nominations.
      // v1.17.50: getFilteredResponseIds collapses the prior
      // loadAnswersForRespondentFilter → computeFilteredResponseIds
      // pair into one SQL query (perf-pass-C #1).
      const includedCampaignIds = await this.loadIncludedCampaignIds(analysis.id);
      const filteredResponseIds = await this.getFilteredResponseIds(
        respondentFilters!,
        includedCampaignIds
      );
      if (filteredResponseIds.size === 0) return empty;
      const perHcpCounts = await this.computeRespondentFilteredCounts(filteredResponseIds);

      ranked = [...perHcpCounts.entries()]
        .map(([hcpId, perType]) => ({
          hcpId,
          count: perType.get(nominationType) ?? 0,
          // Keep the analysis-derived score row for influencer-type
          // classification downstream — may be undefined if the filtered
          // hcp isn't in the analysis (shouldn't happen since responses
          // are scoped to included campaigns, but defensive).
          score: scoreMap.get(hcpId),
        }))
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count);
    } else {
      // Fast path: pre-aggregated counts from HcpAnalysisScore.
      ranked = [...scoreMap.values()]
        .map((s) => ({ hcpId: s.hcpId, count: Number(s[countField] ?? 0), score: s }))
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count);
    }

    if (ranked.length === 0) return empty;

    const hcpWhere: Record<string, unknown> = {
      id: { in: ranked.map((r) => r.hcpId) },
    };
    if (specialties && specialties.length > 0) hcpWhere.specialty = { in: specialties };
    else if (specialty) hcpWhere.specialty = specialty;
    if (states && states.length > 0) hcpWhere.state = { in: states };
    else if (state) hcpWhere.state = state;

    // Perf pass #6 (Leader Rankings): narrow to the 6 fields consumed below.
    // v1.17.32: also npi (surfaced for the full-list export).
    const hcps = await prisma.hcp.findMany({
      where: hcpWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        specialty: true,
        city: true,
        state: true,
        npi: true,
        specialties: {
          where: { isPrimary: true },
          include: { specialty: true },
          take: 1,
        },
      },
    });
    const hcpMap = new Map(hcps.map((h) => [h.id, h]));
    // v1.17.42 — manual influencer-type lookup. determineInfluencerType
    // is no longer the source; the data-team CSV upload populates this
    // map per (HCP, diseaseArea). Missing entries surface as null.
    const influencerTypeMap = await this.loadManualInfluencerTypes(
      hcps.map((h) => h.id),
      diseaseAreaId,
    );

    const rankedItems: LeaderRankingItem[] = [];
    let rank = 0;
    for (const r of ranked) {
      const hcp = hcpMap.get(r.hcpId);
      if (!hcp) continue; // filtered out by specialty/state
      rank++;
      const primarySpecialty = hcp.specialties[0]?.specialty?.name || hcp.specialty;
      rankedItems.push({
        rank,
        hcpId: hcp.id,
        npi: hcp.npi, // v1.17.32: surfaced for the full-list export
        name: `${hcp.firstName} ${hcp.lastName}`,
        // v1.15.31: see same comment above — match both shapes for safety.
        degree: primarySpecialty?.includes('Ophthalmolog') ? 'MD' : 'OD',
        specialty: primarySpecialty,
        city: hcp.city,
        state: hcp.state,
        count: r.count,
        // v1.17.42 — manual classification only; null when not yet
        // classified by the data team for this disease area.
        influencerType: (influencerTypeMap.get(hcp.id) ?? null) as string,
      });
    }

    const total = rankedItems.length;
    return {
      nominationType,
      items: rankedItems.slice((page - 1) * limit, page * limit),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
    } catch (error) {
      logger.error('Error fetching leader rankings', { diseaseAreaId, query, error });
      throw error;
    }
  }

  /**
   * Get individual KOL profile with all scores and nomination counts
   */
  async getKolProfile(
    diseaseAreaId: string,
    hcpId: string,
    clientId?: string,
    // v1.17.56 — respondent filters on the single-HCP drill-down.
    // When active, the nominators list AND the per-nominator
    // demographic aggregations (specialty / state / nominationType)
    // are filtered to nominations whose response passes the filters.
    // Mirrors the Apply Filters batch UX on Demographics +
    // Sociometric Summary + Benchmarking + KOL Explorer.
    respondentFilters?: RespondentFilters,
  ): Promise<KolProfileWithNominators | null> {
    try {
    const analysis = await this.resolveAnalysis(clientId, diseaseAreaId);
    if (!analysis) return null;

    // Get HCP + live objective scores (objective may be absent for a
    // survey-only KOL — handled as null below).
    const hcp = await prisma.hcp.findUnique({
      where: { id: hcpId },
      include: {
        specialties: {
          where: { isPrimary: true },
          include: { specialty: true },
          take: 1,
        },
        diseaseAreaScores: {
          where: { diseaseAreaId, isCurrent: true },
          take: 1,
        },
      },
    });
    if (!hcp) return null;

    // Survey/composite/per-type come from the analysis. If the HCP isn't in
    // the analysis, there's no profile to show.
    const a = await prisma.hcpAnalysisScore.findUnique({
      where: { analysisId_hcpId: { analysisId: analysis.id, hcpId } },
    });
    if (!a) return null;

    const objective = hcp.diseaseAreaScores[0] ?? null;
    const includedCampaignIds = await this.loadIncludedCampaignIds(analysis.id);

    // v1.17.62 — derive excludeInternalEmails from campaign config
    // (mirrors getSummary / getDemographics / getKolNominationMetadata).
    // Was previously an opt-in caller param that the FE never sent →
    // Bio-Exec staff leaked into customer KOL Profile nominator lists
    // despite tenant-level "Exclude internal" toggle being ON.
    // Ticket: docs/findings/kol-profile-ignores-exclude-internal-flag-2026-06-23.md
    const campaignFlags = includedCampaignIds.length === 0
      ? []
      : await prisma.campaign.findMany({
          where: { id: { in: includedCampaignIds } },
          select: { excludeInternalEmails: true },
        });
    const excludeInternalEmails = campaignFlags.some((c) => c.excludeInternalEmails);
    // v1.17.42 — manual classification lookup for this HCP within
    // the disease area. Null when not yet classified.
    const influencerTypeMap = await this.loadManualInfluencerTypes([hcpId], diseaseAreaId);

    // v1.17.56 — respondent filter set. When active, only nominations
    // whose response passes the filters survive into the nominators
    // list + demographic aggregations.
    const filteredResponseIds = hasAnyRespondentFilter(respondentFilters)
      ? await this.getFilteredResponseIds(respondentFilters!, includedCampaignIds)
      : null;

    // Nominators list — scoped to the analysis's included campaigns so it
    // matches the pooled scores.
    // v1.17.56 — short-circuit when filters narrow to zero responses.
    const nominations = includedCampaignIds.length === 0 || (filteredResponseIds && filteredResponseIds.size === 0)
      ? []
      : await prisma.nomination.findMany({
      where: {
        matchedHcpId: hcpId,
        matchStatus: { in: ['MATCHED', 'NEW_HCP'] },
        response: {
          campaignId: { in: includedCampaignIds },
          ...(excludeInternalEmails && {
            respondentHcp: { email: { not: { endsWith: '@bio-exec.com' } } },
          }),
          ...(filteredResponseIds && { id: { in: [...filteredResponseIds] } }),
        },
      },
      include: {
        question: {
          select: { nominationType: true },
        },
        nominatorHcp: {
          select: {
            id: true,
            npi: true,
            firstName: true,
            lastName: true,
            specialty: true,
            state: true,
          },
        },
        response: {
          select: {
            campaign: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Nomination breakdown by type — from the analysis's pooled per-type
    // counts (single source of truth, post respondent-dedup).
    const nominationsByType = {
      discussionLeaders: a.countDiscussionLeaders || 0,
      referralLeaders: a.countReferralLeaders || 0,
      adviceLeaders: a.countAdviceLeaders || 0,
      nationalLeader: a.countNationalLeader || 0,
      risingStar: a.countRisingStar || 0,
      socialLeader: a.countSocialLeader || 0,
      biasedLeader: a.countBiasedLeader || 0,
    };

    const primarySpecialty = hcp.specialties[0]?.specialty?.name || hcp.specialty;

    // Build nominators list. v1.17.45 — npi surfaced for the
    // Nominators table on the KOL Profile view.
    // v1.17.47 — hasScores: true when the nominator has an
    // HcpAnalysisScore row in THIS analysis. Frontend uses this to
    // conditionally hyperlink the nominator name to their own KOL
    // Profile. Nominators without an analysis row would render an
    // empty profile (no segment/composite scores), so we don't
    // link them. One batched query — cheap.
    const nominatorHcpIds = Array.from(
      new Set(nominations.filter((n) => n.nominatorHcp).map((n) => n.nominatorHcp!.id)),
    );
    const scoredNominatorIds = nominatorHcpIds.length === 0
      ? new Set<string>()
      : new Set(
          (await prisma.hcpAnalysisScore.findMany({
            where: { analysisId: analysis.id, hcpId: { in: nominatorHcpIds } },
            select: { hcpId: true },
          })).map((r) => r.hcpId),
        );

    const nominators: NominatorItem[] = nominations
      .filter((n) => n.nominatorHcp)
      .map((n) => {
        const nomHcp = n.nominatorHcp!;
        return {
          id: nomHcp.id,
          npi: nomHcp.npi,
          name: `${nomHcp.firstName} ${nomHcp.lastName}`,
          specialty: nomHcp.specialty,
          state: nomHcp.state,
          nominationType: n.question.nominationType as NominationType,
          campaignName: n.response?.campaign?.name || 'Unknown Campaign',
          respondedAt: n.createdAt.toISOString(),
          hasScores: scoredNominatorIds.has(nomHcp.id),
        };
      });

    // Build demographics aggregations
    const specialtyCount = new Map<string, number>();
    const stateCount = new Map<string, number>();
    const typeCount = new Map<string, number>();

    for (const nom of nominators) {
      const spec = nom.specialty || 'Unknown';
      specialtyCount.set(spec, (specialtyCount.get(spec) || 0) + 1);

      const state = nom.state || 'Unknown';
      stateCount.set(state, (stateCount.get(state) || 0) + 1);

      typeCount.set(nom.nominationType, (typeCount.get(nom.nominationType) || 0) + 1);
    }

    const nominatorDemographics: NominatorDemographics = {
      bySpecialty: Array.from(specialtyCount.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      byState: Array.from(stateCount.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      byNominationType: Array.from(typeCount.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    };

    return {
      id: hcp.id,
      name: `${hcp.firstName} ${hcp.lastName}`,
      firstName: hcp.firstName,
      lastName: hcp.lastName,
      npi: hcp.npi,
      specialty: primarySpecialty,
      city: hcp.city,
      state: hcp.state,
      influencerType: (influencerTypeMap.get(hcpId) ?? null) as string,
      scores: {
        // Objective: live from HcpDiseaseAreaScore (null if not enriched).
        scorePublications: objective?.scorePublications ? Number(objective.scorePublications) : null,
        scoreTradePubs: objective?.scoreTradePubs ? Number(objective.scoreTradePubs) : null,
        scoreOrgLeadership: objective?.scoreOrgLeadership ? Number(objective.scoreOrgLeadership) : null,
        scoreOrgAwards: objective?.scoreOrgAwards ? Number(objective.scoreOrgAwards) : null,
        scoreClinicalTrials: objective?.scoreClinicalTrials ? Number(objective.scoreClinicalTrials) : null,
        scoreConference: objective?.scoreConference ? Number(objective.scoreConference) : null,
        scoreSocialMedia: objective?.scoreSocialMedia ? Number(objective.scoreSocialMedia) : null,
        scoreMediaPodcasts: objective?.scoreMediaPodcasts ? Number(objective.scoreMediaPodcasts) : null,
        // Survey/composite: from the analysis.
        scoreSurvey: a.scoreSurvey ? Number(a.scoreSurvey) : null,
        compositeScore: a.compositeScore ? Number(a.compositeScore) : null,
      },
      nominations: {
        ...nominationsByType,
        total: a.nominationCount || 0,
      },
      regionalCount: a.nominationCount || 0,
      nominators,
      nominatorDemographics,
    };
    } catch (error) {
      logger.error('Error fetching KOL profile', { diseaseAreaId, hcpId, error });
      throw error;
    }
  }

  /**
   * Get sociometric summary - master table with all nomination counts.
   *
   * v1.17.5: when `respondentFilters` is provided, per-type counts are
   * recomputed on the fly from filtered nominations. Influencer-type
   * classification still comes from the analysis's scoreMap (the score
   * isn't recomputed under a respondent filter).
   */
  async getSociometricSummary(
    diseaseAreaId: string,
    filters: InsightsFilter,
    clientId?: string,
    respondentFilters?: RespondentFilters
  ): Promise<SociometricSummaryResponse> {
    try {
    // v1.17.33: also pull the plural array filters + influencerTypes.
    // Pre-fix only specialty/state were destructured, so the plural shape
    // the frontend sends (specialties=… states=… influencerTypes=…) was
    // silently dropped — see
    // docs/findings/sociometric-state-filter-broken-2026-06-11.md.
    const {
      page, limit, search,
      specialty, specialties,
      state, states,
      influencerType, influencerTypes,
      sortBy, sortOrder,
    } = filters;

    // v1.17.33: post-fetch filter set for the computed influencer-type
    // classification (mirrors getKolExplorer:596-600). Accepts plural
    // shape from the frontend, with singular legacy fallback.
    const influencerTypeFilter =
      influencerTypes && influencerTypes.length > 0
        ? influencerTypes
        : influencerType
          ? [influencerType]
          : null;

    const empty: SociometricSummaryResponse = {
      items: [], total: 0, page, limit, totalPages: 0,
    };

    const analysis = await this.resolveAnalysis(clientId, diseaseAreaId);
    if (!analysis) return empty;

    const scoreMap = await this.loadAnalysisScores(analysis.id);

    // v1.17.5: when respondent filters are active, recompute per-type
    // counts from nominations within the filtered response set.
    // perHcpCounts is keyed by hcpId; we use it instead of scoreMap.count*
    // for the row counts. The scoreMap is still consulted for influencer
    // type classification (no live re-score under a respondent filter).
    let perHcpCounts: Map<string, Map<NominationType, number>> | null = null;
    let filteredHcpIds: Set<string> | null = null;
    if (hasAnyRespondentFilter(respondentFilters)) {
      // v1.17.50: getFilteredResponseIds — see perf-pass-C #1 comment
      // on getLeaderRankings.
      const includedCampaignIds = await this.loadIncludedCampaignIds(analysis.id);
      const filteredResponseIds = await this.getFilteredResponseIds(
        respondentFilters!,
        includedCampaignIds
      );
      if (filteredResponseIds.size === 0) return empty;
      perHcpCounts = await this.computeRespondentFilteredCounts(filteredResponseIds);
      filteredHcpIds = new Set(perHcpCounts.keys());
    }

    // Base HCP set: when respondent filtering is active, only HCPs with
    // at least one nomination from a filtered response. Otherwise, all
    // HCPs in the analysis.
    const baseHcpIds = filteredHcpIds
      ? [...filteredHcpIds]
      : [...scoreMap.keys()];
    if (baseHcpIds.length === 0) return empty;

    const searchLc = search?.toLowerCase();
    // v1.17.42 — manual classification map (replaces algorithmic
    // determineInfluencerType). Loaded once for cheap per-HCP lookup
    // + filter inside the loop.
    const influencerTypeMap = await this.loadManualInfluencerTypes(baseHcpIds, diseaseAreaId);

    // v1.17.33: dual-shape where-clause (mirrors getLeaderRankings:784-790).
    // Plural arrays from the frontend get the `{ in: [...] }` shape;
    // singular legacy params fall through to equality.
    const hcpWhere: Record<string, unknown> = {
      id: { in: baseHcpIds },
    };
    if (specialties && specialties.length > 0) hcpWhere.specialty = { in: specialties };
    else if (specialty) hcpWhere.specialty = specialty;
    if (states && states.length > 0) hcpWhere.state = { in: states };
    else if (state) hcpWhere.state = state;

    // Perf pass #6 (Sociometric Summary): narrow to the 6 fields consumed below.
    const hcps = await prisma.hcp.findMany({
      where: hcpWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        specialty: true,
        city: true,
        state: true,
        npi: true, // v1.17.32: surfaced for the full-list export
        specialties: {
          where: { isPrimary: true },
          include: { specialty: true },
          take: 1,
        },
      },
    });

    // Build the full result set from per-type counts (filtered or
    // pre-aggregated), then sort+paginate the whole set so ranking is
    // global (the old code sorted only the current page — a bug).
    const all: SociometricSummaryItem[] = [];
    for (const hcp of hcps) {
      if (
        searchLc &&
        !`${hcp.firstName} ${hcp.lastName}`.toLowerCase().includes(searchLc)
      ) {
        continue;
      }
      const a = scoreMap.get(hcp.id);
      // Under respondent filtering, perHcpCounts is the source of truth
      // for counts; a may be undefined (rare — see getLeaderRankings).
      // Without respondent filtering, fall through the existing semantics.
      const filteredPerType = perHcpCounts?.get(hcp.id);
      const primarySpecialty = hcp.specialties[0]?.specialty?.name || hcp.specialty;
      const discussionLeaders = filteredPerType
        ? filteredPerType.get('DISCUSSION_LEADERS') ?? 0
        : a?.countDiscussionLeaders ?? 0;
      const referralLeaders = filteredPerType
        ? filteredPerType.get('REFERRAL_LEADERS') ?? 0
        : a?.countReferralLeaders ?? 0;
      const adviceLeaders = filteredPerType
        ? filteredPerType.get('ADVICE_LEADERS') ?? 0
        : a?.countAdviceLeaders ?? 0;
      const nationalLeaders = filteredPerType
        ? filteredPerType.get('NATIONAL_LEADER') ?? 0
        : a?.countNationalLeader ?? 0;
      const risingStars = filteredPerType
        ? filteredPerType.get('RISING_STAR') ?? 0
        : a?.countRisingStar ?? 0;
      const socialLeaders = filteredPerType
        ? filteredPerType.get('SOCIAL_LEADER') ?? 0
        : a?.countSocialLeader ?? 0;
      const biasedLeaders = filteredPerType
        ? filteredPerType.get('BIASED_LEADER') ?? 0
        : a?.countBiasedLeader ?? 0;
      const total = discussionLeaders + referralLeaders + adviceLeaders +
        nationalLeaders + risingStars + socialLeaders + biasedLeaders;
      // Under respondent filtering, "regional" (total nomination count for
      // the HCP within the analysis) is replaced with the filtered total.
      const regional = filteredPerType
        ? total
        : Number(a?.nominationCount ?? 0);
      // Skip HCPs with zero filtered nominations (only possible under
      // respondent filtering — pre-aggregated path includes everyone).
      if (filteredPerType && total === 0) continue;

      // v1.17.42 — manual influencer-type from the data-team CSV
      // upload. Null when not yet classified for this disease area.
      const influencerTypeVal = influencerTypeMap.get(hcp.id) ?? null;
      if (
        influencerTypeFilter &&
        (!influencerTypeVal || !influencerTypeFilter.includes(influencerTypeVal))
      ) {
        continue;
      }

      all.push({
        rank: 0, // assigned after global sort
        hcpId: hcp.id,
        npi: hcp.npi, // v1.17.32: surfaced for the full-list export
        name: `${hcp.firstName} ${hcp.lastName}`,
        specialty: primarySpecialty,
        city: hcp.city,
        state: hcp.state,
        influencerType: influencerTypeVal,
        discussionLeaders,
        referralLeaders,
        adviceLeaders,
        nationalLeaders,
        risingStars,
        socialLeaders,
        biasedLeaders,
        regional,
        total,
      });
    }

    const validSortFields = ['total', 'discussionLeaders', 'referralLeaders', 'adviceLeaders', 'nationalLeaders', 'risingStars', 'socialLeaders', 'biasedLeaders', 'regional', 'name'];
    const field = validSortFields.includes(sortBy || '') ? sortBy : 'total';
    // v1.17.28: rewritten to use the same `dir + ternary` comparator
    // shape that getKolExplorer and getLeaderRankings use — one
    // pattern across all three insights sort paths. The previous
    // `order * (bVal - aVal)` form had the sign flipped and was
    // sending `sortOrder='desc'` requests back ascending (Sociometric
    // Summary Total wasn't ranking leaders highest-first).
    const dir = sortOrder === 'asc' ? 1 : -1;
    all.sort((a, b) => {
      if (field === 'name') {
        return a.name < b.name ? -dir : a.name > b.name ? dir : 0;
      }
      const aVal = ((a as Record<string, unknown>)[field!] as number) || 0;
      const bVal = ((b as Record<string, unknown>)[field!] as number) || 0;
      return aVal < bVal ? -dir : aVal > bVal ? dir : 0;
    });

    const total = all.length;
    const items = all
      .slice((page - 1) * limit, page * limit)
      .map((it, i) => ({ ...it, rank: (page - 1) * limit + i + 1 }));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
    } catch (error) {
      logger.error('Error fetching sociometric summary', { diseaseAreaId, filters, error });
      throw error;
    }
  }


  /**
   * Get filter options for dropdowns.
   *
   * Perf pass #3: previously fetched up to ~hundreds of (specialty, state)
   * pairs and deduped in JS. Now pushes the DISTINCT down to Postgres —
   * two narrow scans, ~tens of rows each, no app-side Set juggling.
   *
   * State whitelist (US 50 + DC) stays app-side because it's a small
   * hardcoded check and SQL `IN (...)` over 51 string literals is ugly.
   * The DB filter is `is not null + isCurrent`; the whitelist clips after.
   */
  async getFilterOptions(diseaseAreaId: string) {
    try {
      const [specialtyRows, stateRows, coreFocusRows, influencerTypeRows] = await Promise.all([
        prisma.$queryRaw<{ specialty: string }[]>`
          SELECT DISTINCT h."specialty"
          FROM "Hcp" h
          JOIN "HcpDiseaseAreaScore" s ON s."hcpId" = h."id"
          WHERE s."diseaseAreaId" = ${diseaseAreaId}
            AND s."isCurrent" = true
            AND h."specialty" IS NOT NULL
          ORDER BY h."specialty" ASC
        `,
        prisma.$queryRaw<{ state: string }[]>`
          SELECT DISTINCT h."state"
          FROM "Hcp" h
          JOIN "HcpDiseaseAreaScore" s ON s."hcpId" = h."id"
          WHERE s."diseaseAreaId" = ${diseaseAreaId}
            AND s."isCurrent" = true
            AND h."state" IS NOT NULL
          ORDER BY h."state" ASC
        `,
        // 2026-06-02 — populate Core Focus filter dropdown on Demographics
        // + Sociometric Leaders tabs. UNION of SINGLE_CHOICE/text answers
        // and MULTI_CHOICE selected-array elements, scoped to completed
        // responses in this DA. Matches the byCoreFocus aggregation
        // semantics so the dropdown's options align with the bar-chart
        // categories.
        prisma.$queryRaw<{ value: string }[]>`
          SELECT DISTINCT value FROM (
            SELECT COALESCE(
              NULLIF(sra."answerText", ''),
              CASE WHEN q."type" = 'SINGLE_CHOICE' THEN sra."answerJson"->>'selected' END
            ) AS value
            FROM "SurveyResponseAnswer" sra
            JOIN "SurveyQuestion" sq ON sq.id = sra."questionId"
            JOIN "Question" q ON q.id = sq."questionId"
            JOIN "SurveyResponse" sr ON sr.id = sra."responseId"
            JOIN "Campaign" c ON c.id = sr."campaignId"
            WHERE c."diseaseAreaId" = ${diseaseAreaId}
              AND sr.status = 'COMPLETED'
              AND LOWER(sq."questionTextSnapshot") LIKE '%core focus%'
              AND q."type" <> 'MULTI_CHOICE'
            UNION
            SELECT jsonb_array_elements_text(sra."answerJson"->'selected') AS value
            FROM "SurveyResponseAnswer" sra
            JOIN "SurveyQuestion" sq ON sq.id = sra."questionId"
            JOIN "Question" q ON q.id = sq."questionId"
            JOIN "SurveyResponse" sr ON sr.id = sra."responseId"
            JOIN "Campaign" c ON c.id = sr."campaignId"
            WHERE c."diseaseAreaId" = ${diseaseAreaId}
              AND sr.status = 'COMPLETED'
              AND LOWER(sq."questionTextSnapshot") LIKE '%core focus%'
              AND q."type" = 'MULTI_CHOICE'
              AND sra."answerJson" ? 'selected'
              AND jsonb_typeof(sra."answerJson"->'selected') = 'array'
          ) merged
          WHERE value IS NOT NULL AND value <> ''
          ORDER BY value ASC
        `,
        // v1.17.53: distinct influencerType values actually assigned to
        // HCPs in this DA. Pre-fix this was a hardcoded 3-value list
        // [National Leaders, Rising Stars, Regional Influencers] that
        // drifted away from the data: v1.17.44 / prod-rel-4.1.24
        // expanded the canonical list to include 'Regional Leaders' +
        // 'Pre-Emergent', and the data team uploaded those values onto
        // prod HCPs. Customers picking 'Regional Influencers' in the
        // dropdown got 0 results because no HCP was classified that
        // way. DB-driven matches the pattern already used for
        // specialty / state / coreFocus above.
        prisma.$queryRaw<{ value: string }[]>`
          SELECT DISTINCT "influencerType" AS value
          FROM "HcpDiseaseArea"
          WHERE "diseaseAreaId" = ${diseaseAreaId}
            AND "influencerType" IS NOT NULL
            AND "influencerType" <> ''
          ORDER BY value ASC
        `,
      ]);

      // v1.17.4: state filter whitelist — only emit US 50 + DC.
      // Customers (Sun Pharma, B+L) are US-only; non-US values like 'AB'
      // (Alberta) or 'AU' (Australia) had leaked into the dropdown from
      // legacy NPI imports. Hardcoded for now; revisit as a per-client
      // Client.region setting if/when we onboard a non-US customer.
      const specialties = specialtyRows.map((r) => r.specialty);
      const states = stateRows.map((r) => r.state).filter((s) => US_STATE_CODES.has(s));
      const coreFocuses = coreFocusRows.map((r) => r.value);
      const influencerTypes = influencerTypeRows.map((r) => r.value);

      return {
        specialties,
        states,
        coreFocuses,
        influencerTypes,
      };
    } catch (error) {
      logger.error('Error fetching filter options', { diseaseAreaId, error });
      throw error;
    }
  }

  /**
   * Get demographics data from survey response answers.
   *
   * **Perf pass B item #1:** previously loaded ALL `surveyResponseAnswer`
   * rows (~23k typical) for the disease area's completed responses + ran
   * a one-pass-with-9-branches iteration to compute 14 distributions in
   * JS. Now runs ~14 narrow parallel SQL `GROUP BY` queries — payload
   * drops from 23k rows × ~2KB to ~50 rows × ~50B total.
   *
   * Filter compatibility (v1.17.5 RespondentFilters):
   *  - When no filter is active (common dashboard path), all dimension
   *    queries hit the campaign scope directly.
   *  - When a filter IS active, we reuse the existing
   *    `loadAnswersForRespondentFilter` + `computeFilteredResponseIds`
   *    pipeline (shared with getLeaderRankings + getSociometricSummary)
   *    to compute the filtered response-id set, then each dimension
   *    query is narrowed by `sr.id IN (filteredResponseIds)`. The filter
   *    pipeline still pays the answer-load cost in this case, but the
   *    AGGREGATION no longer iterates 23k rows in JS.
   *
   * Output is semantically identical to the prior impl. Tie-break order
   * is now `count DESC, name ASC` (deterministic) instead of Map insertion
   * order (= Prisma physical row order, non-deterministic).
   */
  async getDemographics(
    diseaseAreaId: string,
    clientId?: string,
    filters?: RespondentFilters
  ) {
    try {
      // v1.17.50: accessible campaigns = owned UNION analysis-included
      // (see resolveAccessibleCampaignIds). Pre-fix lite clients hit
      // the campaignIds.length === 0 short-circuit and saw empty
      // demographics. The PLATFORM_ADMIN path (no clientId) keeps the
      // original "all campaigns in DA" semantics — they're cross-tenant.
      const accessibleIds = clientId
        ? await this.resolveAccessibleCampaignIds(clientId, diseaseAreaId)
        : null;
      const campaigns = await prisma.campaign.findMany({
        where: accessibleIds
          ? { id: { in: accessibleIds } }
          : { diseaseAreaId },
        select: { id: true, excludeInternalEmails: true, showTopicsDiscussed: true },
      });
      const campaignIds = campaigns.map((c) => c.id);
      const anyShowTopics = campaigns.some((c) => c.showTopicsDiscussed);
      const excludeInternal = campaigns.some((c) => c.excludeInternalEmails);

      if (campaignIds.length === 0) {
        return this.emptyDemographics();
      }

      // 2026-06-02 dedup rule: a respondent who completed surveys in
      // multiple campaigns within the same (DA, client) scope counts ONCE,
      // and we attribute their answers to the MOST RECENT response only.
      // If they skipped a question in their most recent survey, that
      // dimension simply doesn't get a count for them — we DO NOT fall
      // back to an older survey's answer for that question.
      //
      // Implementation: a single precompute query picks the dedup-aware
      // response-id set (with each campaign's own excludeInternalEmails
      // flag honored — the per-campaign filter that was uniformly applied
      // pre-2026-06-02, masking 195 valid respondents from non-flag
      // campaigns). All 14 dimension queries below then gate on `sr.id IN
      // (set)`. This replaces the prior `internalEmailFilter` (uniform)
      // with a precomputed list, which automatically encodes both rules.
      const latestRows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT ON (sr."respondentHcpId") sr.id
        FROM "SurveyResponse" sr
        JOIN "Campaign" c ON c.id = sr."campaignId"
        LEFT JOIN "Hcp" h ON h.id = sr."respondentHcpId"
        WHERE sr."campaignId" IN (${Prisma.join(campaignIds)})
          AND sr.status = 'COMPLETED'
          AND (
            c."excludeInternalEmails" = false
            OR h.email IS NULL
            OR h.email NOT LIKE '%@bio-exec.com'
          )
        ORDER BY sr."respondentHcpId", sr."completedAt" DESC NULLS LAST
      `;
      const latestResponseIds = new Set(latestRows.map((r) => r.id));
      if (latestResponseIds.size === 0) return this.emptyDemographics();

      // If respondent filters are active, compute the filtered response-id
      // set and intersect with the dedup-aware latest set. Reuses the
      // existing helper so semantics stay aligned with getLeaderRankings
      // and getSociometricSummary.
      let effectiveResponseIds: Set<string> = latestResponseIds;
      if (hasAnyRespondentFilter(filters)) {
        // v1.17.50: getFilteredResponseIds — see perf-pass-C #1
        // comment on getLeaderRankings.
        const filtered = await this.getFilteredResponseIds(filters!, campaignIds);
        effectiveResponseIds = new Set(
          [...latestResponseIds].filter((id) => filtered.has(id))
        );
        if (effectiveResponseIds.size === 0) return this.emptyDemographics();
      }

      // SQL fragment helpers shared across the parallel queries below.
      const cids = Prisma.sql`${Prisma.join(campaignIds)}`;
      // Campaigns where showTopicsDiscussed is on — used to scope the
      // Topics Discussed dimension. Guarded because Prisma.join throws on
      // an empty array; the topics query is conditionally skipped if so.
      const topicCampaignIds = campaigns
        .filter((c) => c.showTopicsDiscussed)
        .map((c) => c.id);
      const hasTopicCampaigns = topicCampaignIds.length > 0;
      const tcids = hasTopicCampaigns
        ? Prisma.sql`${Prisma.join(topicCampaignIds)}`
        : Prisma.sql``;
      // The dedup-aware response-id set is the single mandatory filter.
      // It already encodes BOTH (a) per-campaign excludeInternalEmails and
      // (b) most-recent-per-respondent dedup — so no separate internal-
      // email filter / dedup logic is needed in the dimension queries.
      // The legacy `internalEmailFilter` Prisma.sql fragment is gone;
      // each query just splices `responseFilter` below.
      const responseFilter = Prisma.sql`AND sr.id IN (${Prisma.join([...effectiveResponseIds])})`;
      // Empty placeholder kept so existing `${internalEmailFilter}` splice
      // sites stay in place during the refactor; they're now no-ops.
      const internalEmailFilter = Prisma.sql``;
      // Silence unused-var warning when `excludeInternal` is now only used
      // for documentation of which campaigns have the flag (kept above).
      void excludeInternal;

      // Common WHERE skeleton for every dimension query:
      //   - sr.campaignId in (campaignIds)
      //   - sr.status = 'COMPLETED'
      //   - optional respondent-filter id set
      //   - optional internal-email filter (requires JOIN to Hcp aliased as h)
      // Repeated inline below since template literals don't compose cleanly.

      // Numeric extraction: mirrors parseNumber() — strip non-digit/dot
      // chars, NULLIF empty, cast to numeric. Used for years / patients
      // questions where the answer is stored as free text.
      // Numeric extraction with safe pre-validation. Pre-2026-06-03 this
      // did REGEXP_REPLACE + cast, which 500'd when the cleaned text was
      // a malformed numeric like ".." (e.g., a respondent typed dots into
      // a "how many patients" field). Now we cast only when the cleaned
      // text matches a real number shape; otherwise NULL (= ignored by the
      // bucketing downstream, same as IS NULL filtering).
      const NUM = Prisma.sql`
        CASE
          WHEN REGEXP_REPLACE(COALESCE(sra."answerText", ''), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
          THEN REGEXP_REPLACE(COALESCE(sra."answerText", ''), '[^0-9.]', '', 'g')::numeric
          ELSE NULL
        END
      `;

      // Single-choice extraction: mirrors extractSingleChoice() — JSON
      // 'selected' for SINGLE_CHOICE, otherwise text. NULL for empty.
      const SC = Prisma.sql`COALESCE(
        CASE WHEN q."type" = 'SINGLE_CHOICE' THEN sra."answerJson"->>'selected' END,
        NULLIF(sra."answerText", '')
      )`;

      // For getCoreFocus: text takes precedence over SC (matches old impl's
      //   `text || extractSingleChoice(...)` order). Only fall back to
      //   answerJson.selected when the question type is SINGLE_CHOICE —
      //   for MULTI_CHOICE / RANK_ORDER / etc. the old impl's
      //   extractSingleChoice returns null, so we mirror that here.
      const CORE_FOCUS = Prisma.sql`COALESCE(
        NULLIF(sra."answerText", ''),
        CASE WHEN q."type" = 'SINGLE_CHOICE' THEN sra."answerJson"->>'selected' END
      )`;

      // totalRespondents is now a direct property of the dedup set —
      // one response per respondent, exactly the count of effective IDs.
      const totalRespondents = effectiveResponseIds.size;

      const [
        roleRows,
        practiceSettingRows,
        coreFocusRows,
        monthlyPatientsRows,
        dedPatientsRows,
        yearsRows,
        stateRows,
        decileRows,
        educationalRows,
        topicsRows,
        socialMediaRanksRows,
        valuableContentRows,
        objectivityRatingRows,
        respondentCoreFocusRows,
        respondentMonthlyPatientsRows,
      ] = await Promise.all([
        // C1.2 Role / Primary Medical Specialty
        prisma.$queryRaw<{ name: string; count: number }[]>`
          SELECT ${SC} AS name, COUNT(*)::int AS count
          FROM "SurveyResponseAnswer" sra
          JOIN "SurveyQuestion" sq ON sq.id = sra."questionId" JOIN "Question" q ON q.id = sq."questionId"
          JOIN "SurveyResponse" sr ON sr.id = sra."responseId"
          LEFT JOIN "Hcp" h ON h.id = sr."respondentHcpId"
          WHERE sr."campaignId" IN (${cids})
            AND sr.status = 'COMPLETED'
            AND LOWER(sq."questionTextSnapshot") LIKE '%primary medical specialty%'
            AND ${SC} IS NOT NULL
          ${responseFilter}
          ${internalEmailFilter}
          GROUP BY 1
          ORDER BY count DESC, name ASC
        `,

        // C1.8 Practice Setting — UNION single-choice rows + MULTI_CHOICE
        // selected array elements (jsonb_array_elements_text), then GROUP BY.
        prisma.$queryRaw<{ name: string; count: number }[]>`
          SELECT name, SUM(count)::int AS count FROM (
            SELECT ${SC} AS name, 1 AS count
            FROM "SurveyResponseAnswer" sra
            JOIN "SurveyQuestion" sq ON sq.id = sra."questionId" JOIN "Question" q ON q.id = sq."questionId"
            JOIN "SurveyResponse" sr ON sr.id = sra."responseId"
            LEFT JOIN "Hcp" h ON h.id = sr."respondentHcpId"
            WHERE sr."campaignId" IN (${cids})
              AND sr.status = 'COMPLETED'
              AND LOWER(sq."questionTextSnapshot") LIKE '%practice setting%'
              AND q."type" <> 'MULTI_CHOICE'
              AND ${SC} IS NOT NULL
            ${responseFilter}
            ${internalEmailFilter}
            UNION ALL
            SELECT jsonb_array_elements_text(sra."answerJson"->'selected') AS name, 1 AS count
            FROM "SurveyResponseAnswer" sra
            JOIN "SurveyQuestion" sq ON sq.id = sra."questionId" JOIN "Question" q ON q.id = sq."questionId"
            JOIN "SurveyResponse" sr ON sr.id = sra."responseId"
            LEFT JOIN "Hcp" h ON h.id = sr."respondentHcpId"
            WHERE sr."campaignId" IN (${cids})
              AND sr.status = 'COMPLETED'
              AND LOWER(sq."questionTextSnapshot") LIKE '%practice setting%'
              AND q."type" = 'MULTI_CHOICE'
              AND sra."answerJson" ? 'selected'
              AND jsonb_typeof(sra."answerJson"->'selected') = 'array'
            ${responseFilter}
            ${internalEmailFilter}
          ) merged
          GROUP BY name
          ORDER BY count DESC, name ASC
        `,

        // C1.9 Core Focus — UNION single-choice + MULTI_CHOICE selected
        // array elements (jsonb_array_elements_text). Same pattern as
        // Practice Setting + Topics Discussed. Pre-2026-06-02 this query
        // used the bare CORE_FOCUS extraction which returned NULL for
        // MULTI_CHOICE questions, so the Sun Pharma + Dry Eye DA (which
        // uses MULTI_CHOICE for "What best describes the core focus...?")
        // returned an empty byCoreFocus. Regression introduced in v1.17.11
        // (perf pass B); fixed here to mirror byPracticeSetting.
        prisma.$queryRaw<{ name: string; count: number }[]>`
          SELECT name, SUM(count)::int AS count FROM (
            SELECT ${CORE_FOCUS} AS name, 1 AS count
            FROM "SurveyResponseAnswer" sra
            JOIN "SurveyQuestion" sq ON sq.id = sra."questionId" JOIN "Question" q ON q.id = sq."questionId"
            JOIN "SurveyResponse" sr ON sr.id = sra."responseId"
            LEFT JOIN "Hcp" h ON h.id = sr."respondentHcpId"
            WHERE sr."campaignId" IN (${cids})
              AND sr.status = 'COMPLETED'
              AND LOWER(sq."questionTextSnapshot") LIKE '%core focus%'
              AND q."type" <> 'MULTI_CHOICE'
              AND ${CORE_FOCUS} IS NOT NULL
            ${responseFilter}
            ${internalEmailFilter}
            UNION ALL
            SELECT jsonb_array_elements_text(sra."answerJson"->'selected') AS name, 1 AS count
            FROM "SurveyResponseAnswer" sra
            JOIN "SurveyQuestion" sq ON sq.id = sra."questionId" JOIN "Question" q ON q.id = sq."questionId"
            JOIN "SurveyResponse" sr ON sr.id = sra."responseId"
            LEFT JOIN "Hcp" h ON h.id = sr."respondentHcpId"
            WHERE sr."campaignId" IN (${cids})
              AND sr.status = 'COMPLETED'
              AND LOWER(sq."questionTextSnapshot") LIKE '%core focus%'
              AND q."type" = 'MULTI_CHOICE'
              AND sra."answerJson" ? 'selected'
              AND jsonb_typeof(sra."answerJson"->'selected') = 'array'
            ${responseFilter}
            ${internalEmailFilter}
          ) merged
          GROUP BY name
          ORDER BY count DESC, name ASC
        `,

        // C1.3 Monthly Patients (not DED)
        prisma.$queryRaw<{ val: number }[]>`
          SELECT ${NUM} AS val
          FROM "SurveyResponseAnswer" sra
          JOIN "SurveyQuestion" sq ON sq.id = sra."questionId" JOIN "Question" q ON q.id = sq."questionId"
          JOIN "SurveyResponse" sr ON sr.id = sra."responseId"
          LEFT JOIN "Hcp" h ON h.id = sr."respondentHcpId"
          WHERE sr."campaignId" IN (${cids})
            AND sr.status = 'COMPLETED'
            AND LOWER(sq."questionTextSnapshot") LIKE '%how many patients%'
            AND LOWER(sq."questionTextSnapshot") NOT LIKE '%dry eye%'
            AND ${NUM} IS NOT NULL
          ${responseFilter}
          ${internalEmailFilter}
        `,

        // C1.4 DED Patients
        prisma.$queryRaw<{ val: number }[]>`
          SELECT ${NUM} AS val
          FROM "SurveyResponseAnswer" sra
          JOIN "SurveyQuestion" sq ON sq.id = sra."questionId" JOIN "Question" q ON q.id = sq."questionId"
          JOIN "SurveyResponse" sr ON sr.id = sra."responseId"
          LEFT JOIN "Hcp" h ON h.id = sr."respondentHcpId"
          WHERE sr."campaignId" IN (${cids})
            AND sr.status = 'COMPLETED'
            AND LOWER(sq."questionTextSnapshot") LIKE '%dry eye%'
            AND LOWER(sq."questionTextSnapshot") LIKE '%patient%'
            AND ${NUM} IS NOT NULL
          ${responseFilter}
          ${internalEmailFilter}
        `,

        // C1.5 Years in Practice
        prisma.$queryRaw<{ val: number }[]>`
          SELECT ${NUM} AS val
          FROM "SurveyResponseAnswer" sra
          JOIN "SurveyQuestion" sq ON sq.id = sra."questionId" JOIN "Question" q ON q.id = sq."questionId"
          JOIN "SurveyResponse" sr ON sr.id = sra."responseId"
          LEFT JOIN "Hcp" h ON h.id = sr."respondentHcpId"
          WHERE sr."campaignId" IN (${cids})
            AND sr.status = 'COMPLETED'
            AND LOWER(sq."questionTextSnapshot") LIKE '%years%'
            AND LOWER(sq."questionTextSnapshot") LIKE '%practice%'
            AND ${NUM} IS NOT NULL
          ${responseFilter}
          ${internalEmailFilter}
        `,

        // C1.7 Location by state (one row per unique respondent — DISTINCT)
        prisma.$queryRaw<{ name: string; count: number }[]>`
          SELECT h.state AS name, COUNT(*)::int AS count
          FROM (
            SELECT DISTINCT sr."respondentHcpId"
            FROM "SurveyResponse" sr
            LEFT JOIN "Hcp" h ON h.id = sr."respondentHcpId"
            WHERE sr."campaignId" IN (${cids})
              AND sr.status = 'COMPLETED'
            ${responseFilter}
            ${internalEmailFilter}
          ) uniq
          JOIN "Hcp" h ON h.id = uniq."respondentHcpId"
          WHERE h.state IS NOT NULL
          GROUP BY h.state
          ORDER BY count DESC, name ASC
        `,

        // C1.1 Decile distribution — CampaignHcp.marketDecile for the
        // unique respondents who completed a survey.
        // Note: a respondent can appear in multiple CampaignHcp rows
        // (one per campaign), with potentially different marketDecile
        // values. The old impl's `decileMap.set(hcpId, decile)` keeps
        // one vote per respondent ("last write wins"). Mirror that with
        // DISTINCT ON per respondent before the outer GROUP BY.
        prisma.$queryRaw<{ decile: number; count: number }[]>`
          SELECT decile, COUNT(*)::int AS count FROM (
            SELECT DISTINCT ON (uniq."respondentHcpId")
              uniq."respondentHcpId", ch."marketDecile" AS decile
            FROM (
              SELECT DISTINCT sr."respondentHcpId"
              FROM "SurveyResponse" sr
              LEFT JOIN "Hcp" h ON h.id = sr."respondentHcpId"
              WHERE sr."campaignId" IN (${cids})
                AND sr.status = 'COMPLETED'
              ${responseFilter}
              ${internalEmailFilter}
            ) uniq
            JOIN "CampaignHcp" ch
              ON ch."hcpId" = uniq."respondentHcpId"
              AND ch."campaignId" IN (${cids})
            WHERE ch."marketDecile" IS NOT NULL
            ORDER BY uniq."respondentHcpId"
          ) per_respondent
          GROUP BY decile
          ORDER BY decile ASC
        `,

        // C1.10-12 Educational Resources (RANK_ORDER JSON array unrolled).
        // v1.17.24: production answerJson is a plain string array
        // (`["item1", "item2", ...]`) where array position IS the rank, not
        // the object-with-rank shape (`[{text, rank}]`) we originally
        // expected. Handle both: pull `elem->>'text'` if it's an object
        // (legacy), otherwise treat the element as a raw text node
        // (`#>>'{}'`) and use the array ordinality as the rank. The 555
        // prod respondents on Sun Pharma surveys were being silently
        // dropped pre-fix because `elem->>'text' IS NOT NULL` rejected
        // every string element.
        prisma.$queryRaw<{ bucket: string; resource: string; rank: number; count: number }[]>`
          SELECT
            CASE
              WHEN LOWER(sq."questionTextSnapshot") LIKE '%non-academic%'
                OR LOWER(sq."questionTextSnapshot") LIKE '%community%'
                OR LOWER(sq."questionTextSnapshot") LIKE '%other%' THEN 'other'
              WHEN LOWER(sq."questionTextSnapshot") LIKE '%academic%' THEN 'academic'
              ELSE 'general'
            END AS bucket,
            COALESCE(elem->>'text', elem #>> '{}') AS resource,
            COALESCE(
              CASE WHEN (elem->>'rank') ~ '^[1-5]$' THEN (elem->>'rank')::int END,
              ordinality::int
            ) AS rank,
            COUNT(*)::int AS count
          FROM "SurveyResponseAnswer" sra
          JOIN "SurveyQuestion" sq ON sq.id = sra."questionId" JOIN "Question" q ON q.id = sq."questionId"
          JOIN "SurveyResponse" sr ON sr.id = sra."responseId"
          LEFT JOIN "Hcp" h ON h.id = sr."respondentHcpId"
          CROSS JOIN LATERAL jsonb_array_elements(sra."answerJson") WITH ORDINALITY AS t(elem, ordinality)
          WHERE sr."campaignId" IN (${cids})
            AND sr.status = 'COMPLETED'
            AND (LOWER(sq."questionTextSnapshot") LIKE '%educational%'
              OR LOWER(sq."questionTextSnapshot") LIKE '%seek educational%')
            AND q."type" = 'RANK_ORDER'
            AND sra."answerJson" IS NOT NULL
            AND jsonb_typeof(sra."answerJson") = 'array'
            AND COALESCE(elem->>'text', elem #>> '{}') IS NOT NULL
            AND COALESCE(
                  CASE WHEN (elem->>'rank') ~ '^[1-5]$' THEN (elem->>'rank')::int END,
                  ordinality::int
                ) BETWEEN 1 AND 5
          ${responseFilter}
          ${internalEmailFilter}
          GROUP BY bucket, resource, rank
        `,

        // C1.13-14 Topics Discussed — only when campaign.showTopicsDiscussed.
        // tcids holds the campaign-id subset where the flag is on.
        hasTopicCampaigns
          ? prisma.$queryRaw<{ name: string; count: number }[]>`
              SELECT name, SUM(count)::int AS count FROM (
                SELECT ${SC} AS name, 1 AS count
                FROM "SurveyResponseAnswer" sra
                JOIN "SurveyQuestion" sq ON sq.id = sra."questionId" JOIN "Question" q ON q.id = sq."questionId"
                JOIN "SurveyResponse" sr ON sr.id = sra."responseId"
                LEFT JOIN "Hcp" h ON h.id = sr."respondentHcpId"
                WHERE sr."campaignId" IN (${tcids})
                  AND sr.status = 'COMPLETED'
                  AND LOWER(sq."questionTextSnapshot") LIKE '%topics discussed%'
                  AND q."type" <> 'MULTI_CHOICE'
                  AND ${SC} IS NOT NULL
                ${responseFilter}
                ${internalEmailFilter}
                UNION ALL
                SELECT jsonb_array_elements_text(sra."answerJson"->'selected') AS name, 1 AS count
                FROM "SurveyResponseAnswer" sra
                JOIN "SurveyQuestion" sq ON sq.id = sra."questionId" JOIN "Question" q ON q.id = sq."questionId"
                JOIN "SurveyResponse" sr ON sr.id = sra."responseId"
                LEFT JOIN "Hcp" h ON h.id = sr."respondentHcpId"
                WHERE sr."campaignId" IN (${tcids})
                  AND sr.status = 'COMPLETED'
                  AND LOWER(sq."questionTextSnapshot") LIKE '%topics discussed%'
                  AND q."type" = 'MULTI_CHOICE'
                  AND sra."answerJson" ? 'selected'
                  AND jsonb_typeof(sra."answerJson"->'selected') = 'array'
                ${responseFilter}
                ${internalEmailFilter}
              ) merged
              GROUP BY name
              ORDER BY count DESC, name ASC
            `
          : Promise.resolve([] as { name: string; count: number }[]),

        // 2026-06-02 Group B-remainder skeleton (#5, #6 from spec): three
        // new dimensions whose question texts the customer surfaced.
        // Keyword patterns are best-guesses from the spec's question
        // quotes; aggregations return [] until matching survey questions
        // are imported AND have completed responses. If keywords miss
        // the actual imported text, a small hotfix updates the LIKE
        // pattern — no schema/route change needed.

        // B-remainder #1: Social Media Platform Rankings (RANK_ORDER).
        // Customer-quoted question: "Please rank top 5 social media or
        // digital platforms".
        //
        // v1.17.24: prod answerJson shape is
        //   {"texts": {}, "ranked": ["Instagram", "LinkedIn", ...]}
        // not the [{text, rank}] object array the v1.17.15 skeleton
        // assumed. The whole `jsonb_array_elements(answerJson)` path
        // was wrong (answerJson is an object, not an array). 432 prod
        // respondents' answers were being silently dropped.
        //
        // Read from `answerJson->'ranked'` (the actual array) and use
        // WITH ORDINALITY so array position becomes the rank. Same
        // pattern as the v1.17.24 educational-resources fix.
        prisma.$queryRaw<{ resource: string; rank: number; count: number }[]>`
          SELECT
            elem AS resource,
            ordinality::int AS rank,
            COUNT(*)::int AS count
          FROM "SurveyResponseAnswer" sra
          JOIN "SurveyQuestion" sq ON sq.id = sra."questionId"
          JOIN "Question" q ON q.id = sq."questionId"
          JOIN "SurveyResponse" sr ON sr.id = sra."responseId"
          LEFT JOIN "Hcp" h ON h.id = sr."respondentHcpId"
          CROSS JOIN LATERAL jsonb_array_elements_text(sra."answerJson"->'ranked') WITH ORDINALITY AS t(elem, ordinality)
          WHERE sr."campaignId" IN (${cids})
            AND sr.status = 'COMPLETED'
            AND LOWER(sq."questionTextSnapshot") LIKE '%social media%'
            AND LOWER(sq."questionTextSnapshot") LIKE '%rank%'
            AND q."type" = 'RANK_ORDER'
            AND sra."answerJson" IS NOT NULL
            AND sra."answerJson" ? 'ranked'
            AND jsonb_typeof(sra."answerJson"->'ranked') = 'array'
            AND elem IS NOT NULL
            AND elem <> ''
            AND ordinality BETWEEN 1 AND 5
          ${responseFilter}
          ${internalEmailFilter}
          GROUP BY resource, rank
        `,

        // B-remainder #2: Valuable Social Media Content (MULTI_CHOICE).
        // Customer-quoted question: "What type of content do you find
        // most valuable on social media".
        //
        // v1.17.24: tightened keyword to `%type of content%` so we
        // don't pick up the ranking question ("...1 being the most
        // valuable...") which ALSO contains both "valuable" and
        // "social media" but is RANK_ORDER, not the multi-choice
        // content-type question.
        prisma.$queryRaw<{ name: string; count: number }[]>`
          SELECT name, SUM(count)::int AS count FROM (
            SELECT ${SC} AS name, 1 AS count
            FROM "SurveyResponseAnswer" sra
            JOIN "SurveyQuestion" sq ON sq.id = sra."questionId"
            JOIN "Question" q ON q.id = sq."questionId"
            JOIN "SurveyResponse" sr ON sr.id = sra."responseId"
            LEFT JOIN "Hcp" h ON h.id = sr."respondentHcpId"
            WHERE sr."campaignId" IN (${cids})
              AND sr.status = 'COMPLETED'
              AND LOWER(sq."questionTextSnapshot") LIKE '%type of content%'
              AND LOWER(sq."questionTextSnapshot") LIKE '%social media%'
              AND q."type" <> 'MULTI_CHOICE'
              AND ${SC} IS NOT NULL
            ${responseFilter}
            ${internalEmailFilter}
            UNION ALL
            SELECT jsonb_array_elements_text(sra."answerJson"->'selected') AS name, 1 AS count
            FROM "SurveyResponseAnswer" sra
            JOIN "SurveyQuestion" sq ON sq.id = sra."questionId"
            JOIN "Question" q ON q.id = sq."questionId"
            JOIN "SurveyResponse" sr ON sr.id = sra."responseId"
            LEFT JOIN "Hcp" h ON h.id = sr."respondentHcpId"
            WHERE sr."campaignId" IN (${cids})
              AND sr.status = 'COMPLETED'
              AND LOWER(sq."questionTextSnapshot") LIKE '%type of content%'
              AND LOWER(sq."questionTextSnapshot") LIKE '%social media%'
              AND q."type" = 'MULTI_CHOICE'
              AND sra."answerJson" ? 'selected'
              AND jsonb_typeof(sra."answerJson"->'selected') = 'array'
            ${responseFilter}
            ${internalEmailFilter}
          ) merged
          GROUP BY name
          ORDER BY count DESC, name ASC
        `,

        // B-remainder #3: Objectivity Rating (SINGLE_CHOICE).
        // Customer-quoted question: "How would you rate the overall
        // objectivity of leaders in DED". Same shape as byRole (Primary
        // Medical Specialty).
        prisma.$queryRaw<{ name: string; count: number }[]>`
          SELECT ${SC} AS name, COUNT(*)::int AS count
          FROM "SurveyResponseAnswer" sra
          JOIN "SurveyQuestion" sq ON sq.id = sra."questionId"
          JOIN "Question" q ON q.id = sq."questionId"
          JOIN "SurveyResponse" sr ON sr.id = sra."responseId"
          LEFT JOIN "Hcp" h ON h.id = sr."respondentHcpId"
          WHERE sr."campaignId" IN (${cids})
            AND sr.status = 'COMPLETED'
            AND LOWER(sq."questionTextSnapshot") LIKE '%objectivity%'
            AND ${SC} IS NOT NULL
          ${responseFilter}
          ${internalEmailFilter}
          GROUP BY 1
          ORDER BY count DESC, name ASC
        `,

        // Cross-tab data: per-respondent core focus (last-seen wins — Map
        // overwrites in old impl). Use DISTINCT ON to mirror that semantic.
        prisma.$queryRaw<{ respondentHcpId: string; coreFocus: string }[]>`
          SELECT DISTINCT ON (sr."respondentHcpId")
            sr."respondentHcpId", ${CORE_FOCUS} AS "coreFocus"
          FROM "SurveyResponseAnswer" sra
          JOIN "SurveyQuestion" sq ON sq.id = sra."questionId" JOIN "Question" q ON q.id = sq."questionId"
          JOIN "SurveyResponse" sr ON sr.id = sra."responseId"
          LEFT JOIN "Hcp" h ON h.id = sr."respondentHcpId"
          WHERE sr."campaignId" IN (${cids})
            AND sr.status = 'COMPLETED'
            AND LOWER(sq."questionTextSnapshot") LIKE '%core focus%'
            AND ${CORE_FOCUS} IS NOT NULL
          ${responseFilter}
          ${internalEmailFilter}
          ORDER BY sr."respondentHcpId", sra."id" DESC
        `,

        // Cross-tab data: per-respondent monthly patients (last-seen wins)
        prisma.$queryRaw<{ respondentHcpId: string; patients: number }[]>`
          SELECT DISTINCT ON (sr."respondentHcpId")
            sr."respondentHcpId", ${NUM} AS patients
          FROM "SurveyResponseAnswer" sra
          JOIN "SurveyQuestion" sq ON sq.id = sra."questionId" JOIN "Question" q ON q.id = sq."questionId"
          JOIN "SurveyResponse" sr ON sr.id = sra."responseId"
          LEFT JOIN "Hcp" h ON h.id = sr."respondentHcpId"
          WHERE sr."campaignId" IN (${cids})
            AND sr.status = 'COMPLETED'
            AND LOWER(sq."questionTextSnapshot") LIKE '%how many patients%'
            AND LOWER(sq."questionTextSnapshot") NOT LIKE '%dry eye%'
            AND ${NUM} IS NOT NULL
          ${responseFilter}
          ${internalEmailFilter}
          ORDER BY sr."respondentHcpId", sra."id" DESC
        `,
      ]);

      // Build distributions
      const cat = (rows: { name: string; count: number }[]): DistributionItem[] =>
        rows.map((r) => ({
          name: r.name,
          count: r.count,
          percentage: totalRespondents > 0 ? (r.count / totalRespondents) * 100 : 0,
        }));

      const byRole = cat(roleRows);
      const byPracticeSetting = cat(practiceSettingRows);
      const byCoreFocus = cat(coreFocusRows);
      const byState = cat(stateRows);

      // Decile rows → 'Decile N' labels for distribution.
      // v1.17.47 — sort by decile NUMBER (1 → 10) not count desc, so
      // the bar chart reads left-to-right in the natural decile order
      // instead of highest-population first. mapToDistribution defaults
      // to count-desc sort, which made sense for categorical labels
      // like states / specialties but not for an ordinal scale.
      const decileCounts = new Map<string, number>();
      for (const r of decileRows) decileCounts.set(`Decile ${r.decile}`, r.count);
      const byDecile = this.mapToDistribution(decileCounts, totalRespondents)
        .sort((a, b) => decileNum(a.name) - decileNum(b.name));

      const byMonthlyPatients = this.bucketNumbers(
        monthlyPatientsRows.map((r) => Number(r.val)),
        [
          { label: '0-100', min: 0, max: 100 },
          { label: '101-200', min: 101, max: 200 },
          { label: '201-300', min: 201, max: 300 },
          { label: '301-400', min: 301, max: 400 },
          { label: '401-500', min: 401, max: 500 },
          { label: '501-750', min: 501, max: 750 },
          { label: '751-1000', min: 751, max: 1000 },
          { label: '1000+', min: 1001, max: 999999 },
        ]
      );

      const byDedPatients = this.bucketNumbers(
        dedPatientsRows.map((r) => Number(r.val)),
        [
          { label: '0-25', min: 0, max: 25 },
          { label: '26-50', min: 26, max: 50 },
          { label: '51-100', min: 51, max: 100 },
          { label: '101-200', min: 101, max: 200 },
          { label: '201-300', min: 201, max: 300 },
          { label: '300+', min: 301, max: 999999 },
        ]
      );

      const byYearsInPractice = this.bucketNumbers(
        yearsRows.map((r) => Number(r.val)),
        [
          { label: '0-5', min: 0, max: 5 },
          { label: '6-10', min: 6, max: 10 },
          { label: '11-15', min: 11, max: 15 },
          { label: '16-20', min: 16, max: 20 },
          { label: '21-25', min: 21, max: 25 },
          { label: '26-30', min: 26, max: 30 },
          { label: '31+', min: 31, max: 999999 },
        ]
      );

      // Educational ranks — unflatten the (bucket, resource, rank, count)
      // rows into the Record<resource, {rank1..rank5}> shape that
      // buildEducationalResources expects.
      const unflattenRanks = (
        rows: { bucket: string; resource: string; rank: number; count: number }[],
        wantBucket: string
      ): Record<string, Record<string, number>> => {
        const out: Record<string, Record<string, number>> = {};
        for (const r of rows) {
          if (r.bucket !== wantBucket) continue;
          if (!out[r.resource]) {
            out[r.resource] = { rank1: 0, rank2: 0, rank3: 0, rank4: 0, rank5: 0 };
          }
          out[r.resource][`rank${r.rank}`] = r.count;
        }
        return out;
      };
      const educationalResources = this.buildEducationalResources(
        unflattenRanks(educationalRows, 'general')
      );
      const educationalResourcesAcademic = this.buildEducationalResources(
        unflattenRanks(educationalRows, 'academic')
      );
      const educationalResourcesOther = this.buildEducationalResources(
        unflattenRanks(educationalRows, 'other')
      );

      // Topics discussed: undefined if no campaign has the flag OR no
      // matching answers (matches the old impl's gate).
      const topicsDiscussed =
        anyShowTopics && topicsRows.length > 0 ? cat(topicsRows) : undefined;

      // Core focus by patients cross-tab: join the per-respondent maps in app.
      const coreFocusByResp = new Map(
        respondentCoreFocusRows.map((r) => [r.respondentHcpId, r.coreFocus])
      );
      const cfpMap = new Map<string, { totalPatients: number; count: number }>();
      for (const r of respondentMonthlyPatientsRows) {
        const cf = coreFocusByResp.get(r.respondentHcpId);
        if (!cf) continue;
        const existing = cfpMap.get(cf) || { totalPatients: 0, count: 0 };
        existing.totalPatients += Number(r.patients);
        existing.count += 1;
        cfpMap.set(cf, existing);
      }
      const coreFocusByPatients = Array.from(cfpMap.entries())
        .map(([coreFocus, data]) => ({
          coreFocus,
          totalPatients: data.totalPatients,
          count: data.count,
        }))
        .sort((a, b) => b.totalPatients - a.totalPatients);

      // B-remainder skeletons: convert to the response-friendly shapes.
      // socialMediaRanks reuses unflattenRanks → buildEducationalResources
      // (same {resource, rank1..rank5} shape; rendered the same way).
      // valuableContent + objectivityRating are categorical distributions
      // computed via `cat` (same shape as byRole).
      const socialMediaRanksFlat = socialMediaRanksRows.map((r) => ({
        bucket: 'general',
        resource: r.resource,
        rank: r.rank,
        count: r.count,
      }));
      const socialMediaRankings = this.buildEducationalResources(
        unflattenRanks(socialMediaRanksFlat, 'general')
      );
      const valuableContent = cat(valuableContentRows);
      const objectivityRating = cat(objectivityRatingRows);

      return {
        totalRespondents,
        byRole,
        byPracticeSetting,
        byCoreFocus,
        byMonthlyPatients,
        byDedPatients,
        byYearsInPractice,
        byState,
        byDecile,
        educationalResources,
        educationalResourcesAcademic,
        educationalResourcesOther,
        topicsDiscussed,
        coreFocusByPatients,
        socialMediaRankings,
        valuableContent,
        objectivityRating,
      };
    } catch (error) {
      logger.error('Error fetching demographics', { diseaseAreaId, error });
      throw error;
    }
  }

  /**
   * Get KOL nomination metadata - nominator survey answers for a specific KOL
   */
  async getKolNominationMetadata(diseaseAreaId: string, hcpId: string, clientId?: string) {
    try {
      // v1.17.50: accessible campaigns = owned UNION analysis-included
      // (see resolveAccessibleCampaignIds). PLATFORM_ADMIN (no clientId)
      // keeps the original DA-wide cross-tenant scope.
      const accessibleIds = clientId
        ? await this.resolveAccessibleCampaignIds(clientId, diseaseAreaId)
        : null;
      const campaigns = await prisma.campaign.findMany({
        where: accessibleIds
          ? { id: { in: accessibleIds } }
          : { diseaseAreaId },
        select: { id: true, showTopicsDiscussed: true, excludeInternalEmails: true },
      });
      const campaignIds = campaigns.map((c) => c.id);
      const anyShowTopics = campaigns.some((c) => c.showTopicsDiscussed);
      const excludeInternal = campaigns.some((c) => c.excludeInternalEmails);

      if (campaignIds.length === 0) {
        return { byPracticeSetting: [], byCoreFocus: [], byMonthlyPatients: [], byDedPatients: [], byYearsInPractice: [], byDecile: [], nominators: [] };
      }

      // Find all nominations for this KOL
      const nominations = await prisma.nomination.findMany({
        where: {
          matchedHcpId: hcpId,
          matchStatus: { in: ['MATCHED', 'NEW_HCP'] },
          response: {
            campaignId: { in: campaignIds },
            ...(excludeInternal && {
              respondentHcp: { email: { not: { endsWith: '@bio-exec.com' } } },
            }),
          },
        },
        select: {
          response: {
            select: {
              id: true,
              respondentHcpId: true,
              campaignId: true,
              respondentHcp: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  specialty: true,
                  state: true,
                  city: true,
                },
              },
            },
          },
        },
      });

      // Get unique nominator respondent HCP IDs and their response IDs
      const nominatorMap = new Map<string, { name: string; role: string; state: string; city: string; count: number; responseIds: string[] }>();
      for (const nom of nominations) {
        const hcp = nom.response.respondentHcp;
        const existing = nominatorMap.get(hcp.id);
        if (existing) {
          existing.count++;
          if (!existing.responseIds.includes(nom.response.id)) {
            existing.responseIds.push(nom.response.id);
          }
        } else {
          nominatorMap.set(hcp.id, {
            name: `${hcp.firstName} ${hcp.lastName}`,
            role: hcp.specialty || 'Unknown',
            state: hcp.state || 'Unknown',
            city: hcp.city || 'Unknown',
            count: 1,
            responseIds: [nom.response.id],
          });
        }
      }

      const nominatorHcpIds = Array.from(nominatorMap.keys());
      const responseIds = nominations.map((n) => n.response.id);

      if (nominatorHcpIds.length === 0) {
        return { byPracticeSetting: [], byCoreFocus: [], byMonthlyPatients: [], byDedPatients: [], byYearsInPractice: [], byDecile: [], nominators: [] };
      }

      // Get survey answers for all nominator responses
      const answers = await prisma.surveyResponseAnswer.findMany({
        where: {
          responseId: { in: [...new Set(responseIds)] },
        },
        select: {
          answerText: true,
          answerJson: true,
          responseId: true,
          question: {
            select: {
              questionTextSnapshot: true,
              campaignId: true,
              question: {
                select: { type: true },
              },
            },
          },
          response: {
            select: {
              respondentHcpId: true,
            },
          },
        },
      });

      // Get decile data
      const campaignHcps = await prisma.campaignHcp.findMany({
        where: {
          campaignId: { in: campaignIds },
          hcpId: { in: nominatorHcpIds },
        },
        select: {
          hcpId: true,
          marketDecile: true,
        },
      });

      const decileMap = new Map<string, number>();
      for (const ch of campaignHcps) {
        if (ch.marketDecile !== null) {
          decileMap.set(ch.hcpId, ch.marketDecile);
        }
      }

      // Aggregate per nominator
      const practiceSettingCounts = new Map<string, number>();
      const coreFocusCounts = new Map<string, number>();
      const monthlyPatientValues: number[] = [];
      const dedPatientValues: number[] = [];
      const yearsValues: number[] = [];
      const topicsDiscussedCounts = new Map<string, number>();
      const nominatorPracticeSetting = new Map<string, string>();
      const nominatorCoreFocus = new Map<string, string>();

      const campaignTopicsMap = new Map(campaigns.map((c) => [c.id, c.showTopicsDiscussed]));

      for (const answer of answers) {
        const qt = answer.question.questionTextSnapshot.toLowerCase();
        const questionType = answer.question.question.type;
        const json = answer.answerJson as Record<string, unknown> | null;
        const text = answer.answerText;
        const respondentId = answer.response.respondentHcpId;
        const campaignId = answer.question.campaignId;

        // 2026-06-02: same MULTI_CHOICE handling as the core-focus branch
        // below. Pre-fix this would silently produce an empty byPracticeSetting
        // for surveys where Practice Setting is multi-select.
        if (qt.includes('practice setting')) {
          if (questionType === 'MULTI_CHOICE' && json) {
            const selected = (json as { selected?: string[] }).selected;
            if (Array.isArray(selected) && selected.length > 0) {
              for (const s of selected) {
                practiceSettingCounts.set(s, (practiceSettingCounts.get(s) || 0) + 1);
              }
              nominatorPracticeSetting.set(respondentId, selected[selected.length - 1]);
            }
          } else {
            const value = this.extractSingleChoice(json, text, questionType);
            if (value) {
              practiceSettingCounts.set(value, (practiceSettingCounts.get(value) || 0) + 1);
              nominatorPracticeSetting.set(respondentId, value);
            }
          }
        }

        // 2026-06-02 Group E: same MULTI_CHOICE-blind bug as getDemographics
        // had pre-v1.17.13 — extractSingleChoice returns null for
        // MULTI_CHOICE, so Sun-Pharma-style surveys (where Core Focus is
        // multi-select) silently produced an empty byCoreFocus on the
        // KOL Profile page. Now handles MULTI_CHOICE selected-array
        // expansion like byPracticeSetting on getDemographics does.
        if (qt.includes('core focus')) {
          if (questionType === 'MULTI_CHOICE' && json) {
            const selected = (json as { selected?: string[] }).selected;
            if (Array.isArray(selected) && selected.length > 0) {
              for (const s of selected) {
                coreFocusCounts.set(s, (coreFocusCounts.get(s) || 0) + 1);
              }
              // Per-respondent map keeps last selection (arbitrary among
              // their MULTI_CHOICE picks) so cross-tabs that previously
              // used it still work for that respondent.
              nominatorCoreFocus.set(respondentId, selected[selected.length - 1]);
            }
          } else {
            const value = text || this.extractSingleChoice(json, text, questionType);
            if (value) {
              coreFocusCounts.set(value, (coreFocusCounts.get(value) || 0) + 1);
              nominatorCoreFocus.set(respondentId, value);
            }
          }
        }

        if (qt.includes('how many patients') && !qt.includes('dry eye')) {
          const num = this.parseNumber(text);
          if (num !== null) monthlyPatientValues.push(num);
        }

        if (qt.includes('dry eye') && qt.includes('patient')) {
          const num = this.parseNumber(text);
          if (num !== null) dedPatientValues.push(num);
        }

        if (qt.includes('years') && qt.includes('practice')) {
          const num = this.parseNumber(text);
          if (num !== null) yearsValues.push(num);
        }

        if (qt.includes('topics discussed') && anyShowTopics && campaignTopicsMap.get(campaignId)) {
          if (questionType === 'MULTI_CHOICE' && json) {
            const selected = (json as { selected?: string[] }).selected;
            if (Array.isArray(selected)) {
              for (const s of selected) {
                topicsDiscussedCounts.set(s, (topicsDiscussedCounts.get(s) || 0) + 1);
              }
            }
          } else {
            const value = this.extractSingleChoice(json, text, questionType);
            if (value) {
              topicsDiscussedCounts.set(value, (topicsDiscussedCounts.get(value) || 0) + 1);
            }
          }
        }
      }

      // Decile distribution
      const decileCounts = new Map<string, number>();
      for (const hcpId of nominatorHcpIds) {
        const decile = decileMap.get(hcpId);
        if (decile !== undefined) {
          const label = `Decile ${decile}`;
          decileCounts.set(label, (decileCounts.get(label) || 0) + 1);
        }
      }

      // Build nominator details
      const nominators = Array.from(nominatorMap.entries()).map(([hcpId, data]) => ({
        name: data.name,
        role: data.role,
        practiceSetting: nominatorPracticeSetting.get(hcpId) || 'Unknown',
        coreFocus: nominatorCoreFocus.get(hcpId) || 'Unknown',
        state: data.state,
        city: data.city,
        totalNominations: data.count,
      }));

      const byMonthlyPatients = this.bucketNumbersSimple(monthlyPatientValues, [
        { label: '0-100', min: 0, max: 100 },
        { label: '101-200', min: 101, max: 200 },
        { label: '201-300', min: 201, max: 300 },
        { label: '301-400', min: 301, max: 400 },
        { label: '401-500', min: 401, max: 500 },
        { label: '501-750', min: 501, max: 750 },
        { label: '751-1000', min: 751, max: 1000 },
        { label: '1000+', min: 1001, max: 999999 },
      ]);

      const byDedPatients = this.bucketNumbersSimple(dedPatientValues, [
        { label: '0-25', min: 0, max: 25 },
        { label: '26-50', min: 26, max: 50 },
        { label: '51-100', min: 51, max: 100 },
        { label: '101-200', min: 101, max: 200 },
        { label: '201-300', min: 201, max: 300 },
        { label: '300+', min: 301, max: 999999 },
      ]);

      const byYearsInPractice = this.bucketNumbersSimple(yearsValues, [
        { label: '0-5', min: 0, max: 5 },
        { label: '6-10', min: 6, max: 10 },
        { label: '11-15', min: 11, max: 15 },
        { label: '16-20', min: 16, max: 20 },
        { label: '21-25', min: 21, max: 25 },
        { label: '26-30', min: 26, max: 30 },
        { label: '31+', min: 31, max: 999999 },
      ]);

      const topicsDiscussed = anyShowTopics && topicsDiscussedCounts.size > 0
        ? Array.from(topicsDiscussedCounts.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
        : undefined;

      return {
        byPracticeSetting: this.mapToSimpleDistribution(practiceSettingCounts),
        byCoreFocus: this.mapToSimpleDistribution(coreFocusCounts),
        byMonthlyPatients,
        byDedPatients,
        byYearsInPractice,
        // v1.17.47 — same decile-ordinal sort as the demographics path.
        byDecile: this.mapToSimpleDistribution(decileCounts)
          .sort((a, b) => decileNum(a.name) - decileNum(b.name)),
        topicsDiscussed,
        nominators,
      };
    } catch (error) {
      logger.error('Error fetching KOL nomination metadata', { diseaseAreaId, hcpId, error });
      throw error;
    }
  }

  // --- Helper methods ---

  private extractSingleChoice(json: Record<string, unknown> | null, text: string | null, questionType: string): string | null {
    if (questionType === 'SINGLE_CHOICE' && json) {
      const selected = (json as { selected?: string }).selected;
      if (typeof selected === 'string') return selected;
    }
    if (questionType === 'DROPDOWN' && text) {
      return text;
    }
    if (text) return text;
    return null;
  }

  private parseNumber(text: string | null): number | null {
    if (!text) return null;
    const cleaned = text.replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  private mapToDistribution(counts: Map<string, number>, total: number): { name: string; count: number; percentage: number }[] {
    return Array.from(counts.entries())
      .map(([name, count]) => ({
        name,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  private mapToSimpleDistribution(counts: Map<string, number>): { name: string; count: number }[] {
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }

  private bucketNumbers(
    values: number[],
    ranges: { label: string; min: number; max: number }[]
  ): { name: string; count: number; percentage: number }[] {
    const total = values.length;
    const counts = new Map<string, number>();
    for (const range of ranges) {
      counts.set(range.label, 0);
    }
    for (const val of values) {
      for (const range of ranges) {
        if (val >= range.min && val <= range.max) {
          counts.set(range.label, (counts.get(range.label) || 0) + 1);
          break;
        }
      }
    }
    return ranges.map(({ label }) => ({
      name: label,
      count: counts.get(label) || 0,
      percentage: total > 0 ? ((counts.get(label) || 0) / total) * 100 : 0,
    }));
  }

  private bucketNumbersSimple(
    values: number[],
    ranges: { label: string; min: number; max: number }[]
  ): { name: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const range of ranges) {
      counts.set(range.label, 0);
    }
    for (const val of values) {
      for (const range of ranges) {
        if (val >= range.min && val <= range.max) {
          counts.set(range.label, (counts.get(range.label) || 0) + 1);
          break;
        }
      }
    }
    return ranges.map(({ label }) => ({
      name: label,
      count: counts.get(label) || 0,
    }));
  }

  private buildEducationalResources(
    ranks: Record<string, Record<string, number>>
  ): { resource: string; rank1: number; rank2: number; rank3: number; rank4: number; rank5: number }[] {
    return Object.entries(ranks)
      .map(([resource, counts]) => ({
        resource,
        rank1: counts.rank1 || 0,
        rank2: counts.rank2 || 0,
        rank3: counts.rank3 || 0,
        rank4: counts.rank4 || 0,
        rank5: counts.rank5 || 0,
      }))
      .sort((a, b) => (b.rank1 + b.rank2 + b.rank3) - (a.rank1 + a.rank2 + a.rank3));
  }

  private emptyDemographics() {
    return {
      totalRespondents: 0,
      byRole: [],
      byPracticeSetting: [],
      byCoreFocus: [],
      byMonthlyPatients: [],
      byDedPatients: [],
      byYearsInPractice: [],
      byState: [],
      byDecile: [],
      educationalResources: [],
      educationalResourcesAcademic: [],
      educationalResourcesOther: [],
      topicsDiscussed: undefined,
      coreFocusByPatients: [],
    };
  }

  /**
   * Load the live influencer-type thresholds from the singleton row.
   * Falls back to DEFAULT_INFLUENCER_THRESHOLDS if the row is missing
   * (e.g., a fresh DB where the seed migration hasn't run yet).
   *
   * **Cached at module scope for 60 s** (perf pass item #7). The win is
   * cross-request: an insights dashboard load fires 3-4 parallel API
   * calls to the 4 endpoints that consume thresholds (KOL Explorer,
   * Sociometric, Leader Rankings, KOL Profile) — each used to make its
   * own DB lookup of the same singleton row. With the cache, each
   * 60-second window does 1 lookup instead of 3-4 per request.
   *
   * Tuning lag: an operational `UPDATE InfluencerThreshold SET ...`
   * (the documented prod-rel-4.1.7 tuning flow) takes up to 60 s to
   * propagate. That's acceptable per the 4.1.7 handoff which already
   * frames tuning as out-of-band.
   */
  private async getInfluencerThresholds(): Promise<InfluencerThresholds> {
    const now = performance.now();
    if (influencerThresholdsCache && now < influencerThresholdsCache.expiresAt) {
      return influencerThresholdsCache.value;
    }
    const row = await prisma.influencerThreshold.findUnique({
      where: { id: 'default' },
    });
    const value: InfluencerThresholds = row
      ? {
          nationalLeader: {
            minCompositeScore: row.nationalLeaderMinComposite,
            minSurveyScore: row.nationalLeaderMinSurvey,
          },
          risingStar: {
            minSurveyScore: row.risingStarMinSurvey,
            maxCompositeScore: row.risingStarMaxComposite,
          },
        }
      : DEFAULT_INFLUENCER_THRESHOLDS;
    influencerThresholdsCache = { value, expiresAt: now + INFLUENCER_THRESHOLDS_TTL_MS };
    return value;
  }

  /**
   * Classify an HCP into an influencer-type bucket.
   * Thresholds are passed in (loaded once per request) so this stays sync
   * and cheap to call in tight per-HCP loops.
   */
  private determineInfluencerType(
    score: { compositeScore: unknown; scoreSurvey: unknown },
    thresholds: InfluencerThresholds,
  ): string {
    const composite = score.compositeScore ? Number(score.compositeScore) : 0;
    const survey = score.scoreSurvey ? Number(score.scoreSurvey) : 0;

    const { nationalLeader, risingStar } = thresholds;

    if (composite >= nationalLeader.minCompositeScore && survey >= nationalLeader.minSurveyScore) {
      return 'National Leaders';
    }
    if (survey >= risingStar.minSurveyScore && composite < risingStar.maxCompositeScore) {
      return 'Rising Stars';
    }
    return 'Regional Influencers';
  }

  /**
   * v1.17.52 — Track B (Apply Filters batch UX) backend.
   *
   * Three cheap COUNT methods that power the live "N match" indicator
   * next to the Apply Filters button. The point is to be MUCH cheaper
   * than the corresponding full-aggregation endpoint so the count can
   * update on every dropdown change (debounced ~250ms client-side).
   *
   * Semantic contract: "if I clicked Apply right now, how many of THIS
   * thing would the resulting page show?"
   *   - getKolMatchCount      → distinct HCPs (Sociometric Summary,
   *                              KOL Explorer, Benchmarking)
   *   - getRespondentMatchCount → distinct respondents (Demographics)
   *   - getNominatorMatchCount → distinct nominators of an HCP
   *                              (KOL Profile drill-down)
   *
   * Implementation choices:
   *   - Reuse existing helpers (resolveAnalysis, loadAnalysisScores,
   *     getFilteredResponseIds, computeRespondentFilteredCounts,
   *     loadManualInfluencerTypes, resolveAccessibleCampaignIds) so
   *     filter semantics stay aligned with the full endpoints.
   *   - HCP set is bounded (<1500 on prod) → applying score-range
   *     filters in JS post-load is fine; no need for SQL gymnastics.
   *   - No sort, no pagination, no aggregation columns returned.
   *
   * Each method returns `{ count }`. Frontend never sees the
   * intermediate scoreMap / hcp rows.
   */
  async getKolMatchCount(
    diseaseAreaId: string,
    filters: InsightsFilter,
    clientId?: string,
    respondentFilters?: RespondentFilters
  ): Promise<{ count: number }> {
    try {
      const analysis = await this.resolveAnalysis(clientId, diseaseAreaId);
      if (!analysis) return { count: 0 };

      const scoreMap = await this.loadAnalysisScores(analysis.id);
      let hcpIds = [...scoreMap.keys()];
      if (hcpIds.length === 0) return { count: 0 };

      // Respondent-filter funnel: keep only HCPs nominated by a
      // filtered response. Matches getSociometricSummary semantics.
      if (hasAnyRespondentFilter(respondentFilters)) {
        const includedCampaignIds = await this.loadIncludedCampaignIds(analysis.id);
        const filteredResponseIds = await this.getFilteredResponseIds(
          respondentFilters!,
          includedCampaignIds
        );
        if (filteredResponseIds.size === 0) return { count: 0 };
        const perHcpCounts = await this.computeRespondentFilteredCounts(filteredResponseIds);
        hcpIds = hcpIds.filter((id) => perHcpCounts.has(id));
        if (hcpIds.length === 0) return { count: 0 };
      }

      // Score-range filters — applied in JS against the cached
      // scoreMap. Mirrors getKolExplorer:673-682.
      const sf = filters as unknown as Record<string, number | undefined>;
      const num = (v: unknown): number | null => (v == null ? null : Number(v));
      const inRange = (v: number | null, min?: number, max?: number) => {
        if (min !== undefined && (v == null || v < min)) return false;
        if (max !== undefined && (v == null || v > max)) return false;
        return true;
      };
      // Live objective scores join (matches getKolExplorer).
      const objMap =
        sf.scorePublicationsMin !== undefined || sf.scorePublicationsMax !== undefined ||
        sf.scoreTradePubsMin !== undefined || sf.scoreTradePubsMax !== undefined ||
        sf.scoreOrgLeadershipMin !== undefined || sf.scoreOrgLeadershipMax !== undefined ||
        sf.scoreOrgAwardsMin !== undefined || sf.scoreOrgAwardsMax !== undefined ||
        sf.scoreClinicalTrialsMin !== undefined || sf.scoreClinicalTrialsMax !== undefined ||
        sf.scoreConferenceMin !== undefined || sf.scoreConferenceMax !== undefined ||
        sf.scoreSocialMediaMin !== undefined || sf.scoreSocialMediaMax !== undefined ||
        sf.scoreMediaPodcastsMin !== undefined || sf.scoreMediaPodcastsMax !== undefined
          ? await this.loadObjectiveScores(hcpIds, diseaseAreaId)
          : new Map();

      hcpIds = hcpIds.filter((id) => {
        const a = scoreMap.get(id);
        if (!a) return false;
        const o = objMap.get(id);
        if (!inRange(num(o?.scorePublications), sf.scorePublicationsMin, sf.scorePublicationsMax)) return false;
        if (!inRange(num(o?.scoreTradePubs), sf.scoreTradePubsMin, sf.scoreTradePubsMax)) return false;
        if (!inRange(num(o?.scoreOrgLeadership), sf.scoreOrgLeadershipMin, sf.scoreOrgLeadershipMax)) return false;
        if (!inRange(num(o?.scoreOrgAwards), sf.scoreOrgAwardsMin, sf.scoreOrgAwardsMax)) return false;
        if (!inRange(num(o?.scoreClinicalTrials), sf.scoreClinicalTrialsMin, sf.scoreClinicalTrialsMax)) return false;
        if (!inRange(num(o?.scoreConference), sf.scoreConferenceMin, sf.scoreConferenceMax)) return false;
        if (!inRange(num(o?.scoreSocialMedia), sf.scoreSocialMediaMin, sf.scoreSocialMediaMax)) return false;
        if (!inRange(num(o?.scoreMediaPodcasts), sf.scoreMediaPodcastsMin, sf.scoreMediaPodcastsMax)) return false;
        if (!inRange(num(a.scoreSurvey), sf.scoreSurveyMin, sf.scoreSurveyMax)) return false;
        if (!inRange(num(a.compositeScore), sf.compositeScoreMin, sf.compositeScoreMax)) return false;
        return true;
      });
      if (hcpIds.length === 0) return { count: 0 };

      // Manual influencer type filter (loaded only if requested).
      const influencerTypeFilter =
        filters.influencerTypes && filters.influencerTypes.length > 0
          ? filters.influencerTypes
          : filters.influencerType
            ? [filters.influencerType]
            : null;
      if (influencerTypeFilter) {
        const influencerTypeMap = await this.loadManualInfluencerTypes(hcpIds, diseaseAreaId);
        hcpIds = hcpIds.filter((id) => {
          const t = influencerTypeMap.get(id);
          return t != null && influencerTypeFilter.includes(t);
        });
        if (hcpIds.length === 0) return { count: 0 };
      }

      // Final: KOL-side categorical (specialty/state) + name/NPI
      // search, applied via a SQL COUNT (cheapest).
      const hcpWhere: Record<string, unknown> = { id: { in: hcpIds } };
      if (filters.specialties && filters.specialties.length > 0) {
        hcpWhere.specialty = { in: filters.specialties };
      } else if (filters.specialty) {
        hcpWhere.specialty = filters.specialty;
      }
      if (filters.states && filters.states.length > 0) {
        hcpWhere.state = { in: filters.states };
      } else if (filters.state) {
        hcpWhere.state = filters.state;
      }
      // Search: mirror getKolExplorer's "full name OR NPI contains" check.
      if (filters.search) {
        const s = filters.search;
        hcpWhere.OR = [
          { firstName: { contains: s, mode: 'insensitive' } },
          { lastName: { contains: s, mode: 'insensitive' } },
          { npi: { contains: s } },
        ];
      }

      const count = await prisma.hcp.count({ where: hcpWhere });
      return { count };
    } catch (error) {
      logger.error('Error computing KOL match count', { diseaseAreaId, error });
      throw error;
    }
  }

  async getRespondentMatchCount(
    diseaseAreaId: string,
    respondentFilters: RespondentFilters | undefined,
    clientId?: string
  ): Promise<{ count: number }> {
    try {
      if (!clientId) {
        // Same contract as the 5 analysis-backed endpoints (v1.17.2).
        throw new MissingClientIdError();
      }

      // Accessible campaigns = owned UNION analysis-included
      // (v1.17.50). Lite-client + cross-tenant friendly.
      const campaignIds = await this.resolveAccessibleCampaignIds(clientId, diseaseAreaId);
      if (campaignIds.length === 0) return { count: 0 };

      // Most-recent-completed-per-respondent (dedup), honoring each
      // campaign's own excludeInternalEmails flag — mirrors the
      // getDemographics line 1465+ semantic exactly.
      const latestRows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT ON (sr."respondentHcpId") sr.id
        FROM "SurveyResponse" sr
        JOIN "Campaign" c ON c.id = sr."campaignId"
        LEFT JOIN "Hcp" h ON h.id = sr."respondentHcpId"
        WHERE sr."campaignId" IN (${Prisma.join(campaignIds)})
          AND sr.status = 'COMPLETED'
          AND (
            c."excludeInternalEmails" = false
            OR h.email IS NULL
            OR h.email NOT LIKE '%@bio-exec.com'
          )
        ORDER BY sr."respondentHcpId", sr."completedAt" DESC NULLS LAST
      `;
      const latestResponseIds = new Set(latestRows.map((r) => r.id));
      if (latestResponseIds.size === 0) return { count: 0 };

      // If respondent filters active, intersect with the filtered set.
      if (hasAnyRespondentFilter(respondentFilters)) {
        const filtered = await this.getFilteredResponseIds(respondentFilters!, campaignIds);
        let n = 0;
        for (const id of latestResponseIds) if (filtered.has(id)) n++;
        return { count: n };
      }

      return { count: latestResponseIds.size };
    } catch (error) {
      logger.error('Error computing respondent match count', { diseaseAreaId, error });
      throw error;
    }
  }

  /**
   * v1.17.53 — survey-question text for each nomination type in the
   * analysis. Powers the (i) tooltip the Benchmarking tab shows on
   * each LeaderRankingPanel header so users can see what was asked
   * when these KOLs were nominated.
   *
   * Semantics: one entry per `nominationType` (the 7 enum values).
   * When an analysis pools campaigns whose questionTextSnapshot
   * happens to differ for the same nomination type — rare but
   * possible across multiple imports — we surface the text from the
   * **most recent campaign** (ordered by Campaign.createdAt DESC,
   * then SurveyQuestion.createdAt DESC). NominationTypes whose
   * included campaigns have no question rows are omitted.
   *
   * Returns: `{ items: [{ nominationType, text, campaignName }] }`.
   */
  async getNominationQuestions(
    diseaseAreaId: string,
    clientId?: string
  ): Promise<{ items: Array<{ nominationType: NominationType; text: string; campaignName: string }> }> {
    try {
      const analysis = await this.resolveAnalysis(clientId, diseaseAreaId);
      if (!analysis) return { items: [] };

      const campaignIds = await this.loadIncludedCampaignIds(analysis.id);
      if (campaignIds.length === 0) return { items: [] };

      const rows = await prisma.$queryRaw<
        Array<{ nominationType: string; text: string; campaignName: string }>
      >`
        SELECT DISTINCT ON (sq."nominationType")
          sq."nominationType" AS "nominationType",
          sq."questionTextSnapshot" AS "text",
          c.name AS "campaignName"
        FROM "SurveyQuestion" sq
        JOIN "Campaign" c ON c.id = sq."campaignId"
        WHERE sq."campaignId" IN (${Prisma.join(campaignIds)})
          AND sq."nominationType" IS NOT NULL
        ORDER BY sq."nominationType", c."createdAt" DESC, sq."createdAt" DESC
      `;

      return {
        items: rows.map((r) => ({
          nominationType: r.nominationType as NominationType,
          text: r.text,
          campaignName: r.campaignName,
        })),
      };
    } catch (error) {
      logger.error('Error fetching nomination questions', { diseaseAreaId, error });
      throw error;
    }
  }

  /**
   * v1.17.53 — survey-question text for each Demographics chart
   * dimension. Same UX value as getNominationQuestions but keyed by
   * dimension slug (the Demographics tab doesn't use the
   * NominationType enum; its charts are matched by LIKE-pattern
   * against questionTextSnapshot, mirroring the patterns in
   * computeFilteredResponseIds + getDemographics).
   *
   * Returns one entry per dimension that has at least one matching
   * SurveyQuestion in the analysis's included campaigns. Most recent
   * Campaign wins on ties — same semantic as getNominationQuestions.
   */
  async getDemographicQuestions(
    diseaseAreaId: string,
    clientId?: string
  ): Promise<{ items: Array<{ dimension: string; text: string; campaignName: string }> }> {
    try {
      const analysis = await this.resolveAnalysis(clientId, diseaseAreaId);
      if (!analysis) return { items: [] };

      const campaignIds = await this.loadIncludedCampaignIds(analysis.id);
      if (campaignIds.length === 0) return { items: [] };

      // Pattern map: keys mirror the dimension slugs the Demographics
      // tab renders chart cards for. Each value is a LIKE-style match
      // against LOWER(questionTextSnapshot). Order here = output order.
      const DIMENSIONS: Array<{ key: string; include: string[]; exclude?: string[] }> = [
        { key: 'role', include: ['primary medical specialty'] },
        { key: 'coreFocus', include: ['core focus'] },
        { key: 'practiceSetting', include: ['practice setting'] },
        { key: 'yearsInPractice', include: ['years', 'practice'] },
        { key: 'monthlyPatients', include: ['how many patients'], exclude: ['dry eye'] },
        { key: 'dedPatients', include: ['dry eye', 'patient'] },
        { key: 'topicsDiscussed', include: ['topics discussed'] },
        { key: 'educationalResources', include: ['educational'] },
        { key: 'socialMedia', include: ['social media'] },
        { key: 'valuableContent', include: ['valuable'] },
        { key: 'objectivity', include: ['objectivity'] },
      ];

      const out: Array<{ dimension: string; text: string; campaignName: string }> = [];
      for (const d of DIMENSIONS) {
        const includeFrag = Prisma.join(
          d.include.map((s) => Prisma.sql`LOWER(sq."questionTextSnapshot") LIKE ${'%' + s + '%'}`),
          ' AND '
        );
        const excludeFrag = d.exclude && d.exclude.length > 0
          ? Prisma.sql` AND ${Prisma.join(
              d.exclude.map((s) => Prisma.sql`LOWER(sq."questionTextSnapshot") NOT LIKE ${'%' + s + '%'}`),
              ' AND '
            )}`
          : Prisma.empty;

        const rows = await prisma.$queryRaw<
          Array<{ text: string; campaignName: string }>
        >`
          SELECT sq."questionTextSnapshot" AS "text", c.name AS "campaignName"
          FROM "SurveyQuestion" sq
          JOIN "Campaign" c ON c.id = sq."campaignId"
          WHERE sq."campaignId" IN (${Prisma.join(campaignIds)})
            AND ${includeFrag}
            ${excludeFrag}
          ORDER BY c."createdAt" DESC, sq."createdAt" DESC
          LIMIT 1
        `;
        if (rows.length > 0) {
          out.push({ dimension: d.key, text: rows[0].text, campaignName: rows[0].campaignName });
        }
      }

      return { items: out };
    } catch (error) {
      logger.error('Error fetching demographic questions', { diseaseAreaId, error });
      throw error;
    }
  }

  async getNominatorMatchCount(
    diseaseAreaId: string,
    hcpId: string,
    respondentFilters: RespondentFilters | undefined,
    clientId?: string
  ): Promise<{ count: number }> {
    try {
      const analysis = await this.resolveAnalysis(clientId, diseaseAreaId);
      if (!analysis) return { count: 0 };

      const includedCampaignIds = await this.loadIncludedCampaignIds(analysis.id);
      if (includedCampaignIds.length === 0) return { count: 0 };

      const responseFilter = hasAnyRespondentFilter(respondentFilters)
        ? await this.getFilteredResponseIds(respondentFilters!, includedCampaignIds)
        : null;
      if (responseFilter !== null && responseFilter.size === 0) return { count: 0 };

      // Distinct nominator HCP IDs for nominations matched to this HCP.
      // Scoped to the analysis's included campaigns; if respondent
      // filters are active, also scope to responseFilter.
      const rows = await prisma.nomination.findMany({
        where: {
          matchedHcpId: hcpId,
          matchStatus: { in: ['MATCHED', 'NEW_HCP'] },
          // nominatorHcpId is NOT NULL in schema — every nomination has
          // a nominator (the respondent who submitted the survey).
          response: {
            campaignId: { in: includedCampaignIds },
            ...(responseFilter && { id: { in: [...responseFilter] } }),
          },
        },
        select: { nominatorHcpId: true },
        distinct: ['nominatorHcpId'],
      });
      return { count: rows.length };
    } catch (error) {
      logger.error('Error computing nominator match count', { diseaseAreaId, hcpId, error });
      throw error;
    }
  }
}

export const insightsReportService = new InsightsReportService();
