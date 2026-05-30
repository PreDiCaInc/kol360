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
  RespondentAnalytics,
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
   * v1.17.5: shared respondent-filter pipeline. Returns the set of
   * SurveyResponse IDs that pass ALL active filters.
   *
   * Used by getDemographics (filters which answers feed aggregations)
   * and by getLeaderRankings / getSociometricSummary (filters which
   * nominations count toward leader/sociometric counts).
   *
   * Caller pre-loads the answers (so the same query that drives the
   * caller's main work is reused — avoids a redundant DB round-trip).
   * Empty `answers` input returns empty Set. The caller is expected to
   * skip calling this helper entirely if `hasAnyRespondentFilter(f)`
   * returns false — see callers for the gate.
   *
   * Filter semantics:
   *  - 4 categorical filters: each accepts string[]; "value passes" if
   *    `accept.has(answer)`. Empty array = no filter on that field.
   *  - 3 range filters: numeric min/max; both bounds optional.
   *  - All active filters AND together (set intersection).
   */
  private async computeFilteredResponseIds(
    filters: RespondentFilters,
    answers: Array<{
      answerText: string | null;
      answerJson: unknown;
      question: {
        questionTextSnapshot: string;
        question: { type: string };
      };
      response: {
        id: string;
        respondentHcp?: { state: string | null } | null;
      };
    }>
  ): Promise<Set<string>> {
    let filteredResponseIds = new Set<string>(answers.map((a) => a.response.id));

    const intersect = (matching: Set<string>) => {
      filteredResponseIds = new Set([...filteredResponseIds].filter((id) => matching.has(id)));
    };

    if (filters.respondentRoles && filters.respondentRoles.length > 0) {
      const accept = new Set(filters.respondentRoles);
      const matching = new Set<string>();
      for (const a of answers) {
        const qt = a.question.questionTextSnapshot.toLowerCase();
        if (qt.includes('primary medical specialty')) {
          const value = this.extractSingleChoice(
            a.answerJson as Record<string, unknown> | null,
            a.answerText,
            a.question.question.type
          );
          if (value && accept.has(value)) matching.add(a.response.id);
        }
      }
      intersect(matching);
    }

    if (filters.coreFocuses && filters.coreFocuses.length > 0) {
      const accept = new Set(filters.coreFocuses);
      const matching = new Set<string>();
      for (const a of answers) {
        const qt = a.question.questionTextSnapshot.toLowerCase();
        if (qt.includes('core focus')) {
          const value =
            a.answerText ||
            this.extractSingleChoice(
              a.answerJson as Record<string, unknown> | null,
              a.answerText,
              a.question.question.type
            );
          if (value && accept.has(value)) matching.add(a.response.id);
        }
      }
      intersect(matching);
    }

    if (filters.stateOfPractices && filters.stateOfPractices.length > 0) {
      const accept = new Set(filters.stateOfPractices);
      const matching = new Set<string>();
      for (const a of answers) {
        const state = a.response.respondentHcp?.state;
        if (state && accept.has(state)) matching.add(a.response.id);
      }
      intersect(matching);
    }

    if (filters.practiceSettings && filters.practiceSettings.length > 0) {
      const accept = new Set(filters.practiceSettings);
      const matching = new Set<string>();
      for (const a of answers) {
        const qt = a.question.questionTextSnapshot.toLowerCase();
        if (qt.includes('practice setting')) {
          const questionType = a.question.question.type;
          if (questionType === 'MULTI_CHOICE' && a.answerJson) {
            const selected = (a.answerJson as { selected?: string[] }).selected;
            if (Array.isArray(selected) && selected.some((s) => accept.has(s))) {
              matching.add(a.response.id);
            }
          } else {
            const value = this.extractSingleChoice(
              a.answerJson as Record<string, unknown> | null,
              a.answerText,
              questionType
            );
            if (value && accept.has(value)) matching.add(a.response.id);
          }
        }
      }
      intersect(matching);
    }

    if (filters.yearsMin !== undefined || filters.yearsMax !== undefined) {
      const matching = new Set<string>();
      for (const a of answers) {
        const qt = a.question.questionTextSnapshot.toLowerCase();
        if (qt.includes('years') && qt.includes('practice')) {
          const num = this.parseNumber(a.answerText);
          if (num !== null) {
            const passMin = filters.yearsMin === undefined || num >= filters.yearsMin;
            const passMax = filters.yearsMax === undefined || num <= filters.yearsMax;
            if (passMin && passMax) matching.add(a.response.id);
          }
        }
      }
      intersect(matching);
    }

    if (filters.monthlyPatientsMin !== undefined || filters.monthlyPatientsMax !== undefined) {
      const matching = new Set<string>();
      for (const a of answers) {
        const qt = a.question.questionTextSnapshot.toLowerCase();
        if (qt.includes('how many patients') && !qt.includes('dry eye')) {
          const num = this.parseNumber(a.answerText);
          if (num !== null) {
            const passMin = filters.monthlyPatientsMin === undefined || num >= filters.monthlyPatientsMin;
            const passMax = filters.monthlyPatientsMax === undefined || num <= filters.monthlyPatientsMax;
            if (passMin && passMax) matching.add(a.response.id);
          }
        }
      }
      intersect(matching);
    }

    if (filters.dedPatientsMin !== undefined || filters.dedPatientsMax !== undefined) {
      const matching = new Set<string>();
      for (const a of answers) {
        const qt = a.question.questionTextSnapshot.toLowerCase();
        if (qt.includes('dry eye') && qt.includes('patient')) {
          const num = this.parseNumber(a.answerText);
          if (num !== null) {
            const passMin = filters.dedPatientsMin === undefined || num >= filters.dedPatientsMin;
            const passMax = filters.dedPatientsMax === undefined || num <= filters.dedPatientsMax;
            if (passMin && passMax) matching.add(a.response.id);
          }
        }
      }
      intersect(matching);
    }

    return filteredResponseIds;
  }

  /**
   * v1.17.5: companion to computeFilteredResponseIds. Given a set of
   * response IDs that pass respondent filters, count nominations per HCP
   * per nomination-type, restricted to nominations whose responseId is in
   * the set. Used by getLeaderRankings + getSociometricSummary to
   * recompute per-type counts on the fly when respondent filters are
   * active (bypassing the pre-aggregated HcpAnalysisScore counts).
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
   * v1.17.5: shared loader for the answer set that drives respondent
   * filtering on the leader-rankings + sociometric-summary endpoints.
   * Scoped to the analysis's included campaigns + the campaign-level
   * excludeInternalEmails flag (any included campaign with the flag on
   * triggers the exclusion globally, matching getDemographics' behavior).
   */
  private async loadAnswersForRespondentFilter(
    includedCampaignIds: string[]
  ): Promise<
    Array<{
      answerText: string | null;
      answerJson: unknown;
      question: { questionTextSnapshot: string; question: { type: string } };
      response: { id: string; respondentHcp: { state: string | null } | null };
    }>
  > {
    if (includedCampaignIds.length === 0) return [];
    const campaigns = await prisma.campaign.findMany({
      where: { id: { in: includedCampaignIds } },
      select: { id: true, excludeInternalEmails: true },
    });
    const excludeInternal = campaigns.some((c) => c.excludeInternalEmails);

    return prisma.surveyResponseAnswer.findMany({
      where: {
        response: {
          campaignId: { in: includedCampaignIds },
          status: 'COMPLETED',
          ...(excludeInternal && {
            respondentHcp: { email: { not: { endsWith: '@bio-exec.com' } } },
          }),
        },
      },
      select: {
        answerText: true,
        answerJson: true,
        question: {
          select: {
            questionTextSnapshot: true,
            question: { select: { type: true } },
          },
        },
        response: {
          select: {
            id: true,
            respondentHcp: { select: { state: true } },
          },
        },
      },
    });
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

      // Campaign filter scoped to the selected client.
      const campaignFilter: Record<string, unknown> = { diseaseAreaId, clientId };

      const [scoreAgg, totalCampaigns, totalNominations] = await Promise.all([
        // KOL count + avg composite from the analysis's scores.
        prisma.hcpAnalysisScore.aggregate({
          where: { analysisId: analysis.id },
          _count: { _all: true },
          _avg: { compositeScore: true },
        }),
        prisma.campaign.count({ where: campaignFilter }),
        prisma.nomination.count({
          where: { response: { campaign: campaignFilter } },
        }),
      ]);

      const totalRespondents = await prisma.surveyResponse.count({
        where: { status: 'COMPLETED', campaign: campaignFilter },
      });

      return {
        totalKols: scoreAgg._count._all,
        totalRespondents,
        totalNominations,
        totalCampaigns,
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

      const [objMap, hcps] = await Promise.all([
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
      const thresholds = await this.getInfluencerThresholds();
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
        const influencerTypeVal = this.determineInfluencerType({
          compositeScore: a.compositeScore,
          scoreSurvey: a.scoreSurvey,
        }, thresholds);
        if (
          influencerTypeFilter &&
          !influencerTypeFilter.includes(influencerTypeVal)
        ) {
          continue;
        }

        rows.push({
          id: hcp.id,
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
    _excludeInternalEmails = false,
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
      const includedCampaignIds = await this.loadIncludedCampaignIds(analysis.id);
      const answers = await this.loadAnswersForRespondentFilter(includedCampaignIds);
      const filteredResponseIds = await this.computeFilteredResponseIds(
        respondentFilters!,
        answers
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
    const hcps = await prisma.hcp.findMany({
      where: hcpWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        specialty: true,
        city: true,
        state: true,
        specialties: {
          where: { isPrimary: true },
          include: { specialty: true },
          take: 1,
        },
      },
    });
    const hcpMap = new Map(hcps.map((h) => [h.id, h]));
    const thresholds = await this.getInfluencerThresholds();

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
        name: `${hcp.firstName} ${hcp.lastName}`,
        // v1.15.31: see same comment above — match both shapes for safety.
        degree: primarySpecialty?.includes('Ophthalmolog') ? 'MD' : 'OD',
        specialty: primarySpecialty,
        city: hcp.city,
        state: hcp.state,
        count: r.count,
        // v1.17.5: r.score may be undefined under respondent filtering
        // (the HCP appears in filtered nominations but not in the
        // pre-aggregated scoreMap). determineInfluencerType handles
        // missing values gracefully (defaults to 0).
        influencerType: this.determineInfluencerType({
          compositeScore: r.score?.compositeScore ?? null,
          scoreSurvey: r.score?.scoreSurvey ?? null,
        }, thresholds),
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
  async getKolProfile(diseaseAreaId: string, hcpId: string, excludeInternalEmails = false, clientId?: string): Promise<KolProfileWithNominators | null> {
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
    const thresholds = await this.getInfluencerThresholds();

    // Nominators list — scoped to the analysis's included campaigns so it
    // matches the pooled scores.
    const nominations = includedCampaignIds.length === 0 ? [] : await prisma.nomination.findMany({
      where: {
        matchedHcpId: hcpId,
        matchStatus: { in: ['MATCHED', 'NEW_HCP'] },
        response: {
          campaignId: { in: includedCampaignIds },
          ...(excludeInternalEmails && {
            respondentHcp: { email: { not: { endsWith: '@bio-exec.com' } } },
          }),
        },
      },
      include: {
        question: {
          select: { nominationType: true },
        },
        nominatorHcp: {
          select: {
            id: true,
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

    // Build nominators list
    const nominators: NominatorItem[] = nominations
      .filter((n) => n.nominatorHcp)
      .map((n) => {
        const nomHcp = n.nominatorHcp!;
        return {
          id: nomHcp.id,
          name: `${nomHcp.firstName} ${nomHcp.lastName}`,
          specialty: nomHcp.specialty,
          state: nomHcp.state,
          nominationType: n.question.nominationType as NominationType,
          campaignName: n.response?.campaign?.name || 'Unknown Campaign',
          respondedAt: n.createdAt.toISOString(),
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
      influencerType: this.determineInfluencerType({
        compositeScore: a.compositeScore,
        scoreSurvey: a.scoreSurvey,
      }, thresholds),
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
    const { page, limit, search, specialty, state, sortBy, sortOrder } = filters;

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
      const includedCampaignIds = await this.loadIncludedCampaignIds(analysis.id);
      const answers = await this.loadAnswersForRespondentFilter(includedCampaignIds);
      const filteredResponseIds = await this.computeFilteredResponseIds(
        respondentFilters!,
        answers
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
    const thresholds = await this.getInfluencerThresholds();
    // Perf pass #6 (Sociometric Summary): narrow to the 6 fields consumed below.
    const hcps = await prisma.hcp.findMany({
      where: {
        id: { in: baseHcpIds },
        ...(specialty ? { specialty } : {}),
        ...(state ? { state } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        specialty: true,
        city: true,
        state: true,
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
      all.push({
        rank: 0, // assigned after global sort
        hcpId: hcp.id,
        name: `${hcp.firstName} ${hcp.lastName}`,
        specialty: primarySpecialty,
        city: hcp.city,
        state: hcp.state,
        influencerType: this.determineInfluencerType({
          compositeScore: a?.compositeScore ?? null,
          scoreSurvey: a?.scoreSurvey ?? null,
        }, thresholds),
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
    const order = sortOrder === 'asc' ? 1 : -1;
    all.sort((a, b) => {
      if (field === 'name') return order * a.name.localeCompare(b.name);
      const aVal = ((a as Record<string, unknown>)[field!] as number) || 0;
      const bVal = ((b as Record<string, unknown>)[field!] as number) || 0;
      return order * (bVal - aVal);
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
   * Get respondent analytics - demographics and survey behavior
   */
  async getRespondentAnalytics(diseaseAreaId: string, excludeInternalEmails = false, clientId?: string): Promise<RespondentAnalytics> {
    try {
    // Build HCP email filter for excluding internal emails
    const hcpEmailFilter = excludeInternalEmails
      ? { email: { not: { endsWith: '@bio-exec.com' } } }
      : undefined;

    // Get all campaigns for this disease area (scoped to client if provided)
    const campaigns = await prisma.campaign.findMany({
      where: { diseaseAreaId, ...(clientId && { clientId }) },
      select: { id: true },
    });
    const campaignIds = campaigns.map((c) => c.id);

    // Get all campaign HCPs (potential respondents)
    const campaignHcps = await prisma.campaignHcp.findMany({
      where: {
        campaignId: { in: campaignIds },
        ...(hcpEmailFilter && { hcp: hcpEmailFilter }),
      },
      include: {
        hcp: {
          select: {
            specialty: true,
            state: true,
            yearsInPractice: true,
          },
        },
      },
    });

    // Get all survey responses
    const responses = await prisma.surveyResponse.findMany({
      where: {
        campaignId: { in: campaignIds },
        ...(hcpEmailFilter && { respondentHcp: hcpEmailFilter }),
      },
      select: {
        id: true,
        status: true,
        completedAt: true,
        respondentHcpId: true,
      },
      orderBy: { completedAt: 'asc' },
    });

    const totalRespondents = campaignHcps.length;
    const completedSurveys = responses.filter((r) => r.status === 'COMPLETED').length;
    const responseRate = totalRespondents > 0 ? (completedSurveys / totalRespondents) * 100 : 0;

    // Helper to create distribution
    const createDistribution = (items: (string | null | undefined)[]): DistributionItem[] => {
      const counts = new Map<string, number>();
      for (const item of items) {
        const key = item || 'Unknown';
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const total = items.length;
      return Array.from(counts.entries())
        .map(([name, count]) => ({
          name,
          count,
          percentage: total > 0 ? (count / total) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count);
    };

    // Helper to create numeric range distribution
    const createRangeDistribution = (values: (number | null | undefined)[], ranges: { label: string; min: number; max: number }[]): DistributionItem[] => {
      const counts = new Map<string, number>();
      for (const range of ranges) {
        counts.set(range.label, 0);
      }
      for (const val of values) {
        if (val === null || val === undefined) continue;
        for (const range of ranges) {
          if (val >= range.min && val <= range.max) {
            counts.set(range.label, (counts.get(range.label) || 0) + 1);
            break;
          }
        }
      }
      const total = values.filter((v) => v !== null && v !== undefined).length;
      return ranges.map(({ label }) => ({
        name: label,
        count: counts.get(label) || 0,
        percentage: total > 0 ? ((counts.get(label) || 0) / total) * 100 : 0,
      }));
    };

    // Years in practice ranges
    const yearsRanges = [
      { label: '0-5 years', min: 0, max: 5 },
      { label: '6-10 years', min: 6, max: 10 },
      { label: '11-20 years', min: 11, max: 20 },
      { label: '21-30 years', min: 21, max: 30 },
      { label: '31+ years', min: 31, max: 100 },
    ];

    // Decile ranges (1-10)
    const decileRanges = Array.from({ length: 10 }, (_, i) => ({
      label: `Decile ${i + 1}`,
      min: i + 1,
      max: i + 1,
    }));

    // Build distributions
    const bySpecialty = createDistribution(campaignHcps.map((ch) => ch.hcp.specialty));
    const byState = createDistribution(campaignHcps.map((ch) => ch.hcp.state));
    const byPracticeSetting = createDistribution(campaignHcps.map((ch) => ch.practiceSetting));
    const byYearsInPractice = createRangeDistribution(
      campaignHcps.map((ch) => ch.hcp.yearsInPractice),
      yearsRanges
    );
    const byMarketDecile = createRangeDistribution(
      campaignHcps.map((ch) => ch.marketDecile),
      decileRanges
    );
    const byProduct1Decile = createRangeDistribution(
      campaignHcps.map((ch) => ch.product1Decile),
      decileRanges
    );
    const byPrescribingBehavior = createDistribution(campaignHcps.map((ch) => ch.prescribingBehavior));
    const bySurveyStatus = createDistribution(responses.map((r) => r.status));

    // Completion over time (daily counts)
    const completionMap = new Map<string, { count: number; cumulative: number }>();
    let cumulative = 0;
    for (const r of responses.filter((r) => r.completedAt && r.status === 'COMPLETED')) {
      const date = r.completedAt!.toISOString().split('T')[0];
      cumulative++;
      completionMap.set(date, { count: (completionMap.get(date)?.count || 0) + 1, cumulative });
    }
    // Recalculate cumulative properly
    let runningTotal = 0;
    const completionOverTime = Array.from(completionMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => {
        runningTotal += data.count;
        return { date, count: data.count, cumulative: runningTotal };
      });

    return {
      totalRespondents,
      completedSurveys,
      responseRate,
      bySpecialty,
      byState,
      byPracticeSetting,
      byYearsInPractice,
      byMarketDecile,
      byProduct1Decile,
      byPrescribingBehavior,
      bySurveyStatus,
      completionOverTime,
    };
    } catch (error) {
      logger.error('Error fetching respondent analytics', { diseaseAreaId, error });
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
      const [specialtyRows, stateRows] = await Promise.all([
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
      ]);

      // v1.17.4: state filter whitelist — only emit US 50 + DC.
      // Customers (Sun Pharma, B+L) are US-only; non-US values like 'AB'
      // (Alberta) or 'AU' (Australia) had leaked into the dropdown from
      // legacy NPI imports. Hardcoded for now; revisit as a per-client
      // Client.region setting if/when we onboard a non-US customer.
      const specialties = specialtyRows.map((r) => r.specialty);
      const states = stateRows.map((r) => r.state).filter((s) => US_STATE_CODES.has(s));

      return {
        specialties,
        states,
        influencerTypes: ['National Leaders', 'Rising Stars', 'Regional Influencers'],
      };
    } catch (error) {
      logger.error('Error fetching filter options', { diseaseAreaId, error });
      throw error;
    }
  }

  /**
   * Get demographics data from survey response answers
   */
  async getDemographics(diseaseAreaId: string, clientId?: string, filters?: RespondentFilters) {
    try {
      // Get all campaigns for this disease area (scoped to client if provided)
      const campaigns = await prisma.campaign.findMany({
        where: { diseaseAreaId, ...(clientId && { clientId }) },
        select: { id: true, excludeInternalEmails: true, showTopicsDiscussed: true },
      });
      const campaignIds = campaigns.map((c) => c.id);
      const anyShowTopics = campaigns.some((c) => c.showTopicsDiscussed);
      const excludeInternal = campaigns.some((c) => c.excludeInternalEmails);

      if (campaignIds.length === 0) {
        return this.emptyDemographics();
      }

      // Get all completed survey response answers with question text and type
      const answers = await prisma.surveyResponseAnswer.findMany({
        where: {
          response: {
            campaignId: { in: campaignIds },
            status: 'COMPLETED',
            ...(excludeInternal && {
              respondentHcp: { email: { not: { endsWith: '@bio-exec.com' } } },
            }),
          },
        },
        select: {
          answerText: true,
          answerJson: true,
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
              id: true,
              respondentHcpId: true,
              campaignId: true,
              respondentHcp: {
                select: { state: true },
              },
            },
          },
        },
      });

      // v1.17.5: filtering extracted to computeFilteredResponseIds — shared
      // with getLeaderRankings + getSociometricSummary so the same
      // respondent filters apply consistently across the 3 surfaces.
      // Gate on hasAnyRespondentFilter so we skip a pointless pass when
      // no filters are active.
      const filteredResponseIds = hasAnyRespondentFilter(filters)
        ? await this.computeFilteredResponseIds(filters!, answers)
        : null;

      // If filters were applied, narrow answers to only matching responses
      const effectiveAnswers = filteredResponseIds
        ? answers.filter(a => filteredResponseIds!.has(a.response.id))
        : answers;

      // Get unique respondent IDs for total count (use effectiveAnswers for filtered results)
      const respondentIds = new Set(effectiveAnswers.map((a) => a.response.respondentHcpId));
      const totalRespondents = respondentIds.size;

      // Get decile data from CampaignHcp
      const campaignHcps = await prisma.campaignHcp.findMany({
        where: {
          campaignId: { in: campaignIds },
          hcpId: { in: Array.from(respondentIds) },
        },
        select: {
          hcpId: true,
          marketDecile: true,
        },
      });

      // Build decile map (hcpId -> marketDecile)
      const decileMap = new Map<string, number>();
      for (const ch of campaignHcps) {
        if (ch.marketDecile !== null) {
          decileMap.set(ch.hcpId, ch.marketDecile);
        }
      }

      // Campaign showTopicsDiscussed map
      const campaignTopicsMap = new Map(campaigns.map((c) => [c.id, c.showTopicsDiscussed]));

      // Aggregate distributions
      const roleCounts = new Map<string, number>();
      const practiceSettingCounts = new Map<string, number>();
      const coreFocusCounts = new Map<string, number>();
      const monthlyPatientValues: number[] = [];
      const dedPatientValues: number[] = [];
      const yearsValues: number[] = [];
      const stateCounts = new Map<string, number>();
      const educationalRanks: Record<string, Record<string, number>> = {};
      const educationalRanksAcademic: Record<string, Record<string, number>> = {};
      const educationalRanksOther: Record<string, Record<string, number>> = {};
      const topicsDiscussedCounts = new Map<string, number>();
      // Track core focus per respondent for cross-tabulation
      const respondentCoreFocus = new Map<string, string>();
      const respondentMonthlyPatients = new Map<string, number>();

      // Track states from respondent HCPs (only count each respondent once)
      const stateTracked = new Set<string>();

      for (const answer of effectiveAnswers) {
        const qt = answer.question.questionTextSnapshot.toLowerCase();
        const questionType = answer.question.question.type;
        const json = answer.answerJson as Record<string, unknown> | null;
        const text = answer.answerText;
        const respondentId = answer.response.respondentHcpId;
        const campaignId = answer.response.campaignId;

        // C1.2 Role / Primary Medical Specialty
        if (qt.includes('primary medical specialty')) {
          const value = this.extractSingleChoice(json, text, questionType);
          if (value) {
            roleCounts.set(value, (roleCounts.get(value) || 0) + 1);
          }
        }

        // C1.8 Practice Setting
        if (qt.includes('practice setting')) {
          if (questionType === 'MULTI_CHOICE' && json) {
            const selected = (json as { selected?: string[] }).selected;
            if (Array.isArray(selected)) {
              for (const s of selected) {
                practiceSettingCounts.set(s, (practiceSettingCounts.get(s) || 0) + 1);
              }
            }
          } else {
            const value = this.extractSingleChoice(json, text, questionType);
            if (value) {
              practiceSettingCounts.set(value, (practiceSettingCounts.get(value) || 0) + 1);
            }
          }
        }

        // C1.9 Core Focus
        if (qt.includes('core focus')) {
          const value = text || this.extractSingleChoice(json, text, questionType);
          if (value) {
            coreFocusCounts.set(value, (coreFocusCounts.get(value) || 0) + 1);
            respondentCoreFocus.set(respondentId, value);
          }
        }

        // C1.3 Monthly Patients (not DED)
        if (qt.includes('how many patients') && !qt.includes('dry eye')) {
          const num = this.parseNumber(text);
          if (num !== null) {
            monthlyPatientValues.push(num);
            respondentMonthlyPatients.set(respondentId, num);
          }
        }

        // C1.4 DED Patients
        if (qt.includes('dry eye') && qt.includes('patient')) {
          const num = this.parseNumber(text);
          if (num !== null) {
            dedPatientValues.push(num);
          }
        }

        // C1.5 Years in Practice
        if (qt.includes('years') && qt.includes('practice')) {
          const num = this.parseNumber(text);
          if (num !== null) {
            yearsValues.push(num);
          }
        }

        // C1.7 Location by state (from HCP)
        if (!stateTracked.has(respondentId)) {
          const state = answer.response.respondentHcp?.state;
          if (state) {
            stateCounts.set(state, (stateCounts.get(state) || 0) + 1);
            stateTracked.add(respondentId);
          }
        }

        // C1.10-12 Educational Resources (RANK_ORDER)
        if (qt.includes('educational') || qt.includes('seek educational')) {
          if (questionType === 'RANK_ORDER' && json) {
            const rankings = json as unknown;
            if (Array.isArray(rankings)) {
              // Determine which bucket (academic vs other vs general)
              let bucket = educationalRanks;
              if (qt.includes('academic')) {
                bucket = educationalRanksAcademic;
              } else if (qt.includes('non-academic') || qt.includes('community') || qt.includes('other')) {
                bucket = educationalRanksOther;
              }
              for (const item of rankings as Array<{ rank?: number; text?: string }>) {
                if (item.text && item.rank && item.rank >= 1 && item.rank <= 5) {
                  if (!bucket[item.text]) {
                    bucket[item.text] = { rank1: 0, rank2: 0, rank3: 0, rank4: 0, rank5: 0 };
                  }
                  const rankKey = `rank${item.rank}` as keyof typeof bucket[string];
                  bucket[item.text][rankKey] = (bucket[item.text][rankKey] || 0) + 1;
                }
              }
            }
          }
        }

        // C1.13-14 Topics Discussed (only if campaign has showTopicsDiscussed=true)
        if (qt.includes('topics discussed') && campaignTopicsMap.get(campaignId)) {
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

      // Build distributions
      const byRole = this.mapToDistribution(roleCounts, totalRespondents);
      const byPracticeSetting = this.mapToDistribution(practiceSettingCounts, totalRespondents);
      const byCoreFocus = this.mapToDistribution(coreFocusCounts, totalRespondents);

      const byMonthlyPatients = this.bucketNumbers(monthlyPatientValues, [
        { label: '0-100', min: 0, max: 100 },
        { label: '101-200', min: 101, max: 200 },
        { label: '201-300', min: 201, max: 300 },
        { label: '301-400', min: 301, max: 400 },
        { label: '401-500', min: 401, max: 500 },
        { label: '501-750', min: 501, max: 750 },
        { label: '751-1000', min: 751, max: 1000 },
        { label: '1000+', min: 1001, max: 999999 },
      ]);

      const byDedPatients = this.bucketNumbers(dedPatientValues, [
        { label: '0-25', min: 0, max: 25 },
        { label: '26-50', min: 26, max: 50 },
        { label: '51-100', min: 51, max: 100 },
        { label: '101-200', min: 101, max: 200 },
        { label: '201-300', min: 201, max: 300 },
        { label: '300+', min: 301, max: 999999 },
      ]);

      const byYearsInPractice = this.bucketNumbers(yearsValues, [
        { label: '0-5', min: 0, max: 5 },
        { label: '6-10', min: 6, max: 10 },
        { label: '11-15', min: 11, max: 15 },
        { label: '16-20', min: 16, max: 20 },
        { label: '21-25', min: 21, max: 25 },
        { label: '26-30', min: 26, max: 30 },
        { label: '31+', min: 31, max: 999999 },
      ]);

      const byState = this.mapToDistribution(stateCounts, totalRespondents);

      // C1.1 Decile distribution
      const decileCounts = new Map<string, number>();
      for (const [, decile] of decileMap) {
        const label = `Decile ${decile}`;
        decileCounts.set(label, (decileCounts.get(label) || 0) + 1);
      }
      const byDecile = this.mapToDistribution(decileCounts, totalRespondents);

      // Educational resources
      const educationalResources = this.buildEducationalResources(educationalRanks);
      const educationalResourcesAcademic = this.buildEducationalResources(educationalRanksAcademic);
      const educationalResourcesOther = this.buildEducationalResources(educationalRanksOther);

      // Topics discussed (only if any campaign has it enabled)
      const topicsDiscussed = anyShowTopics && topicsDiscussedCounts.size > 0
        ? this.mapToDistribution(topicsDiscussedCounts, totalRespondents)
        : undefined;

      // Core focus by patients cross-tabulation
      const coreFocusByPatients: { coreFocus: string; totalPatients: number; count: number }[] = [];
      const cfpMap = new Map<string, { totalPatients: number; count: number }>();
      for (const [respondentId, cf] of respondentCoreFocus) {
        const patients = respondentMonthlyPatients.get(respondentId);
        if (patients !== undefined) {
          const existing = cfpMap.get(cf) || { totalPatients: 0, count: 0 };
          existing.totalPatients += patients;
          existing.count += 1;
          cfpMap.set(cf, existing);
        }
      }
      for (const [coreFocus, data] of cfpMap) {
        coreFocusByPatients.push({ coreFocus, totalPatients: data.totalPatients, count: data.count });
      }
      coreFocusByPatients.sort((a, b) => b.totalPatients - a.totalPatients);

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
      // Get campaigns for disease area (scoped to client if provided)
      const campaigns = await prisma.campaign.findMany({
        where: { diseaseAreaId, ...(clientId && { clientId }) },
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

        if (qt.includes('practice setting')) {
          const value = this.extractSingleChoice(json, text, questionType);
          if (value) {
            practiceSettingCounts.set(value, (practiceSettingCounts.get(value) || 0) + 1);
            nominatorPracticeSetting.set(respondentId, value);
          }
        }

        if (qt.includes('core focus')) {
          const value = text || this.extractSingleChoice(json, text, questionType);
          if (value) {
            coreFocusCounts.set(value, (coreFocusCounts.get(value) || 0) + 1);
            nominatorCoreFocus.set(respondentId, value);
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
        byDecile: this.mapToSimpleDistribution(decileCounts),
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
}

export const insightsReportService = new InsightsReportService();
