import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted for variables needed in vi.mock factories
const mockInstantiateForCampaign = vi.hoisted(() => vi.fn());

// Mock dependencies with inline mock objects
vi.mock('../../lib/prisma', () => ({
  prisma: {
    campaign: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    compositeScoreConfig: {
      create: vi.fn(),
    },
    campaignHcp: {
      count: vi.fn(),
    },
    surveyQuestion: {
      count: vi.fn(),
    },
  },
}));

// Mock survey template service with proper class syntax
vi.mock('../survey-template.service', () => ({
  SurveyTemplateService: class MockSurveyTemplateService {
    instantiateForCampaign = mockInstantiateForCampaign;
  },
}));

vi.mock('../score-calculation.service', () => ({
  scoreCalculationService: {
    calculateSurveyScores: vi.fn(),
    calculateCompositeScores: vi.fn(),
    publishScores: vi.fn(),
  },
}));

import { CampaignService } from '../campaign.service';
import { prisma } from '../../lib/prisma';
import { scoreCalculationService } from '../score-calculation.service';

// Helper functions
function createMockCampaign(overrides = {}) {
  return {
    id: 'campaign-1',
    name: 'Test Campaign',
    clientId: 'client-1',
    diseaseAreaId: 'disease-area-1',
    status: 'ACTIVE',
    publishedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockClient(overrides = {}) {
  return {
    id: 'client-1',
    name: 'Test Client',
    ...overrides,
  };
}

describe('CampaignService', () => {
  let service: CampaignService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CampaignService();
  });

  describe('list', () => {
    it('should return paginated campaigns', async () => {
      vi.mocked(prisma.campaign.count).mockResolvedValue(25);
      vi.mocked(prisma.campaign.findMany).mockResolvedValue([
        {
          ...createMockCampaign(),
          client: { id: 'client-1', name: 'Test Client' },
          diseaseArea: { id: 'da-1', name: 'Cardiology' },
          _count: { campaignHcps: 10, surveyResponses: 5 },
        },
      ] as any);

      const result = await service.list({
        page: 1,
        limit: 10,
      });

      expect(result.items).toHaveLength(1);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 25,
        pages: 3,
      });
    });

    it('should filter by clientId', async () => {
      vi.mocked(prisma.campaign.count).mockResolvedValue(5);
      vi.mocked(prisma.campaign.findMany).mockResolvedValue([]);

      await service.list({
        clientId: 'client-1',
        page: 1,
        limit: 10,
      });

      expect(prisma.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientId: 'client-1' },
        })
      );
    });

    it('should filter by status', async () => {
      vi.mocked(prisma.campaign.count).mockResolvedValue(3);
      vi.mocked(prisma.campaign.findMany).mockResolvedValue([]);

      await service.list({
        status: 'ACTIVE',
        page: 1,
        limit: 10,
      });

      expect(prisma.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'ACTIVE' },
        })
      );
    });
  });

  describe('getById', () => {
    it('should return campaign with related data', async () => {
      const campaign = {
        ...createMockCampaign(),
        client: createMockClient(),
        diseaseArea: { id: 'da-1', name: 'Cardiology' },
        surveyTemplate: { id: 'template-1', name: 'KOL Survey' },
        compositeScoreConfig: {},
        surveyQuestions: [],
        _count: { campaignHcps: 10, surveyResponses: 5 },
      };

      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(campaign as any);

      const result = await service.getById('campaign-1');

      expect(result).toEqual(campaign);
      expect(prisma.campaign.findUnique).toHaveBeenCalledWith({
        where: { id: 'campaign-1' },
        include: expect.objectContaining({
          client: true,
          diseaseArea: true,
          surveyTemplate: true,
          compositeScoreConfig: true,
        }),
      });
    });

    it('should return null for non-existent campaign', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(null);

      const result = await service.getById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    const createInput = {
      clientId: 'client-1',
      diseaseAreaId: 'da-1',
      name: 'New Campaign',
      description: 'A test campaign',
      surveyTemplateId: null,
      honorariumAmount: null,
      surveyOpenDate: null,
      surveyCloseDate: null,
    };

    it('should create campaign with DRAFT status', async () => {
      const campaign = createMockCampaign({ id: 'new-campaign', status: 'DRAFT' });
      vi.mocked(prisma.campaign.create).mockResolvedValue(campaign as any);
      vi.mocked(prisma.compositeScoreConfig.create).mockResolvedValue({} as any);

      const result = await service.create(createInput, 'user-1');

      expect(result.id).toBe('new-campaign');
      expect(prisma.campaign.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clientId: 'client-1',
          diseaseAreaId: 'da-1',
          name: 'New Campaign',
          status: 'DRAFT',
          createdBy: 'user-1',
        }),
      });
    });

    it('should create default score config', async () => {
      vi.mocked(prisma.campaign.create).mockResolvedValue(createMockCampaign({ id: 'campaign-1' }) as any);
      vi.mocked(prisma.compositeScoreConfig.create).mockResolvedValue({} as any);

      await service.create(createInput, 'user-1');

      expect(prisma.compositeScoreConfig.create).toHaveBeenCalledWith({
        data: { campaignId: 'campaign-1' },
      });
    });

    it('should instantiate template when provided', async () => {
      vi.mocked(prisma.campaign.create).mockResolvedValue(createMockCampaign({ id: 'campaign-1' }) as any);
      vi.mocked(prisma.compositeScoreConfig.create).mockResolvedValue({} as any);

      await service.create(
        { ...createInput, surveyTemplateId: 'template-1' },
        'user-1'
      );

      expect(prisma.campaign.create).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update campaign fields', async () => {
      vi.mocked(prisma.campaign.update).mockResolvedValue(
        createMockCampaign({ name: 'Updated Name' }) as any
      );

      const result = await service.update('campaign-1', {
        name: 'Updated Name',
        description: 'Updated description',
      });

      expect(result.name).toBe('Updated Name');
      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'campaign-1' },
        data: expect.objectContaining({
          name: 'Updated Name',
          description: 'Updated description',
        }),
      });
    });

    it('should convert date strings to Date objects', async () => {
      vi.mocked(prisma.campaign.update).mockResolvedValue(createMockCampaign() as any);

      await service.update('campaign-1', {
        surveyOpenDate: '2024-01-01T00:00:00Z',
        surveyCloseDate: '2024-12-31T00:00:00Z',
      });

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'campaign-1' },
        data: expect.objectContaining({
          surveyOpenDate: expect.any(Date),
          surveyCloseDate: expect.any(Date),
        }),
      });
    });
  });

  describe('delete', () => {
    it('should delete draft campaigns', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(
        createMockCampaign({ status: 'DRAFT' }) as any
      );
      vi.mocked(prisma.campaign.delete).mockResolvedValue(createMockCampaign() as any);

      await service.delete('campaign-1');

      expect(prisma.campaign.delete).toHaveBeenCalledWith({
        where: { id: 'campaign-1' },
      });
    });

    it('should throw error for non-draft campaigns', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(
        createMockCampaign({ status: 'ACTIVE' }) as any
      );

      await expect(service.delete('campaign-1')).rejects.toThrow(
        'Can only delete draft campaigns'
      );
    });
  });

  describe('activate', () => {
    it('should activate draft campaign with HCPs and questions', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(
        createMockCampaign({ status: 'DRAFT' }) as any
      );
      vi.mocked(prisma.campaignHcp.count).mockResolvedValue(10);
      vi.mocked(prisma.surveyQuestion.count).mockResolvedValue(5);
      vi.mocked(prisma.campaign.update).mockResolvedValue(
        createMockCampaign({ status: 'ACTIVE' }) as any
      );

      const result = await service.activate('campaign-1');

      expect(result.status).toBe('ACTIVE');
    });

    it('should throw error for non-draft campaigns', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(
        createMockCampaign({ status: 'ACTIVE' }) as any
      );

      await expect(service.activate('campaign-1')).rejects.toThrow(
        'Can only activate draft campaigns'
      );
    });

    it('should throw error when no HCPs assigned', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(
        createMockCampaign({ status: 'DRAFT' }) as any
      );
      vi.mocked(prisma.campaignHcp.count).mockResolvedValue(0);

      await expect(service.activate('campaign-1')).rejects.toThrow(
        'Campaign must have at least one HCP'
      );
    });

    it('should throw error when no survey questions', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(
        createMockCampaign({ status: 'DRAFT' }) as any
      );
      vi.mocked(prisma.campaignHcp.count).mockResolvedValue(10);
      vi.mocked(prisma.surveyQuestion.count).mockResolvedValue(0);

      await expect(service.activate('campaign-1')).rejects.toThrow(
        'Campaign must have survey questions'
      );
    });
  });

  describe('close', () => {
    it('should close active campaigns', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(
        createMockCampaign({ status: 'ACTIVE' }) as any
      );
      vi.mocked(prisma.campaign.update).mockResolvedValue(
        createMockCampaign({ status: 'CLOSED' }) as any
      );

      const result = await service.close('campaign-1');

      expect(result.status).toBe('CLOSED');
    });

    it('should throw error for non-active campaigns', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(
        createMockCampaign({ status: 'DRAFT' }) as any
      );

      await expect(service.close('campaign-1')).rejects.toThrow(
        'Can only close active campaigns'
      );
    });
  });

  describe('reopen', () => {
    it('should reopen closed campaigns', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(
        createMockCampaign({ status: 'CLOSED' }) as any
      );
      vi.mocked(prisma.campaign.update).mockResolvedValue(
        createMockCampaign({ status: 'ACTIVE' }) as any
      );

      const result = await service.reopen('campaign-1');

      expect(result.status).toBe('ACTIVE');
    });

    it('should throw error for non-closed campaigns', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(
        createMockCampaign({ status: 'ACTIVE' }) as any
      );

      await expect(service.reopen('campaign-1')).rejects.toThrow(
        'Can only reopen closed campaigns'
      );
    });
  });

  describe('publish', () => {
    it('should publish closed campaign and calculate scores', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(
        createMockCampaign({ status: 'CLOSED' }) as any
      );
      vi.mocked(scoreCalculationService.calculateSurveyScores).mockResolvedValue({} as any);
      vi.mocked(scoreCalculationService.calculateCompositeScores).mockResolvedValue({} as any);
      vi.mocked(scoreCalculationService.publishScores).mockResolvedValue({} as any);
      vi.mocked(prisma.campaign.update).mockResolvedValue(
        createMockCampaign({ status: 'PUBLISHED', publishedAt: new Date() }) as any
      );

      const result = await service.publish('campaign-1', 'user-1');

      expect(result.status).toBe('PUBLISHED');
      expect(scoreCalculationService.calculateSurveyScores).toHaveBeenCalledWith('campaign-1');
      expect(scoreCalculationService.calculateCompositeScores).toHaveBeenCalledWith('campaign-1');
      expect(scoreCalculationService.publishScores).toHaveBeenCalledWith('campaign-1', 'user-1');
    });

    it('should throw error for non-closed campaigns', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(
        createMockCampaign({ status: 'ACTIVE' }) as any
      );

      await expect(service.publish('campaign-1', 'user-1')).rejects.toThrow(
        'Can only publish closed campaigns'
      );
    });
  });
});
