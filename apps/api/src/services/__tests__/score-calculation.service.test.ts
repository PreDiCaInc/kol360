import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';

// Mock Prisma before importing the service
vi.mock('../../lib/prisma', () => ({
  prisma: {
    surveyQuestion: {
      findMany: vi.fn(),
    },
    nomination: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    hcpCampaignScore: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    campaign: {
      findUnique: vi.fn(),
    },
    hcpDiseaseAreaScore: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { ScoreCalculationService } from '../score-calculation.service';
import { prisma } from '../../lib/prisma';

describe('ScoreCalculationService', () => {
  let service: ScoreCalculationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ScoreCalculationService();
  });

  describe('calculateSurveyScores', () => {
    it('should return 0 processed when no nomination types in campaign', async () => {
      (prisma.surveyQuestion.findMany as Mock).mockResolvedValue([]);
      (prisma.nomination.groupBy as Mock).mockResolvedValue([]);

      const result = await service.calculateSurveyScores('campaign-1');

      expect(result).toEqual({ processed: 0, updated: 0 });
    });

    it('should return 0 when no matched nominations', async () => {
      (prisma.surveyQuestion.findMany as Mock).mockResolvedValue([
        { nominationType: 'DISCUSSION_LEADERS' },
      ]);
      (prisma.nomination.findMany as Mock).mockResolvedValue([]);

      const result = await service.calculateSurveyScores('campaign-1');

      expect(result).toEqual({ processed: 0, updated: 0 });
    });

    it('should calculate scores for matched nominations', async () => {
      (prisma.surveyQuestion.findMany as Mock).mockResolvedValue([
        { nominationType: 'DISCUSSION_LEADERS' },
        { nominationType: 'NATIONAL_LEADER' },
      ]);

      (prisma.nomination.findMany as Mock).mockResolvedValue([
        {
          matchedHcpId: 'hcp-1',
          matchStatus: 'MATCHED',
          question: { nominationType: 'DISCUSSION_LEADERS' },
        },
        {
          matchedHcpId: 'hcp-1',
          matchStatus: 'MATCHED',
          question: { nominationType: 'DISCUSSION_LEADERS' },
        },
        {
          matchedHcpId: 'hcp-2',
          matchStatus: 'MATCHED',
          question: { nominationType: 'DISCUSSION_LEADERS' },
        },
        {
          matchedHcpId: 'hcp-1',
          matchStatus: 'MATCHED',
          question: { nominationType: 'NATIONAL_LEADER' },
        },
      ]);

      (prisma.hcpCampaignScore.upsert as Mock).mockResolvedValue({});

      const result = await service.calculateSurveyScores('campaign-1');

      expect(result.processed).toBe(2); // 2 unique HCPs
      expect(result.updated).toBe(2);
      expect(prisma.hcpCampaignScore.upsert).toHaveBeenCalledTimes(2);
    });

    it('should calculate 100 score for HCP with max nominations', async () => {
      (prisma.surveyQuestion.findMany as Mock).mockResolvedValue([
        { nominationType: 'RISING_STAR' },
      ]);

      (prisma.nomination.findMany as Mock).mockResolvedValue([
        {
          matchedHcpId: 'hcp-1',
          matchStatus: 'MATCHED',
          question: { nominationType: 'RISING_STAR' },
        },
        {
          matchedHcpId: 'hcp-1',
          matchStatus: 'MATCHED',
          question: { nominationType: 'RISING_STAR' },
        },
      ]);

      (prisma.hcpCampaignScore.upsert as Mock).mockResolvedValue({});

      await service.calculateSurveyScores('campaign-1');

      // HCP-1 has 2 nominations, which is the max, so score = 100
      expect(prisma.hcpCampaignScore.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            scoreRisingStar: 100,
            countRisingStar: 2,
          }),
        })
      );
    });
  });

  describe('calculateCompositeScores', () => {
    it('should throw error if campaign not found', async () => {
      (prisma.campaign.findUnique as Mock).mockResolvedValue(null);

      await expect(service.calculateCompositeScores('campaign-1')).rejects.toThrow(
        'Campaign or score config not found'
      );
    });

    it('should throw error if score config not found', async () => {
      (prisma.campaign.findUnique as Mock).mockResolvedValue({
        id: 'campaign-1',
        compositeScoreConfig: null,
      });

      await expect(service.calculateCompositeScores('campaign-1')).rejects.toThrow(
        'Campaign or score config not found'
      );
    });

    it('should return 0 when no campaign scores exist', async () => {
      (prisma.campaign.findUnique as Mock).mockResolvedValue({
        id: 'campaign-1',
        diseaseAreaId: 'da-1',
        compositeScoreConfig: {
          weightPublications: 10,
          weightClinicalTrials: 15,
          weightTradePubs: 10,
          weightOrgLeadership: 10,
          weightOrgAwareness: 10,
          weightConference: 10,
          weightSocialMedia: 5,
          weightMediaPodcasts: 5,
          weightSurvey: 25,
        },
      });
      (prisma.hcpCampaignScore.findMany as Mock).mockResolvedValue([]);

      const result = await service.calculateCompositeScores('campaign-1');

      expect(result).toEqual({ processed: 0, updated: 0 });
    });

    it('should calculate composite scores with weights', async () => {
      (prisma.campaign.findUnique as Mock).mockResolvedValue({
        id: 'campaign-1',
        diseaseAreaId: 'da-1',
        compositeScoreConfig: {
          weightPublications: 10,
          weightClinicalTrials: 15,
          weightTradePubs: 10,
          weightOrgLeadership: 10,
          weightOrgAwareness: 10,
          weightConference: 10,
          weightSocialMedia: 5,
          weightMediaPodcasts: 5,
          weightSurvey: 25,
        },
      });

      (prisma.hcpCampaignScore.findMany as Mock).mockResolvedValue([
        { id: 'score-1', hcpId: 'hcp-1', scoreSurvey: 80 },
      ]);

      (prisma.hcpDiseaseAreaScore.findMany as Mock).mockResolvedValue([
        {
          hcpId: 'hcp-1',
          scorePublications: 90,
          scoreClinicalTrials: 85,
          scoreTradePubs: 70,
          scoreOrgLeadership: 60,
          scoreOrgAwareness: 50,
          scoreConference: 75,
          scoreSocialMedia: 40,
          scoreMediaPodcasts: 30,
        },
      ]);

      (prisma.hcpCampaignScore.update as Mock).mockResolvedValue({});

      const result = await service.calculateCompositeScores('campaign-1');

      expect(result).toEqual({ processed: 1, updated: 1 });
      expect(prisma.hcpCampaignScore.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'score-1' },
          data: expect.objectContaining({
            compositeScore: expect.any(Number),
          }),
        })
      );
    });
  });

  describe('getCalculationStatus', () => {
    it('should return correct status counts', async () => {
      (prisma.nomination.count as Mock)
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(80); // matched

      (prisma.hcpCampaignScore.count as Mock)
        .mockResolvedValueOnce(50) // all scores
        .mockResolvedValueOnce(50); // with composite

      const result = await service.getCalculationStatus('campaign-1');

      expect(result).toEqual({
        totalNominations: 100,
        matchedNominations: 80,
        unmatchedNominations: 20,
        hcpScoresCalculated: 50,
        compositeScoresCalculated: 50,
        readyToPublish: true,
      });
    });

    it('should return not ready if no matched nominations', async () => {
      (prisma.nomination.count as Mock)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(0);

      (prisma.hcpCampaignScore.count as Mock)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await service.getCalculationStatus('campaign-1');

      expect(result.readyToPublish).toBe(false);
    });

    it('should return not ready if composite scores missing', async () => {
      (prisma.nomination.count as Mock)
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(40);

      (prisma.hcpCampaignScore.count as Mock)
        .mockResolvedValueOnce(20) // scores calculated
        .mockResolvedValueOnce(10); // but only half have composite

      const result = await service.getCalculationStatus('campaign-1');

      expect(result.readyToPublish).toBe(false);
    });
  });

  describe('recalculateDiseaseAreaComposites', () => {
    it('should recalculate all current disease area scores', async () => {
      (prisma.hcpDiseaseAreaScore.findMany as Mock).mockResolvedValue([
        {
          id: 'da-score-1',
          hcpId: 'hcp-1',
          scorePublications: 80,
          scoreClinicalTrials: 70,
          scoreTradePubs: 60,
          scoreOrgLeadership: 50,
          scoreOrgAwareness: 40,
          scoreConference: 30,
          scoreSocialMedia: 20,
          scoreMediaPodcasts: 10,
          scoreSurvey: 90,
        },
      ]);

      (prisma.hcpDiseaseAreaScore.update as Mock).mockResolvedValue({});

      const result = await service.recalculateDiseaseAreaComposites('da-1');

      expect(result).toEqual({ processed: 1, updated: 1 });
      expect(prisma.hcpDiseaseAreaScore.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'da-score-1' },
          data: expect.objectContaining({
            compositeScore: expect.any(Number),
            lastCalculatedAt: expect.any(Date),
          }),
        })
      );
    });

    it('should return 0 when no scores exist', async () => {
      (prisma.hcpDiseaseAreaScore.findMany as Mock).mockResolvedValue([]);

      const result = await service.recalculateDiseaseAreaComposites('da-1');

      expect(result).toEqual({ processed: 0, updated: 0 });
    });
  });
});
