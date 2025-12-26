import { prisma } from '../lib/prisma';
import { ScoreConfigInput, DEFAULT_SCORE_WEIGHTS } from '@kol360/shared';

export class ScoreConfigService {
  async getByCampaignId(campaignId: string) {
    const config = await prisma.compositeScoreConfig.findUnique({
      where: { campaignId },
    });

    if (!config) {
      // Create default config if doesn't exist
      return this.createDefault(campaignId);
    }

    return this.formatConfig(config);
  }

  async createDefault(campaignId: string) {
    const config = await prisma.compositeScoreConfig.create({
      data: {
        campaignId,
        ...DEFAULT_SCORE_WEIGHTS,
      },
    });

    return this.formatConfig(config);
  }

  async update(campaignId: string, data: ScoreConfigInput) {
    const config = await prisma.compositeScoreConfig.upsert({
      where: { campaignId },
      create: {
        campaignId,
        ...data,
      },
      update: data,
    });

    return this.formatConfig(config);
  }

  async resetToDefaults(campaignId: string) {
    const config = await prisma.compositeScoreConfig.upsert({
      where: { campaignId },
      create: {
        campaignId,
        ...DEFAULT_SCORE_WEIGHTS,
      },
      update: DEFAULT_SCORE_WEIGHTS,
    });

    return this.formatConfig(config);
  }

  private formatConfig(config: {
    id: string;
    campaignId: string;
    weightPublications: unknown;
    weightClinicalTrials: unknown;
    weightTradePubs: unknown;
    weightOrgLeadership: unknown;
    weightOrgAwareness: unknown;
    weightConference: unknown;
    weightSocialMedia: unknown;
    weightMediaPodcasts: unknown;
    weightSurvey: unknown;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: config.id,
      campaignId: config.campaignId,
      weightPublications: Number(config.weightPublications),
      weightClinicalTrials: Number(config.weightClinicalTrials),
      weightTradePubs: Number(config.weightTradePubs),
      weightOrgLeadership: Number(config.weightOrgLeadership),
      weightOrgAwareness: Number(config.weightOrgAwareness),
      weightConference: Number(config.weightConference),
      weightSocialMedia: Number(config.weightSocialMedia),
      weightMediaPodcasts: Number(config.weightMediaPodcasts),
      weightSurvey: Number(config.weightSurvey),
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }
}
