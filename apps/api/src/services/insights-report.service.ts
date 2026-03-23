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
 * These thresholds determine how KOLs are classified into influencer categories.
 * Modify these values to adjust classification based on business requirements.
 *
 * Current logic:
 * - National Leaders: High overall influence (composite >= threshold) AND strong survey presence (survey >= threshold)
 * - Rising Stars: Strong survey presence but still building overall influence
 * - Regional Influencers: Default category for others
 *
 * Score ranges: 0-100 (normalized scores)
 */
const INFLUENCER_THRESHOLDS = {
  nationalLeader: {
    minCompositeScore: 30,  // Minimum composite score to be considered a national leader
    minSurveyScore: 50,     // Minimum survey score to be considered a national leader
  },
  risingStar: {
    minSurveyScore: 30,     // Minimum survey score to be considered a rising star
    maxCompositeScore: 30,  // Must have composite below this to be rising star (not national leader)
  },
  // Regional Influencers: Everyone else (no thresholds needed)
} as const;

export class InsightsReportService {
  /**
   * Get summary stats for a disease area
   */
  async getSummary(diseaseAreaId: string): Promise<InsightsSummary> {
    try {
      const [totalKols, totalCampaigns, totalNominations, avgScore] = await Promise.all([
        // Total KOLs with scores in this disease area
        prisma.hcpDiseaseAreaScore.count({
          where: { diseaseAreaId, isCurrent: true },
        }),
        // Total campaigns in this disease area
        prisma.campaign.count({
          where: { diseaseAreaId },
        }),
        // Total nominations in campaigns for this disease area
        prisma.nomination.count({
          where: {
            response: { campaign: { diseaseAreaId } },
            matchStatus: { in: ['MATCHED', 'NEW_HCP'] },
          },
        }),
        // Average composite score
        prisma.hcpDiseaseAreaScore.aggregate({
          where: { diseaseAreaId, isCurrent: true },
          _avg: { compositeScore: true },
        }),
      ]);

      // Get total respondents (unique completed survey responses)
      const totalRespondents = await prisma.surveyResponse.count({
        where: {
          status: 'COMPLETED',
          campaign: { diseaseAreaId },
        },
      });

      return {
        totalKols,
        totalRespondents,
        totalNominations,
        totalCampaigns,
        averageCompositeScore: avgScore._avg.compositeScore
          ? Number(avgScore._avg.compositeScore)
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
    filters: InsightsFilter
  ): Promise<KolExplorerResponse> {
    try {
    const { page, limit, sortBy, sortOrder, search, specialty, state, specialties, states, influencerType, influencerTypes, ...scoreFilters } = filters;

    // Build where clause
    const where: Prisma.HcpDiseaseAreaScoreWhereInput = {
      diseaseAreaId,
      isCurrent: true,
    };

    // Add score range filters
    if (scoreFilters.scorePublicationsMin !== undefined) {
      where.scorePublications = { ...where.scorePublications as object, gte: scoreFilters.scorePublicationsMin };
    }
    if (scoreFilters.scorePublicationsMax !== undefined) {
      where.scorePublications = { ...where.scorePublications as object, lte: scoreFilters.scorePublicationsMax };
    }
    if (scoreFilters.scoreTradePubsMin !== undefined) {
      where.scoreTradePubs = { ...where.scoreTradePubs as object, gte: scoreFilters.scoreTradePubsMin };
    }
    if (scoreFilters.scoreTradePubsMax !== undefined) {
      where.scoreTradePubs = { ...where.scoreTradePubs as object, lte: scoreFilters.scoreTradePubsMax };
    }
    if (scoreFilters.scoreOrgLeadershipMin !== undefined) {
      where.scoreOrgLeadership = { ...where.scoreOrgLeadership as object, gte: scoreFilters.scoreOrgLeadershipMin };
    }
    if (scoreFilters.scoreOrgLeadershipMax !== undefined) {
      where.scoreOrgLeadership = { ...where.scoreOrgLeadership as object, lte: scoreFilters.scoreOrgLeadershipMax };
    }
    if (scoreFilters.scoreOrgAwardsMin !== undefined) {
      where.scoreOrgAwards = { ...where.scoreOrgAwards as object, gte: scoreFilters.scoreOrgAwardsMin };
    }
    if (scoreFilters.scoreOrgAwardsMax !== undefined) {
      where.scoreOrgAwards = { ...where.scoreOrgAwards as object, lte: scoreFilters.scoreOrgAwardsMax };
    }
    if (scoreFilters.scoreClinicalTrialsMin !== undefined) {
      where.scoreClinicalTrials = { ...where.scoreClinicalTrials as object, gte: scoreFilters.scoreClinicalTrialsMin };
    }
    if (scoreFilters.scoreClinicalTrialsMax !== undefined) {
      where.scoreClinicalTrials = { ...where.scoreClinicalTrials as object, lte: scoreFilters.scoreClinicalTrialsMax };
    }
    if (scoreFilters.scoreConferenceMin !== undefined) {
      where.scoreConference = { ...where.scoreConference as object, gte: scoreFilters.scoreConferenceMin };
    }
    if (scoreFilters.scoreConferenceMax !== undefined) {
      where.scoreConference = { ...where.scoreConference as object, lte: scoreFilters.scoreConferenceMax };
    }
    if (scoreFilters.scoreSocialMediaMin !== undefined) {
      where.scoreSocialMedia = { ...where.scoreSocialMedia as object, gte: scoreFilters.scoreSocialMediaMin };
    }
    if (scoreFilters.scoreSocialMediaMax !== undefined) {
      where.scoreSocialMedia = { ...where.scoreSocialMedia as object, lte: scoreFilters.scoreSocialMediaMax };
    }
    if (scoreFilters.scoreMediaPodcastsMin !== undefined) {
      where.scoreMediaPodcasts = { ...where.scoreMediaPodcasts as object, gte: scoreFilters.scoreMediaPodcastsMin };
    }
    if (scoreFilters.scoreMediaPodcastsMax !== undefined) {
      where.scoreMediaPodcasts = { ...where.scoreMediaPodcasts as object, lte: scoreFilters.scoreMediaPodcastsMax };
    }
    if (scoreFilters.scoreSurveyMin !== undefined) {
      where.scoreSurvey = { ...where.scoreSurvey as object, gte: scoreFilters.scoreSurveyMin };
    }
    if (scoreFilters.scoreSurveyMax !== undefined) {
      where.scoreSurvey = { ...where.scoreSurvey as object, lte: scoreFilters.scoreSurveyMax };
    }
    if (scoreFilters.compositeScoreMin !== undefined) {
      where.compositeScore = { ...where.compositeScore as object, gte: scoreFilters.compositeScoreMin };
    }
    if (scoreFilters.compositeScoreMax !== undefined) {
      where.compositeScore = { ...where.compositeScore as object, lte: scoreFilters.compositeScoreMax };
    }

    // Add HCP filters
    const hcpWhere: Prisma.HcpWhereInput = {};
    if (search) {
      hcpWhere.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { npi: { contains: search } },
      ];
    }
    // Support both single and multi-select for specialty
    if (specialties && specialties.length > 0) {
      hcpWhere.specialty = { in: specialties };
    } else if (specialty) {
      hcpWhere.specialty = specialty;
    }
    // Support both single and multi-select for state
    if (states && states.length > 0) {
      hcpWhere.state = { in: states };
    } else if (state) {
      hcpWhere.state = state;
    }
    if (Object.keys(hcpWhere).length > 0) {
      where.hcp = hcpWhere;
    }

    // Filter by influencer type (computed field - filter after fetch)
    const influencerTypeFilter = influencerTypes && influencerTypes.length > 0
      ? influencerTypes
      : influencerType
        ? [influencerType]
        : null;

    // Determine sort field
    // Valid score fields on HcpDiseaseAreaScore
    const VALID_SCORE_FIELDS = [
      'compositeScore',
      'scorePublications',
      'scoreTradePubs',
      'scoreOrgLeadership',
      'scoreOrgAwards',
      'scoreClinicalTrials',
      'scoreConference',
      'scoreSocialMedia',
      'scoreMediaPodcasts',
      'scoreSurvey',
    ];

    let orderBy: Prisma.HcpDiseaseAreaScoreOrderByWithRelationInput;

    if (sortBy === 'name') {
      // Sort by HCP lastName then firstName
      orderBy = {
        hcp: {
          lastName: sortOrder,
        },
      };
    } else if (sortBy === 'specialty') {
      // Sort by HCP specialty
      orderBy = {
        hcp: {
          specialty: sortOrder,
        },
      };
    } else if (sortBy && VALID_SCORE_FIELDS.includes(sortBy)) {
      // Sort by score field
      orderBy = { [sortBy]: sortOrder };
    } else {
      // Default sort by composite score
      orderBy = { compositeScore: sortOrder };
    }

    // Execute queries
    const [total, scores] = await Promise.all([
      prisma.hcpDiseaseAreaScore.count({ where }),
      prisma.hcpDiseaseAreaScore.findMany({
        where,
        include: {
          hcp: {
            include: {
              specialties: {
                where: { isPrimary: true },
                include: { specialty: true },
                take: 1,
              },
            },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Transform to response format
    const items: KolExplorerItem[] = scores.map((score) => {
      const primarySpecialty = score.hcp.specialties[0]?.specialty?.name || score.hcp.specialty;
      return {
        id: score.hcp.id,
        name: `${score.hcp.firstName} ${score.hcp.lastName}`,
        firstName: score.hcp.firstName,
        lastName: score.hcp.lastName,
        specialty: primarySpecialty,
        degree: primarySpecialty?.includes('Ophthalmologist') ? 'MD' : 'OD',
        city: score.hcp.city,
        state: score.hcp.state,
        influencerType: this.determineInfluencerType(score),
        scorePublications: score.scorePublications ? Number(score.scorePublications) : null,
        scoreTradePubs: score.scoreTradePubs ? Number(score.scoreTradePubs) : null,
        scoreOrgLeadership: score.scoreOrgLeadership ? Number(score.scoreOrgLeadership) : null,
        scoreOrgAwards: score.scoreOrgAwards ? Number(score.scoreOrgAwards) : null,
        scoreClinicalTrials: score.scoreClinicalTrials ? Number(score.scoreClinicalTrials) : null,
        scoreConference: score.scoreConference ? Number(score.scoreConference) : null,
        scoreSocialMedia: score.scoreSocialMedia ? Number(score.scoreSocialMedia) : null,
        scoreMediaPodcasts: score.scoreMediaPodcasts ? Number(score.scoreMediaPodcasts) : null,
        scoreSurvey: score.scoreSurvey ? Number(score.scoreSurvey) : null,
        compositeScore: score.compositeScore ? Number(score.compositeScore) : null,
      };
    });

    // Apply influencer type filter (computed field, filtered post-fetch)
    // Note: This filter is applied after pagination, so results may be less than limit
    const filteredItems = influencerTypeFilter
      ? items.filter((item) => item.influencerType && influencerTypeFilter.includes(item.influencerType))
      : items;

    return {
      items: filteredItems,
      total: influencerTypeFilter ? filteredItems.length : total,
      page,
      limit,
      totalPages: influencerTypeFilter ? 1 : Math.ceil(total / limit),
    };
    } catch (error) {
      logger.error('Error fetching KOL explorer data', { diseaseAreaId, filters, error });
      throw error;
    }
  }

  /**
   * Get leader rankings by nomination type
   */
  async getLeaderRankings(
    diseaseAreaId: string,
    query: LeaderRankingQuery,
    excludeInternalEmails = false,
    clientId?: string
  ): Promise<LeaderRankingsResponse> {
    try {
    const { nominationType, page, limit, specialty, state, specialties, states } = query;

    // Build campaign filter — scoped to client if provided
    const campaignFilter: Record<string, unknown> = { diseaseAreaId };
    if (clientId) campaignFilter.clientId = clientId;

    // Get nomination counts grouped by matched HCP
    const nominations = await prisma.nomination.groupBy({
      by: ['matchedHcpId'],
      where: {
        matchStatus: { in: ['MATCHED', 'NEW_HCP'] },
        matchedHcpId: { not: null },
        question: {
          nominationType,
          campaign: campaignFilter,
        },
        ...(excludeInternalEmails && {
          response: {
            respondentHcp: { email: { not: { endsWith: '@bio-exec.com' } } },
          },
        }),
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    // Get HCP details for the ranked list
    const hcpIds = nominations.map((n) => n.matchedHcpId!);

    // Build HCP where clause with array filter support
    const hcpWhere: Record<string, unknown> = { id: { in: hcpIds } };

    // Support both single and multi-select for specialty
    if (specialties && specialties.length > 0) {
      hcpWhere.specialty = { in: specialties };
    } else if (specialty) {
      hcpWhere.specialty = specialty;
    }

    // Support both single and multi-select for state
    if (states && states.length > 0) {
      hcpWhere.state = { in: states };
    } else if (state) {
      hcpWhere.state = state;
    }

    const hcps = await prisma.hcp.findMany({
      where: hcpWhere,
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

    // Create a map for quick lookup
    const hcpMap = new Map(hcps.map((h) => [h.id, h]));

    // Build ranked list with filtering
    const rankedItems: LeaderRankingItem[] = [];
    let rank = 0;
    for (const nom of nominations) {
      const hcp = hcpMap.get(nom.matchedHcpId!);
      if (!hcp) continue; // Skip if HCP doesn't match filters

      rank++;
      const primarySpecialty = hcp.specialties[0]?.specialty?.name || hcp.specialty;
      const score = hcp.diseaseAreaScores[0];

      rankedItems.push({
        rank,
        hcpId: hcp.id,
        name: `${hcp.firstName} ${hcp.lastName}`,
        degree: primarySpecialty?.includes('Ophthalmologist') ? 'MD' : 'OD',
        specialty: primarySpecialty,
        city: hcp.city,
        state: hcp.state,
        count: nom._count.id,
        influencerType: score ? this.determineInfluencerType(score) : null,
      });
    }

    // Apply pagination
    const total = rankedItems.length;
    const paginatedItems = rankedItems.slice((page - 1) * limit, page * limit);

    return {
      nominationType,
      items: paginatedItems,
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
    // Build campaign filter — scoped to client if provided
    const campaignFilter: Record<string, unknown> = { diseaseAreaId };
    if (clientId) campaignFilter.clientId = clientId;

    // Get HCP with disease area score
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

    const score = hcp.diseaseAreaScores[0];
    if (!score) return null;

    // Get nominations for this KOL with nominator details
    const nominations = await prisma.nomination.findMany({
      where: {
        matchedHcpId: hcpId,
        matchStatus: { in: ['MATCHED', 'NEW_HCP'] },
        response: {
          campaign: campaignFilter,
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

    // Get campaign scores for nomination breakdown by type (scoped to client if provided)
    const campaignScores = await prisma.hcpCampaignScore.findMany({
      where: {
        hcpId,
        campaign: { diseaseAreaId, ...(clientId && { clientId }) },
      },
    });

    // Aggregate nomination counts from campaign scores
    const nominationsByType = {
      discussionLeaders: 0,
      referralLeaders: 0,
      adviceLeaders: 0,
      nationalLeader: 0,
      risingStar: 0,
      socialLeader: 0,
      biasedLeader: 0,
    };

    for (const cs of campaignScores) {
      nominationsByType.discussionLeaders += cs.countDiscussionLeaders || 0;
      nominationsByType.referralLeaders += cs.countReferralLeaders || 0;
      nominationsByType.adviceLeaders += cs.countAdviceLeaders || 0;
      nominationsByType.nationalLeader += cs.countNationalLeader || 0;
      nominationsByType.risingStar += cs.countRisingStar || 0;
      nominationsByType.socialLeader += cs.countSocialLeader || 0;
      nominationsByType.biasedLeader += cs.countBiasedLeader || 0;
    }

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
      influencerType: this.determineInfluencerType(score),
      scores: {
        scorePublications: score.scorePublications ? Number(score.scorePublications) : null,
        scoreTradePubs: score.scoreTradePubs ? Number(score.scoreTradePubs) : null,
        scoreOrgLeadership: score.scoreOrgLeadership ? Number(score.scoreOrgLeadership) : null,
        scoreOrgAwards: score.scoreOrgAwards ? Number(score.scoreOrgAwards) : null,
        scoreClinicalTrials: score.scoreClinicalTrials ? Number(score.scoreClinicalTrials) : null,
        scoreConference: score.scoreConference ? Number(score.scoreConference) : null,
        scoreSocialMedia: score.scoreSocialMedia ? Number(score.scoreSocialMedia) : null,
        scoreMediaPodcasts: score.scoreMediaPodcasts ? Number(score.scoreMediaPodcasts) : null,
        scoreSurvey: score.scoreSurvey ? Number(score.scoreSurvey) : null,
        compositeScore: score.compositeScore ? Number(score.compositeScore) : null,
      },
      nominations: {
        ...nominationsByType,
        total: nominations.length,
      },
      regionalCount: score.totalNominationCount || 0,
      nominators,
      nominatorDemographics,
    };
    } catch (error) {
      logger.error('Error fetching KOL profile', { diseaseAreaId, hcpId, error });
      throw error;
    }
  }

  /**
   * Get sociometric summary - master table with all nomination counts
   */
  async getSociometricSummary(
    diseaseAreaId: string,
    filters: InsightsFilter,
    clientId?: string
  ): Promise<SociometricSummaryResponse> {
    try {
    const { page, limit, search, specialty, state, sortBy, sortOrder } = filters;

    // Build HCP filter
    const hcpWhere: Prisma.HcpWhereInput = {
      isNominated: true,
    };
    if (search) {
      hcpWhere.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (specialty) {
      hcpWhere.specialty = specialty;
    }
    if (state) {
      hcpWhere.state = state;
    }

    // Get HCPs with campaign scores
    const [total, hcps] = await Promise.all([
      prisma.hcp.count({ where: hcpWhere }),
      prisma.hcp.findMany({
        where: hcpWhere,
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
          campaignScores: {
            where: { campaign: { diseaseAreaId, ...(clientId && { clientId }) } },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Transform to response format
    const items: SociometricSummaryItem[] = hcps.map((hcp, index) => {
      const score = hcp.diseaseAreaScores[0];
      const primarySpecialty = hcp.specialties[0]?.specialty?.name || hcp.specialty;

      // Aggregate nomination counts from all campaign scores
      let discussionLeaders = 0;
      let referralLeaders = 0;
      let adviceLeaders = 0;
      let nationalLeaders = 0;
      let risingStars = 0;
      let socialLeaders = 0;
      let biasedLeaders = 0;

      for (const cs of hcp.campaignScores) {
        discussionLeaders += cs.countDiscussionLeaders || 0;
        referralLeaders += cs.countReferralLeaders || 0;
        adviceLeaders += cs.countAdviceLeaders || 0;
        nationalLeaders += cs.countNationalLeader || 0;
        risingStars += cs.countRisingStar || 0;
        socialLeaders += cs.countSocialLeader || 0;
        biasedLeaders += cs.countBiasedLeader || 0;
      }

      const totalNominations =
        discussionLeaders +
        referralLeaders +
        adviceLeaders +
        nationalLeaders +
        risingStars +
        socialLeaders +
        biasedLeaders;

      return {
        rank: (page - 1) * limit + index + 1,
        hcpId: hcp.id,
        name: `${hcp.firstName} ${hcp.lastName}`,
        specialty: primarySpecialty,
        city: hcp.city,
        state: hcp.state,
        influencerType: score ? this.determineInfluencerType(score) : null,
        discussionLeaders,
        referralLeaders,
        adviceLeaders,
        nationalLeaders,
        risingStars,
        socialLeaders,
        biasedLeaders,
        regional: score?.totalNominationCount || 0,
        total: totalNominations,
      };
    });

    // Server-side sorting based on sortBy parameter
    const validSortFields = ['total', 'discussionLeaders', 'referralLeaders', 'adviceLeaders', 'nationalLeaders', 'risingStars', 'socialLeaders', 'biasedLeaders', 'regional', 'name'];
    const field = validSortFields.includes(sortBy || '') ? sortBy : 'total';
    const order = sortOrder === 'asc' ? 1 : -1;

    items.sort((a, b) => {
      if (field === 'name') {
        return order * a.name.localeCompare(b.name);
      }
      const aVal = (a as Record<string, unknown>)[field!] as number || 0;
      const bVal = (b as Record<string, unknown>)[field!] as number || 0;
      return order * (bVal - aVal);
    });

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
   * Get filter options for dropdowns
   */
  async getFilterOptions(diseaseAreaId: string) {
    try {
    // Get distinct specialties and states from HCPs with scores in this disease area
    const hcpsWithScores = await prisma.hcpDiseaseAreaScore.findMany({
      where: { diseaseAreaId, isCurrent: true },
      select: {
        hcp: {
          select: {
            specialty: true,
            state: true,
          },
        },
      },
    });

    const specialties = new Set<string>();
    const states = new Set<string>();

    for (const score of hcpsWithScores) {
      if (score.hcp.specialty) specialties.add(score.hcp.specialty);
      if (score.hcp.state) states.add(score.hcp.state);
    }

    return {
      specialties: Array.from(specialties).sort(),
      states: Array.from(states).sort(),
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
  async getDemographics(diseaseAreaId: string, clientId?: string) {
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

      // Get unique respondent IDs for total count
      const respondentIds = new Set(answers.map((a) => a.response.respondentHcpId));
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

      for (const answer of answers) {
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
   * Determine influencer type based on scores
   *
   * Uses configurable thresholds defined in INFLUENCER_THRESHOLDS at the top of this file.
   * Adjust those values to change classification behavior.
   *
   * Classification logic:
   * 1. National Leaders: composite >= threshold AND survey >= threshold
   * 2. Rising Stars: survey >= threshold AND composite < threshold
   * 3. Regional Influencers: Default for everyone else
   */
  private determineInfluencerType(score: {
    compositeScore: unknown;
    scoreSurvey: unknown;
  }): string {
    const composite = score.compositeScore ? Number(score.compositeScore) : 0;
    const survey = score.scoreSurvey ? Number(score.scoreSurvey) : 0;

    const { nationalLeader, risingStar } = INFLUENCER_THRESHOLDS;

    // High composite + high survey = National Leader
    if (composite >= nationalLeader.minCompositeScore && survey >= nationalLeader.minSurveyScore) {
      return 'National Leaders';
    }

    // High survey but moderate composite = Rising Star
    if (survey >= risingStar.minSurveyScore && composite < risingStar.maxCompositeScore) {
      return 'Rising Stars';
    }

    // Default to Regional Influencer
    return 'Regional Influencers';
  }
}

export const insightsReportService = new InsightsReportService();
