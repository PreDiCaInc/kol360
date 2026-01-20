import { prisma } from '../lib/prisma';
import { NominationType } from '@prisma/client';

// Mapping from NominationType enum to score field names (6 new nomination types)
const NOMINATION_TYPE_FIELDS = {
  DISCUSSION_LEADERS: { score: 'scoreDiscussionLeaders', count: 'countDiscussionLeaders' },
  REFERRAL_LEADERS: { score: 'scoreReferralLeaders', count: 'countReferralLeaders' },
  ADVICE_LEADERS: { score: 'scoreAdviceLeaders', count: 'countAdviceLeaders' },
  NATIONAL_LEADER: { score: 'scoreNationalLeader', count: 'countNationalLeader' },
  RISING_STAR: { score: 'scoreRisingStar', count: 'countRisingStar' },
  SOCIAL_LEADER: { score: 'scoreSocialLeader', count: 'countSocialLeader' },
} as const;

export class ScoreCalculationService {
  /**
   * Calculate survey scores for all HCPs nominated in a campaign.
   * Calculates per-nomination-type scores, then averages them for the consolidated score.
   *
   * For each nomination type:
   *   typeScore = (hcp_type_count / max_type_count_in_campaign) * 100
   *
   * Consolidated score = average of all non-null type scores
   *
   * This should be called after nomination matching is complete.
   */
  async calculateSurveyScores(campaignId: string): Promise<{ processed: number; updated: number }> {
    // 1. Get nomination types used in this campaign from survey questions
    const surveyQuestions = await prisma.surveyQuestion.findMany({
      where: {
        campaignId,
        nominationType: { not: null },
      },
      select: { nominationType: true },
    });

    const nominationTypesInCampaign = [...new Set(
      surveyQuestions
        .map(q => q.nominationType)
        .filter((t): t is NominationType => t !== null)
    )];

    if (nominationTypesInCampaign.length === 0) {
      // No nomination questions with types - fall back to legacy behavior
      return this.calculateSurveyScoresLegacy(campaignId);
    }

    // 2. Get all MATCHED/NEW_HCP nominations grouped by HCP and nomination type
    const nominations = await prisma.nomination.findMany({
      where: {
        response: { campaignId },
        matchStatus: { in: ['MATCHED', 'NEW_HCP'] },
        matchedHcpId: { not: null },
      },
      include: {
        question: {
          select: { nominationType: true },
        },
      },
    });

    if (nominations.length === 0) {
      return { processed: 0, updated: 0 };
    }

    // 3. Group nominations by HCP and nomination type
    const hcpTypeCountMap = new Map<string, Map<NominationType, number>>();
    const maxCountPerType = new Map<NominationType, number>();

    for (const nom of nominations) {
      if (!nom.matchedHcpId || !nom.question.nominationType) continue;

      const nomType = nom.question.nominationType;

      // Count per HCP per type
      if (!hcpTypeCountMap.has(nom.matchedHcpId)) {
        hcpTypeCountMap.set(nom.matchedHcpId, new Map());
      }
      const typeCounts = hcpTypeCountMap.get(nom.matchedHcpId)!;
      typeCounts.set(nomType, (typeCounts.get(nomType) || 0) + 1);

      // Track max count per type
      const currentMax = maxCountPerType.get(nomType) || 0;
      const hcpCount = typeCounts.get(nomType) || 0;
      if (hcpCount > currentMax) {
        maxCountPerType.set(nomType, hcpCount);
      }
    }

    // 4. Calculate and upsert scores for each HCP
    let updated = 0;
    for (const [hcpId, typeCounts] of hcpTypeCountMap) {
      const scoreData: Record<string, number | null> = {};
      const typeScores: number[] = [];
      let totalNominations = 0;

      // Calculate score for each nomination type
      for (const nomType of nominationTypesInCampaign) {
        const count = typeCounts.get(nomType) || 0;
        const maxCount = maxCountPerType.get(nomType) || 1;
        const fields = NOMINATION_TYPE_FIELDS[nomType];

        scoreData[fields.count] = count;
        totalNominations += count;

        if (count > 0) {
          const typeScore = (count / maxCount) * 100;
          scoreData[fields.score] = typeScore;
          typeScores.push(typeScore);
        } else {
          scoreData[fields.score] = null;
        }
      }

      // Consolidated score = average of type scores that have data
      const consolidatedScore = typeScores.length > 0
        ? typeScores.reduce((sum, s) => sum + s, 0) / typeScores.length
        : null;

      await prisma.hcpCampaignScore.upsert({
        where: {
          hcpId_campaignId: { hcpId, campaignId },
        },
        create: {
          hcpId,
          campaignId,
          ...scoreData,
          scoreSurvey: consolidatedScore,
          nominationCount: totalNominations,
          calculatedAt: new Date(),
        },
        update: {
          ...scoreData,
          scoreSurvey: consolidatedScore,
          nominationCount: totalNominations,
          calculatedAt: new Date(),
        },
      });
      updated++;
    }

    return { processed: hcpTypeCountMap.size, updated };
  }

  /**
   * Legacy survey score calculation (no nomination types)
   * Used when campaign has no nomination type assignments
   */
  private async calculateSurveyScoresLegacy(campaignId: string): Promise<{ processed: number; updated: number }> {
    const nominationCounts = await prisma.nomination.groupBy({
      by: ['matchedHcpId'],
      where: {
        response: { campaignId },
        matchStatus: { in: ['MATCHED', 'NEW_HCP'] },
        matchedHcpId: { not: null },
      },
      _count: { id: true },
    });

    if (nominationCounts.length === 0) {
      return { processed: 0, updated: 0 };
    }

    const maxNominations = Math.max(...nominationCounts.map((n: { _count: { id: number } }) => n._count.id));

    let updated = 0;
    for (const nom of nominationCounts) {
      if (!nom.matchedHcpId) continue;

      const surveyScore = (nom._count.id / maxNominations) * 100;

      await prisma.hcpCampaignScore.upsert({
        where: {
          hcpId_campaignId: {
            hcpId: nom.matchedHcpId,
            campaignId,
          },
        },
        create: {
          hcpId: nom.matchedHcpId,
          campaignId,
          scoreSurvey: surveyScore,
          nominationCount: nom._count.id,
          calculatedAt: new Date(),
        },
        update: {
          scoreSurvey: surveyScore,
          nominationCount: nom._count.id,
          calculatedAt: new Date(),
        },
      });
      updated++;
    }

    return { processed: nominationCounts.length, updated };
  }

  /**
   * Calculate composite scores for all HCPs in a campaign.
   * Composite = weighted average of 8 objective scores + 1 survey score
   *
   * Prerequisites:
   * - Survey scores must be calculated first (calculateSurveyScores)
   * - Disease area scores must be uploaded for the HCPs
   */
  async calculateCompositeScores(campaignId: string): Promise<{ processed: number; updated: number }> {
    // 1. Get the campaign with its score config and disease area
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        compositeScoreConfig: true,
        diseaseArea: true,
      },
    });

    if (!campaign || !campaign.compositeScoreConfig) {
      throw new Error('Campaign or score config not found');
    }

    const weights = campaign.compositeScoreConfig;

    // 2. Get all HcpCampaignScores for this campaign (created by calculateSurveyScores)
    const campaignScores = await prisma.hcpCampaignScore.findMany({
      where: { campaignId },
      include: { hcp: true },
    });

    if (campaignScores.length === 0) {
      return { processed: 0, updated: 0 };
    }

    // 3. Get disease area scores for all these HCPs
    const hcpIds = campaignScores.map((s: { hcpId: string }) => s.hcpId);
    const diseaseAreaScores = await prisma.hcpDiseaseAreaScore.findMany({
      where: {
        hcpId: { in: hcpIds },
        diseaseAreaId: campaign.diseaseAreaId,
        isCurrent: true,
      },
    });

    const daScoreMap = new Map(
      diseaseAreaScores.map((s: { hcpId: string }) => [s.hcpId, s])
    );

    // 4. Calculate composite for each HCP
    let updated = 0;
    for (const score of campaignScores) {
      const daScore = daScoreMap.get(score.hcpId) as {
        scorePublications?: unknown;
        scoreClinicalTrials?: unknown;
        scoreTradePubs?: unknown;
        scoreOrgLeadership?: unknown;
        scoreOrgAwareness?: unknown;
        scoreConference?: unknown;
        scoreSocialMedia?: unknown;
        scoreMediaPodcasts?: unknown;
      } | undefined;

      // Helper to safely get number from Decimal or null
      const toNum = (val: unknown): number =>
        val ? Number(val) : 0;

      // Calculate weighted composite
      // Each weight is stored as a percentage (0-100), so divide by 100
      const composite =
        (toNum(daScore?.scorePublications) * toNum(weights.weightPublications) / 100) +
        (toNum(daScore?.scoreClinicalTrials) * toNum(weights.weightClinicalTrials) / 100) +
        (toNum(daScore?.scoreTradePubs) * toNum(weights.weightTradePubs) / 100) +
        (toNum(daScore?.scoreOrgLeadership) * toNum(weights.weightOrgLeadership) / 100) +
        (toNum(daScore?.scoreOrgAwareness) * toNum(weights.weightOrgAwareness) / 100) +
        (toNum(daScore?.scoreConference) * toNum(weights.weightConference) / 100) +
        (toNum(daScore?.scoreSocialMedia) * toNum(weights.weightSocialMedia) / 100) +
        (toNum(daScore?.scoreMediaPodcasts) * toNum(weights.weightMediaPodcasts) / 100) +
        (toNum(score.scoreSurvey) * toNum(weights.weightSurvey) / 100);

      await prisma.hcpCampaignScore.update({
        where: { id: score.id },
        data: {
          compositeScore: composite,
          calculatedAt: new Date(),
        },
      });
      updated++;
    }

    return { processed: campaignScores.length, updated };
  }

  /**
   * Publish campaign scores - updates disease area aggregate scores with SCD Type 2 history.
   * This should be called when campaign status changes to PUBLISHED.
   */
  async publishScores(campaignId: string, _publishedBy: string): Promise<{ processed: number }> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        diseaseArea: true,
        compositeScoreConfig: true,
      },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Get weights from campaign config or use defaults
    const weights = campaign.compositeScoreConfig || {
      weightPublications: 10,
      weightClinicalTrials: 15,
      weightTradePubs: 10,
      weightOrgLeadership: 10,
      weightOrgAwareness: 10,
      weightConference: 10,
      weightSocialMedia: 5,
      weightMediaPodcasts: 5,
      weightSurvey: 25,
    };

    // Helper to safely get number from Decimal or null
    const toNum = (val: unknown): number => val ? Number(val) : 0;

    // Get all campaign scores
    const campaignScores = await prisma.hcpCampaignScore.findMany({
      where: { campaignId },
    });

    let processed = 0;

    for (const score of campaignScores) {
      // Get current disease area score
      const currentDaScore = await prisma.hcpDiseaseAreaScore.findFirst({
        where: {
          hcpId: score.hcpId,
          diseaseAreaId: campaign.diseaseAreaId,
          isCurrent: true,
        },
      });

      const now = new Date();

      if (currentDaScore) {
        // SCD Type 2: Close out the current record
        await prisma.hcpDiseaseAreaScore.update({
          where: { id: currentDaScore.id },
          data: {
            isCurrent: false,
            effectiveTo: now,
          },
        });

        // Create new current record with updated survey score
        // Aggregate survey score across campaigns (simple average for now, could be weighted)
        const allCampaignScores = await prisma.hcpCampaignScore.findMany({
          where: {
            hcpId: score.hcpId,
            campaign: { diseaseAreaId: campaign.diseaseAreaId },
            scoreSurvey: { not: null },
          },
        });

        const avgSurveyScore = allCampaignScores.length > 0
          ? allCampaignScores.reduce(
              (sum: number, s: { scoreSurvey?: unknown }) => sum + Number(s.scoreSurvey || 0),
              0
            ) / allCampaignScores.length
          : Number(score.scoreSurvey || 0);

        // Calculate composite score using weights
        const compositeScore =
          (toNum(currentDaScore.scorePublications) * toNum(weights.weightPublications) / 100) +
          (toNum(currentDaScore.scoreClinicalTrials) * toNum(weights.weightClinicalTrials) / 100) +
          (toNum(currentDaScore.scoreTradePubs) * toNum(weights.weightTradePubs) / 100) +
          (toNum(currentDaScore.scoreOrgLeadership) * toNum(weights.weightOrgLeadership) / 100) +
          (toNum(currentDaScore.scoreOrgAwareness) * toNum(weights.weightOrgAwareness) / 100) +
          (toNum(currentDaScore.scoreConference) * toNum(weights.weightConference) / 100) +
          (toNum(currentDaScore.scoreSocialMedia) * toNum(weights.weightSocialMedia) / 100) +
          (toNum(currentDaScore.scoreMediaPodcasts) * toNum(weights.weightMediaPodcasts) / 100) +
          (toNum(avgSurveyScore) * toNum(weights.weightSurvey) / 100);

        await prisma.hcpDiseaseAreaScore.create({
          data: {
            hcpId: score.hcpId,
            diseaseAreaId: campaign.diseaseAreaId,
            // Copy objective scores from previous record
            scorePublications: currentDaScore.scorePublications,
            scoreClinicalTrials: currentDaScore.scoreClinicalTrials,
            scoreTradePubs: currentDaScore.scoreTradePubs,
            scoreOrgLeadership: currentDaScore.scoreOrgLeadership,
            scoreOrgAwareness: currentDaScore.scoreOrgAwareness,
            scoreConference: currentDaScore.scoreConference,
            scoreSocialMedia: currentDaScore.scoreSocialMedia,
            scoreMediaPodcasts: currentDaScore.scoreMediaPodcasts,
            // Update survey score
            scoreSurvey: avgSurveyScore,
            totalNominationCount: currentDaScore.totalNominationCount + score.nominationCount,
            campaignCount: currentDaScore.campaignCount + 1,
            // Calculated composite score
            compositeScore,
            isCurrent: true,
            effectiveFrom: now,
            lastCalculatedAt: now,
          },
        });
      } else {
        // No existing disease area score - create first record
        // Calculate composite with just survey score (no segment scores yet)
        const compositeScore = toNum(score.scoreSurvey) * toNum(weights.weightSurvey) / 100;

        await prisma.hcpDiseaseAreaScore.create({
          data: {
            hcpId: score.hcpId,
            diseaseAreaId: campaign.diseaseAreaId,
            scoreSurvey: score.scoreSurvey,
            totalNominationCount: score.nominationCount,
            campaignCount: 1,
            compositeScore,
            isCurrent: true,
            effectiveFrom: now,
            lastCalculatedAt: now,
          },
        });
      }

      // Mark campaign score as published
      await prisma.hcpCampaignScore.update({
        where: { id: score.id },
        data: { publishedAt: now },
      });

      processed++;
    }

    return { processed };
  }

  /**
   * Recalculate composite scores for all HCPs in a disease area.
   * Uses default weights if no campaign-specific config exists.
   */
  async recalculateDiseaseAreaComposites(diseaseAreaId: string): Promise<{ processed: number; updated: number }> {
    // Default weights
    const weights = {
      weightPublications: 10,
      weightClinicalTrials: 15,
      weightTradePubs: 10,
      weightOrgLeadership: 10,
      weightOrgAwareness: 10,
      weightConference: 10,
      weightSocialMedia: 5,
      weightMediaPodcasts: 5,
      weightSurvey: 25,
    };

    const toNum = (val: unknown): number => val ? Number(val) : 0;

    // Get all current disease area scores
    const daScores = await prisma.hcpDiseaseAreaScore.findMany({
      where: {
        diseaseAreaId,
        isCurrent: true,
      },
    });

    let updated = 0;
    for (const daScore of daScores) {
      const composite =
        (toNum(daScore.scorePublications) * toNum(weights.weightPublications) / 100) +
        (toNum(daScore.scoreClinicalTrials) * toNum(weights.weightClinicalTrials) / 100) +
        (toNum(daScore.scoreTradePubs) * toNum(weights.weightTradePubs) / 100) +
        (toNum(daScore.scoreOrgLeadership) * toNum(weights.weightOrgLeadership) / 100) +
        (toNum(daScore.scoreOrgAwareness) * toNum(weights.weightOrgAwareness) / 100) +
        (toNum(daScore.scoreConference) * toNum(weights.weightConference) / 100) +
        (toNum(daScore.scoreSocialMedia) * toNum(weights.weightSocialMedia) / 100) +
        (toNum(daScore.scoreMediaPodcasts) * toNum(weights.weightMediaPodcasts) / 100) +
        (toNum(daScore.scoreSurvey) * toNum(weights.weightSurvey) / 100);

      await prisma.hcpDiseaseAreaScore.update({
        where: { id: daScore.id },
        data: {
          compositeScore: composite,
          lastCalculatedAt: new Date(),
        },
      });
      updated++;
    }

    return { processed: daScores.length, updated };
  }

  /**
   * Get score calculation status for a campaign
   */
  async getCalculationStatus(campaignId: string) {
    const [totalNominations, matchedNominations, hcpScores] = await Promise.all([
      prisma.nomination.count({
        where: { response: { campaignId } },
      }),
      prisma.nomination.count({
        where: { response: { campaignId }, matchStatus: 'MATCHED' },
      }),
      prisma.hcpCampaignScore.count({
        where: { campaignId },
      }),
    ]);

    const scoresWithComposite = await prisma.hcpCampaignScore.count({
      where: { campaignId, compositeScore: { not: null } },
    });

    return {
      totalNominations,
      matchedNominations,
      unmatchedNominations: totalNominations - matchedNominations,
      hcpScoresCalculated: hcpScores,
      compositeScoresCalculated: scoresWithComposite,
      readyToPublish: matchedNominations > 0 && scoresWithComposite === hcpScores,
    };
  }
}

export const scoreCalculationService = new ScoreCalculationService();
