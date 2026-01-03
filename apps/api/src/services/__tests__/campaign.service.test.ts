import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { CampaignService } from '../campaign.service';

// Mock prisma
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
    surveyResponse: {
      count: vi.fn(),
    },
    campaignHcp: {
      count: vi.fn(),
    },
    surveyQuestion: {
      count: vi.fn(),
    },
    compositeScoreConfig: {
      create: vi.fn(),
    },
  },
}));

// Mock survey template service
vi.mock('../survey-template.service', () => ({
  SurveyTemplateService: class MockSurveyTemplateService {
    instantiateForCampaign = vi.fn();
  },
}));

// Mock score calculation service
vi.mock('../score-calculation.service', () => ({
  scoreCalculationService: {
    calculateSurveyScores: vi.fn(),
    calculateCompositeScores: vi.fn(),
    publishScores: vi.fn(),
  },
}));

import { prisma } from '../../lib/prisma';

describe('CampaignService', () => {
  let campaignService: CampaignService;

  beforeEach(() => {
    campaignService = new CampaignService();
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should return paginated campaigns', async () => {
      const mockCampaigns = [
        { id: 'camp-1', name: 'Campaign 1', status: 'DRAFT' },
        { id: 'camp-2', name: 'Campaign 2', status: 'ACTIVE' },
      ];

      (prisma.campaign.count as Mock).mockResolvedValue(2);
      (prisma.campaign.findMany as Mock).mockResolvedValue(mockCampaigns);

      const result = await campaignService.list({
        page: 1,
        limit: 10,
      });

      expect(result.items).toEqual(mockCampaigns);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        pages: 1,
      });
    });

    it('should filter by clientId', async () => {
      (prisma.campaign.count as Mock).mockResolvedValue(1);
      (prisma.campaign.findMany as Mock).mockResolvedValue([]);

      await campaignService.list({
        page: 1,
        limit: 10,
        clientId: 'client-1',
      });

      expect(prisma.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clientId: 'client-1' }),
        })
      );
    });

    it('should filter by status', async () => {
      (prisma.campaign.count as Mock).mockResolvedValue(0);
      (prisma.campaign.findMany as Mock).mockResolvedValue([]);

      await campaignService.list({
        page: 1,
        limit: 10,
        status: 'ACTIVE',
      });

      expect(prisma.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ACTIVE' }),
        })
      );
    });

    it('should handle pagination correctly', async () => {
      (prisma.campaign.count as Mock).mockResolvedValue(25);
      (prisma.campaign.findMany as Mock).mockResolvedValue([]);

      const result = await campaignService.list({
        page: 2,
        limit: 10,
      });

      expect(prisma.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        })
      );
      expect(result.pagination.pages).toBe(3);
    });
  });

  describe('getById', () => {
    it('should return campaign with details', async () => {
      const mockCampaign = {
        id: 'camp-1',
        name: 'Test Campaign',
        status: 'DRAFT',
        _count: { campaignHcps: 5, surveyResponses: 10 },
      };

      (prisma.campaign.findUnique as Mock).mockResolvedValue(mockCampaign);
      (prisma.surveyResponse.count as Mock).mockResolvedValue(3);

      const result = await campaignService.getById('camp-1');

      expect(result).toEqual({
        ...mockCampaign,
        _count: {
          campaignHcps: 5,
          surveyResponses: 10,
          completedResponses: 3,
        },
      });
    });

    it('should return null for non-existent campaign', async () => {
      (prisma.campaign.findUnique as Mock).mockResolvedValue(null);

      const result = await campaignService.getById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a campaign with default score config', async () => {
      const mockCampaign = { id: 'new-camp', name: 'New Campaign' };
      (prisma.campaign.create as Mock).mockResolvedValue(mockCampaign);
      (prisma.compositeScoreConfig.create as Mock).mockResolvedValue({});

      const result = await campaignService.create(
        {
          clientId: 'client-1',
          name: 'New Campaign',
        },
        'user-1'
      );

      expect(result).toEqual(mockCampaign);
      expect(prisma.compositeScoreConfig.create).toHaveBeenCalledWith({
        data: { campaignId: 'new-camp' },
      });
    });

    it('should set status to DRAFT on creation', async () => {
      (prisma.campaign.create as Mock).mockResolvedValue({ id: 'camp-1' });
      (prisma.compositeScoreConfig.create as Mock).mockResolvedValue({});

      await campaignService.create(
        { clientId: 'client-1', name: 'Test' },
        'user-1'
      );

      expect(prisma.campaign.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'DRAFT' }),
      });
    });
  });

  describe('update', () => {
    it('should update campaign fields', async () => {
      const updatedCampaign = { id: 'camp-1', name: 'Updated Name' };
      (prisma.campaign.update as Mock).mockResolvedValue(updatedCampaign);

      const result = await campaignService.update('camp-1', {
        name: 'Updated Name',
      });

      expect(result).toEqual(updatedCampaign);
    });

    it('should handle date fields correctly', async () => {
      (prisma.campaign.update as Mock).mockResolvedValue({});

      await campaignService.update('camp-1', {
        surveyOpenDate: '2024-01-01',
        surveyCloseDate: '2024-12-31',
      });

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'camp-1' },
        data: expect.objectContaining({
          surveyOpenDate: expect.any(Date),
          surveyCloseDate: expect.any(Date),
        }),
      });
    });
  });

  describe('delete', () => {
    it('should delete draft campaigns', async () => {
      (prisma.campaign.findUnique as Mock).mockResolvedValue({
        id: 'camp-1',
        status: 'DRAFT',
      });
      (prisma.campaign.delete as Mock).mockResolvedValue({});

      await campaignService.delete('camp-1');

      expect(prisma.campaign.delete).toHaveBeenCalledWith({
        where: { id: 'camp-1' },
      });
    });

    it('should throw error for non-draft campaigns', async () => {
      (prisma.campaign.findUnique as Mock).mockResolvedValue({
        id: 'camp-1',
        status: 'ACTIVE',
      });

      await expect(campaignService.delete('camp-1')).rejects.toThrow(
        'Can only delete draft campaigns'
      );
    });
  });

  describe('activate', () => {
    it('should activate draft campaigns with HCPs and questions', async () => {
      (prisma.campaign.findUnique as Mock).mockResolvedValue({
        id: 'camp-1',
        status: 'DRAFT',
      });
      (prisma.campaignHcp.count as Mock).mockResolvedValue(5);
      (prisma.surveyQuestion.count as Mock).mockResolvedValue(10);
      (prisma.campaign.update as Mock).mockResolvedValue({});

      await campaignService.activate('camp-1');

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'camp-1' },
        data: expect.objectContaining({
          status: 'ACTIVE',
          surveyOpenDate: expect.any(Date),
        }),
      });
    });

    it('should throw error for non-draft campaigns', async () => {
      (prisma.campaign.findUnique as Mock).mockResolvedValue({
        id: 'camp-1',
        status: 'ACTIVE',
      });

      await expect(campaignService.activate('camp-1')).rejects.toThrow(
        'Can only activate draft campaigns'
      );
    });

    it('should throw error if no HCPs', async () => {
      (prisma.campaign.findUnique as Mock).mockResolvedValue({
        id: 'camp-1',
        status: 'DRAFT',
      });
      (prisma.campaignHcp.count as Mock).mockResolvedValue(0);

      await expect(campaignService.activate('camp-1')).rejects.toThrow(
        'Campaign must have at least one HCP'
      );
    });

    it('should throw error if no questions', async () => {
      (prisma.campaign.findUnique as Mock).mockResolvedValue({
        id: 'camp-1',
        status: 'DRAFT',
      });
      (prisma.campaignHcp.count as Mock).mockResolvedValue(5);
      (prisma.surveyQuestion.count as Mock).mockResolvedValue(0);

      await expect(campaignService.activate('camp-1')).rejects.toThrow(
        'Campaign must have survey questions'
      );
    });
  });

  describe('close', () => {
    it('should close active campaigns', async () => {
      (prisma.campaign.findUnique as Mock).mockResolvedValue({
        id: 'camp-1',
        status: 'ACTIVE',
      });
      (prisma.campaign.update as Mock).mockResolvedValue({});

      await campaignService.close('camp-1');

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'camp-1' },
        data: expect.objectContaining({
          status: 'CLOSED',
          surveyCloseDate: expect.any(Date),
        }),
      });
    });

    it('should throw error for non-active campaigns', async () => {
      (prisma.campaign.findUnique as Mock).mockResolvedValue({
        id: 'camp-1',
        status: 'DRAFT',
      });

      await expect(campaignService.close('camp-1')).rejects.toThrow(
        'Can only close active campaigns'
      );
    });
  });

  describe('reopen', () => {
    it('should reopen closed campaigns', async () => {
      (prisma.campaign.findUnique as Mock).mockResolvedValue({
        id: 'camp-1',
        status: 'CLOSED',
      });
      (prisma.campaign.update as Mock).mockResolvedValue({});

      await campaignService.reopen('camp-1');

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'camp-1' },
        data: expect.objectContaining({
          status: 'ACTIVE',
          surveyCloseDate: null,
        }),
      });
    });

    it('should throw error for non-closed campaigns', async () => {
      (prisma.campaign.findUnique as Mock).mockResolvedValue({
        id: 'camp-1',
        status: 'ACTIVE',
      });

      await expect(campaignService.reopen('camp-1')).rejects.toThrow(
        'Can only reopen closed campaigns'
      );
    });
  });

  describe('publish', () => {
    it('should publish closed campaigns', async () => {
      (prisma.campaign.findUnique as Mock).mockResolvedValue({
        id: 'camp-1',
        status: 'CLOSED',
      });
      (prisma.campaign.update as Mock).mockResolvedValue({});

      await campaignService.publish('camp-1', 'user-1');

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'camp-1' },
        data: expect.objectContaining({
          status: 'PUBLISHED',
          publishedAt: expect.any(Date),
        }),
      });
    });

    it('should throw error for non-closed campaigns', async () => {
      (prisma.campaign.findUnique as Mock).mockResolvedValue({
        id: 'camp-1',
        status: 'ACTIVE',
      });

      await expect(
        campaignService.publish('camp-1', 'user-1')
      ).rejects.toThrow('Can only publish closed campaigns');
    });
  });

  describe('updateEmailTemplates', () => {
    it('should update email templates', async () => {
      (prisma.campaign.update as Mock).mockResolvedValue({});

      await campaignService.updateEmailTemplates('camp-1', {
        invitationEmailSubject: 'New Subject',
        invitationEmailBody: 'New Body',
      });

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'camp-1' },
        data: expect.objectContaining({
          invitationEmailSubject: 'New Subject',
          invitationEmailBody: 'New Body',
        }),
      });
    });
  });

  describe('updateLandingPageTemplates', () => {
    it('should update landing page templates', async () => {
      (prisma.campaign.update as Mock).mockResolvedValue({});

      await campaignService.updateLandingPageTemplates('camp-1', {
        surveyWelcomeTitle: 'Welcome',
        surveyWelcomeMessage: 'Welcome message',
      });

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'camp-1' },
        data: expect.objectContaining({
          surveyWelcomeTitle: 'Welcome',
          surveyWelcomeMessage: 'Welcome message',
        }),
      });
    });
  });
});
