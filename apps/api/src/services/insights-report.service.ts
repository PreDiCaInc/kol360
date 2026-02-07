import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
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
};

export class InsightsReportService {
  /**
   * Get summary stats for a disease area
   */
  async getSummary(diseaseAreaId: string): Promise<InsightsSummary> {
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
  }

  /**
   * Get KOL Explorer data - paginated list of all KOLs with their scores
   */
  async getKolExplorer(
    diseaseAreaId: string,
    filters: InsightsFilter
  ): Promise<KolExplorerResponse> {
    const { page, limit, sortBy, sortOrder, search, specialty, state, ...scoreFilters } = filters;

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
    if (scoreFilters.scoreOrgAwarenessMin !== undefined) {
      where.scoreOrgAwareness = { ...where.scoreOrgAwareness as object, gte: scoreFilters.scoreOrgAwarenessMin };
    }
    if (scoreFilters.scoreOrgAwarenessMax !== undefined) {
      where.scoreOrgAwareness = { ...where.scoreOrgAwareness as object, lte: scoreFilters.scoreOrgAwarenessMax };
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
    if (specialty) {
      hcpWhere.specialty = specialty;
    }
    if (state) {
      hcpWhere.state = state;
    }
    if (Object.keys(hcpWhere).length > 0) {
      where.hcp = hcpWhere;
    }

    // Determine sort field
    const orderBy: Prisma.HcpDiseaseAreaScoreOrderByWithRelationInput = {};
    if (sortBy && sortBy in NOMINATION_TYPE_FIELDS) {
      // Sort by score field
      orderBy[sortBy as keyof typeof orderBy] = sortOrder;
    } else {
      // Default sort by composite score
      orderBy.compositeScore = sortOrder;
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
        scoreOrgAwareness: score.scoreOrgAwareness ? Number(score.scoreOrgAwareness) : null,
        scoreClinicalTrials: score.scoreClinicalTrials ? Number(score.scoreClinicalTrials) : null,
        scoreConference: score.scoreConference ? Number(score.scoreConference) : null,
        scoreSocialMedia: score.scoreSocialMedia ? Number(score.scoreSocialMedia) : null,
        scoreMediaPodcasts: score.scoreMediaPodcasts ? Number(score.scoreMediaPodcasts) : null,
        scoreSurvey: score.scoreSurvey ? Number(score.scoreSurvey) : null,
        compositeScore: score.compositeScore ? Number(score.compositeScore) : null,
      };
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get leader rankings by nomination type
   */
  async getLeaderRankings(
    diseaseAreaId: string,
    query: LeaderRankingQuery
  ): Promise<LeaderRankingsResponse> {
    const { nominationType, page, limit, specialty, state } = query;

    // Get nomination counts grouped by matched HCP
    const nominations = await prisma.nomination.groupBy({
      by: ['matchedHcpId'],
      where: {
        matchStatus: { in: ['MATCHED', 'NEW_HCP'] },
        matchedHcpId: { not: null },
        question: {
          nominationType,
          campaign: { diseaseAreaId },
        },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    // Get HCP details for the ranked list
    const hcpIds = nominations.map((n) => n.matchedHcpId!);
    const hcps = await prisma.hcp.findMany({
      where: {
        id: { in: hcpIds },
        ...(specialty ? { specialty } : {}),
        ...(state ? { state } : {}),
      },
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
  }

  /**
   * Get individual KOL profile with all scores and nomination counts
   */
  async getKolProfile(diseaseAreaId: string, hcpId: string): Promise<KolProfileWithNominators | null> {
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
        response: { campaign: { diseaseAreaId } },
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

    // Get campaign scores for nomination breakdown by type
    const campaignScores = await prisma.hcpCampaignScore.findMany({
      where: {
        hcpId,
        campaign: { diseaseAreaId },
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
    };

    for (const cs of campaignScores) {
      nominationsByType.discussionLeaders += cs.countDiscussionLeaders || 0;
      nominationsByType.referralLeaders += cs.countReferralLeaders || 0;
      nominationsByType.adviceLeaders += cs.countAdviceLeaders || 0;
      nominationsByType.nationalLeader += cs.countNationalLeader || 0;
      nominationsByType.risingStar += cs.countRisingStar || 0;
      nominationsByType.socialLeader += cs.countSocialLeader || 0;
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
        scoreOrgAwareness: score.scoreOrgAwareness ? Number(score.scoreOrgAwareness) : null,
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
  }

  /**
   * Get sociometric summary - master table with all nomination counts
   */
  async getSociometricSummary(
    diseaseAreaId: string,
    filters: InsightsFilter
  ): Promise<SociometricSummaryResponse> {
    const { page, limit, search, specialty, state } = filters;

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
            where: { campaign: { diseaseAreaId } },
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

      for (const cs of hcp.campaignScores) {
        discussionLeaders += cs.countDiscussionLeaders || 0;
        referralLeaders += cs.countReferralLeaders || 0;
        adviceLeaders += cs.countAdviceLeaders || 0;
        nationalLeaders += cs.countNationalLeader || 0;
        risingStars += cs.countRisingStar || 0;
        socialLeaders += cs.countSocialLeader || 0;
      }

      const totalNominations =
        discussionLeaders +
        referralLeaders +
        adviceLeaders +
        nationalLeaders +
        risingStars +
        socialLeaders;

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
        regional: score?.totalNominationCount || 0,
        total: totalNominations,
      };
    });

    // Sort by total nominations
    items.sort((a, b) => b.total - a.total);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get respondent analytics - demographics and survey behavior
   */
  async getRespondentAnalytics(diseaseAreaId: string): Promise<RespondentAnalytics> {
    // Get all campaigns for this disease area
    const campaigns = await prisma.campaign.findMany({
      where: { diseaseAreaId },
      select: { id: true },
    });
    const campaignIds = campaigns.map((c) => c.id);

    // Get all campaign HCPs (potential respondents)
    const campaignHcps = await prisma.campaignHcp.findMany({
      where: { campaignId: { in: campaignIds } },
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
      where: { campaignId: { in: campaignIds } },
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
  }

  /**
   * Get filter options for dropdowns
   */
  async getFilterOptions(diseaseAreaId: string) {
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
  }

  /**
   * Determine influencer type based on scores
   * This is a simplified heuristic - can be refined based on business rules
   */
  private determineInfluencerType(score: {
    compositeScore: unknown;
    scoreSurvey: unknown;
  }): string {
    const composite = score.compositeScore ? Number(score.compositeScore) : 0;
    const survey = score.scoreSurvey ? Number(score.scoreSurvey) : 0;

    // High composite + high survey = National Leader
    if (composite >= 30 && survey >= 50) {
      return 'National Leaders';
    }
    // High survey but moderate composite = Rising Star
    if (survey >= 30 && composite < 30) {
      return 'Rising Stars';
    }
    // Default to Regional Influencer
    return 'Regional Influencers';
  }
}

export const insightsReportService = new InsightsReportService();
