import { prisma } from '../lib/prisma';

export class ScoreCalculationService {
  /**
   * Calculate survey scores for all HCPs nominated in a campaign.
   * Survey score = (nomination_count / max_nominations_in_campaign) * 100
   *
   * This should be called after nomination matching is complete.
   */
  async calculateSurveyScores(campaignId: string): Promise<{ processed: number; updated: number }> {
    // 1. Get all MATCHED nominations for this campaign, grouped by nominated HCP
    const nominationCounts = await prisma.nomination.groupBy({
      by: ['matchedHcpId'],
      where: {
        response: { campaignId },
        matchStatus: 'MATCHED',
        matchedHcpId: { not: null },
      },
      _count: { id: true },
    });

    if (nominationCounts.length === 0) {
      return { processed: 0, updated: 0 };
    }

    // 2. Find the maximum nomination count (for normalization)
    const maxNominations = Math.max(...nominationCounts.map((n: { _count: { id: number } }) => n._count.id));

    // 3. Calculate and upsert HcpCampaignScore for each nominated HCP
    let updated = 0;
    for (const nom of nominationCounts) {
      if (!nom.matchedHcpId) continue;

      // Survey score normalized to 0-100
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
      include: { diseaseArea: true },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

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
            // Recalculate composite (would need weights - use default or campaign-specific)
            compositeScore: currentDaScore.compositeScore, // TODO: recalculate
            isCurrent: true,
            effectiveFrom: now,
            lastCalculatedAt: now,
          },
        });
      } else {
        // No existing disease area score - create first record
        await prisma.hcpDiseaseAreaScore.create({
          data: {
            hcpId: score.hcpId,
            diseaseAreaId: campaign.diseaseAreaId,
            scoreSurvey: score.scoreSurvey,
            totalNominationCount: score.nominationCount,
            campaignCount: 1,
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
