import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create mock functions first, before vi.mock
const mockPrisma = {
  campaign: {
    findUnique: vi.fn(),
  },
  nomination: {
    groupBy: vi.fn(),
    count: vi.fn(),
  },
  hcpCampaignScore: {
    upsert: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  hcpDiseaseAreaScore: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

// Mock the prisma client with inline mock object
vi.mock('../../lib/prisma', () => ({
  prisma: {
    campaign: {
      findUnique: vi.fn(),
    },
    nomination: {
      groupBy: vi.fn(),
      count: vi.fn(),
    },
    hcpCampaignScore: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    hcpDiseaseAreaScore: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { ScoreCalculationService } from '../score-calculation.service';
import { prisma } from '../../lib/prisma';

// Helper functions for creating mock data
function createMockCampaign(overrides = {}) {
  return {
    id: 'campaign-1',
    name: 'Test Campaign',
    clientId: 'client-1',
    diseaseAreaId: 'disease-area-1',
    status: 'ACTIVE',
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockScoreConfig(overrides = {}) {
  return {
    weightPublications: 10,
    weightClinicalTrials: 15,
    weightTradePubs: 10,
    weightOrgLeadership: 10,
    weightOrgAwareness: 10,
    weightConference: 10,
    weightSocialMedia: 5,
    weightMediaPodcasts: 5,
    weightSurvey: 25,
    ...overrides,
  };
}

function createMockHcpCampaignScore(overrides = {}) {
  return {
    id: 'score-1',
    hcpId: 'hcp-1',
    campaignId: 'campaign-1',
    scoreSurvey: 0,
    nominationCount: 0,
    compositeScore: null,
    publishedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockDiseaseAreaScore(overrides = {}) {
  return {
    id: 'da-score-1',
    hcpId: 'hcp-1',
    diseaseAreaId: 'disease-area-1',
    scorePublications: 0,
    scoreClinicalTrials: 0,
    scoreTradePubs: 0,
    scoreOrgLeadership: 0,
    scoreOrgAwareness: 0,
    scoreConference: 0,
    scoreSocialMedia: 0,
    scoreMediaPodcasts: 0,
    scoreSurvey: 0,
    totalNominationCount: 0,
    campaignCount: 0,
    isCurrent: true,
    ...overrides,
  };
}

describe('ScoreCalculationService', () => {
  let service: ScoreCalculationService;
  const mockPrismaTyped = prisma as unknown as typeof mockPrisma;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ScoreCalculationService();
  });

  describe('calculateSurveyScores', () => {
    it('should return zero counts when no matched nominations exist', async () => {
      vi.mocked(mockPrismaTyped.nomination.groupBy).mockResolvedValue([]);

      const result = await service.calculateSurveyScores('campaign-1');

      expect(result).toEqual({ processed: 0, updated: 0 });
      expect(mockPrismaTyped.nomination.groupBy).toHaveBeenCalledWith({
        by: ['matchedHcpId'],
        where: {
          response: { campaignId: 'campaign-1' },
          matchStatus: 'MATCHED',
          matchedHcpId: { not: null },
        },
        _count: { id: true },
      });
    });

    it('should calculate normalized survey scores correctly', async () => {
      vi.mocked(mockPrismaTyped.nomination.groupBy).mockResolvedValue([
        { matchedHcpId: 'hcp-1', _count: { id: 10 } },
        { matchedHcpId: 'hcp-2', _count: { id: 5 } },
      ] as any);
      vi.mocked(mockPrismaTyped.hcpCampaignScore.upsert).mockResolvedValue({} as any);

      const result = await service.calculateSurveyScores('campaign-1');

      expect(result).toEqual({ processed: 2, updated: 2 });

      expect(mockPrismaTyped.hcpCampaignScore.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { hcpId_campaignId: { hcpId: 'hcp-1', campaignId: 'campaign-1' } },
          create: expect.objectContaining({
            scoreSurvey: 100,
            nominationCount: 10,
          }),
        })
      );

      expect(mockPrismaTyped.hcpCampaignScore.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { hcpId_campaignId: { hcpId: 'hcp-2', campaignId: 'campaign-1' } },
          create: expect.objectContaining({
            scoreSurvey: 50,
            nominationCount: 5,
          }),
        })
      );
    });

    it('should handle single HCP with nominations', async () => {
      vi.mocked(mockPrismaTyped.nomination.groupBy).mockResolvedValue([
        { matchedHcpId: 'hcp-1', _count: { id: 8 } },
      ] as any);
      vi.mocked(mockPrismaTyped.hcpCampaignScore.upsert).mockResolvedValue({} as any);

      const result = await service.calculateSurveyScores('campaign-1');

      expect(result).toEqual({ processed: 1, updated: 1 });
      expect(mockPrismaTyped.hcpCampaignScore.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            scoreSurvey: 100,
            nominationCount: 8,
          }),
        })
      );
    });

    it('should skip null matchedHcpId entries', async () => {
      vi.mocked(mockPrismaTyped.nomination.groupBy).mockResolvedValue([
        { matchedHcpId: null, _count: { id: 5 } },
        { matchedHcpId: 'hcp-1', _count: { id: 10 } },
      ] as any);
      vi.mocked(mockPrismaTyped.hcpCampaignScore.upsert).mockResolvedValue({} as any);

      const result = await service.calculateSurveyScores('campaign-1');

      expect(result.updated).toBe(1);
      expect(mockPrismaTyped.hcpCampaignScore.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('calculateCompositeScores', () => {
    it('should throw error when campaign not found', async () => {
      vi.mocked(mockPrismaTyped.campaign.findUnique).mockResolvedValue(null);

      await expect(service.calculateCompositeScores('campaign-1')).rejects.toThrow(
        'Campaign or score config not found'
      );
    });

    it('should throw error when score config not found', async () => {
      vi.mocked(mockPrismaTyped.campaign.findUnique).mockResolvedValue(
        createMockCampaign({ compositeScoreConfig: null }) as any
      );

      await expect(service.calculateCompositeScores('campaign-1')).rejects.toThrow(
        'Campaign or score config not found'
      );
    });

    it('should return zero counts when no campaign scores exist', async () => {
      vi.mocked(mockPrismaTyped.campaign.findUnique).mockResolvedValue({
        ...createMockCampaign(),
        compositeScoreConfig: createMockScoreConfig(),
        diseaseArea: { id: 'disease-area-1', name: 'Cardiology' },
      } as any);
      vi.mocked(mockPrismaTyped.hcpCampaignScore.findMany).mockResolvedValue([]);

      const result = await service.calculateCompositeScores('campaign-1');

      expect(result).toEqual({ processed: 0, updated: 0 });
    });

    it('should calculate weighted composite scores correctly', async () => {
      const weights = createMockScoreConfig();
      vi.mocked(mockPrismaTyped.campaign.findUnique).mockResolvedValue({
        ...createMockCampaign(),
        compositeScoreConfig: weights,
        diseaseArea: { id: 'disease-area-1', name: 'Cardiology' },
      } as any);

      const campaignScore = createMockHcpCampaignScore({
        id: 'score-1',
        hcpId: 'hcp-1',
        scoreSurvey: 80,
      });
      vi.mocked(mockPrismaTyped.hcpCampaignScore.findMany).mockResolvedValue([
        { ...campaignScore, hcp: { id: 'hcp-1' } },
      ] as any);

      const daScore = createMockDiseaseAreaScore({
        hcpId: 'hcp-1',
        scorePublications: 90,
        scoreClinicalTrials: 80,
        scoreTradePubs: 70,
        scoreOrgLeadership: 85,
        scoreOrgAwareness: 75,
        scoreConference: 95,
        scoreSocialMedia: 60,
        scoreMediaPodcasts: 55,
      });
      vi.mocked(mockPrismaTyped.hcpDiseaseAreaScore.findMany).mockResolvedValue([daScore] as any);
      vi.mocked(mockPrismaTyped.hcpCampaignScore.update).mockResolvedValue({} as any);

      const result = await service.calculateCompositeScores('campaign-1');

      expect(result).toEqual({ processed: 1, updated: 1 });
      expect(mockPrismaTyped.hcpCampaignScore.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'score-1' },
          data: expect.objectContaining({
            compositeScore: 79.25,
          }),
        })
      );
    });

    it('should handle missing disease area scores gracefully', async () => {
      vi.mocked(mockPrismaTyped.campaign.findUnique).mockResolvedValue({
        ...createMockCampaign(),
        compositeScoreConfig: createMockScoreConfig(),
        diseaseArea: { id: 'disease-area-1', name: 'Cardiology' },
      } as any);

      vi.mocked(mockPrismaTyped.hcpCampaignScore.findMany).mockResolvedValue([
        { ...createMockHcpCampaignScore({ scoreSurvey: 80 }), hcp: { id: 'hcp-1' } },
      ] as any);

      vi.mocked(mockPrismaTyped.hcpDiseaseAreaScore.findMany).mockResolvedValue([]);
      vi.mocked(mockPrismaTyped.hcpCampaignScore.update).mockResolvedValue({} as any);

      const result = await service.calculateCompositeScores('campaign-1');

      expect(result.updated).toBe(1);
      expect(mockPrismaTyped.hcpCampaignScore.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            compositeScore: 20,
          }),
        })
      );
    });
  });

  describe('publishScores', () => {
    it('should throw error when campaign not found', async () => {
      vi.mocked(mockPrismaTyped.campaign.findUnique).mockResolvedValue(null);

      await expect(service.publishScores('campaign-1', 'user-1')).rejects.toThrow(
        'Campaign not found'
      );
    });

    it('should return zero processed when no campaign scores exist', async () => {
      vi.mocked(mockPrismaTyped.campaign.findUnique).mockResolvedValue({
        ...createMockCampaign(),
        diseaseArea: { id: 'disease-area-1', name: 'Cardiology' },
      } as any);
      vi.mocked(mockPrismaTyped.hcpCampaignScore.findMany).mockResolvedValue([]);

      const result = await service.publishScores('campaign-1', 'user-1');

      expect(result).toEqual({ processed: 0 });
    });

    it('should create new disease area score when none exists', async () => {
      vi.mocked(mockPrismaTyped.campaign.findUnique).mockResolvedValue({
        ...createMockCampaign(),
        diseaseArea: { id: 'disease-area-1', name: 'Cardiology' },
      } as any);

      const campaignScore = createMockHcpCampaignScore({
        hcpId: 'hcp-1',
        scoreSurvey: 75,
        nominationCount: 5,
      });
      vi.mocked(mockPrismaTyped.hcpCampaignScore.findMany).mockResolvedValue([campaignScore] as any);
      vi.mocked(mockPrismaTyped.hcpDiseaseAreaScore.findFirst).mockResolvedValue(null);
      vi.mocked(mockPrismaTyped.hcpDiseaseAreaScore.create).mockResolvedValue({} as any);
      vi.mocked(mockPrismaTyped.hcpCampaignScore.update).mockResolvedValue({} as any);

      const result = await service.publishScores('campaign-1', 'user-1');

      expect(result).toEqual({ processed: 1 });
      expect(mockPrismaTyped.hcpDiseaseAreaScore.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hcpId: 'hcp-1',
            diseaseAreaId: 'disease-area-1',
            scoreSurvey: 75,
            totalNominationCount: 5,
            campaignCount: 1,
            isCurrent: true,
          }),
        })
      );
    });

    it('should update existing disease area score with SCD Type 2 pattern', async () => {
      vi.mocked(mockPrismaTyped.campaign.findUnique).mockResolvedValue({
        ...createMockCampaign(),
        diseaseArea: { id: 'disease-area-1', name: 'Cardiology' },
      } as any);

      const campaignScore = createMockHcpCampaignScore({
        hcpId: 'hcp-1',
        scoreSurvey: 80,
        nominationCount: 10,
      });
      vi.mocked(mockPrismaTyped.hcpCampaignScore.findMany).mockResolvedValue([campaignScore] as any);

      const existingDaScore = createMockDiseaseAreaScore({
        id: 'da-score-1',
        hcpId: 'hcp-1',
        isCurrent: true,
        totalNominationCount: 5,
        campaignCount: 1,
      });
      vi.mocked(mockPrismaTyped.hcpDiseaseAreaScore.findFirst).mockResolvedValue(existingDaScore as any);
      vi.mocked(mockPrismaTyped.hcpDiseaseAreaScore.update).mockResolvedValue({} as any);
      vi.mocked(mockPrismaTyped.hcpDiseaseAreaScore.create).mockResolvedValue({} as any);
      vi.mocked(mockPrismaTyped.hcpCampaignScore.update).mockResolvedValue({} as any);

      const result = await service.publishScores('campaign-1', 'user-1');

      expect(result).toEqual({ processed: 1 });

      expect(mockPrismaTyped.hcpDiseaseAreaScore.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'da-score-1' },
          data: expect.objectContaining({
            isCurrent: false,
          }),
        })
      );

      expect(mockPrismaTyped.hcpDiseaseAreaScore.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hcpId: 'hcp-1',
            isCurrent: true,
            totalNominationCount: 15,
            campaignCount: 2,
          }),
        })
      );
    });

    it('should mark campaign scores as published', async () => {
      vi.mocked(mockPrismaTyped.campaign.findUnique).mockResolvedValue({
        ...createMockCampaign(),
        diseaseArea: { id: 'disease-area-1', name: 'Cardiology' },
      } as any);

      const campaignScore = createMockHcpCampaignScore({ id: 'score-1' });
      vi.mocked(mockPrismaTyped.hcpCampaignScore.findMany).mockResolvedValue([campaignScore] as any);
      vi.mocked(mockPrismaTyped.hcpDiseaseAreaScore.findFirst).mockResolvedValue(null);
      vi.mocked(mockPrismaTyped.hcpDiseaseAreaScore.create).mockResolvedValue({} as any);
      vi.mocked(mockPrismaTyped.hcpCampaignScore.update).mockResolvedValue({} as any);

      await service.publishScores('campaign-1', 'user-1');

      expect(mockPrismaTyped.hcpCampaignScore.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'score-1' },
          data: expect.objectContaining({
            publishedAt: expect.any(Date),
          }),
        })
      );
    });
  });

  describe('getCalculationStatus', () => {
    it('should return correct status counts', async () => {
      vi.mocked(mockPrismaTyped.nomination.count)
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(80);
      vi.mocked(mockPrismaTyped.hcpCampaignScore.count)
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(50);

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

    it('should indicate not ready to publish when scores are incomplete', async () => {
      vi.mocked(mockPrismaTyped.nomination.count)
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(80);
      vi.mocked(mockPrismaTyped.hcpCampaignScore.count)
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(30);

      const result = await service.getCalculationStatus('campaign-1');

      expect(result.readyToPublish).toBe(false);
    });

    it('should indicate not ready when no matched nominations', async () => {
      vi.mocked(mockPrismaTyped.nomination.count)
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(0);
      vi.mocked(mockPrismaTyped.hcpCampaignScore.count)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await service.getCalculationStatus('campaign-1');

      expect(result.readyToPublish).toBe(false);
    });
  });
});
