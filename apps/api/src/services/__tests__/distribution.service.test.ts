import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';

// Mock csv-parse/sync before importing the service
vi.mock('csv-parse/sync', () => ({
  parse: vi.fn(() => []),
}));

// Mock exceljs
vi.mock('exceljs', () => ({
  default: {
    Workbook: vi.fn().mockImplementation(() => ({
      xlsx: { load: vi.fn() },
      worksheets: [{ eachRow: vi.fn() }],
    })),
  },
}));

import { DistributionService } from '../distribution.service';

// Mock prisma
vi.mock('../../lib/prisma', () => ({
  prisma: {
    campaignHcp: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      createMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    surveyResponse: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    optOut: {
      count: vi.fn(),
    },
    hcp: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock email service
vi.mock('./email.service', () => ({
  emailService: {
    sendBulkInvitations: vi.fn(),
    sendBulkReminders: vi.fn(),
    sendSurveyInvitation: vi.fn(),
  },
}));

import { prisma } from '../../lib/prisma';

describe('DistributionService', () => {
  let distributionService: DistributionService;

  beforeEach(() => {
    distributionService = new DistributionService();
    vi.clearAllMocks();
  });

  describe('listCampaignHcps', () => {
    it('should return HCPs with survey status', async () => {
      const mockCampaignHcps = [
        {
          id: 'ch-1',
          campaignId: 'campaign-1',
          hcpId: 'hcp-1',
          hcp: { id: 'hcp-1', firstName: 'John', lastName: 'Doe', email: 'john@example.com', specialty: 'Cardiology' },
        },
      ];
      const mockResponses = [
        { respondentHcpId: 'hcp-1', status: 'COMPLETED', completedAt: new Date() },
      ];

      (prisma.campaignHcp.findMany as Mock).mockResolvedValue(mockCampaignHcps);
      (prisma.surveyResponse.findMany as Mock).mockResolvedValue(mockResponses);

      const result = await distributionService.listCampaignHcps('campaign-1');

      expect(result).toHaveLength(1);
      expect(result[0].surveyStatus).toBe('COMPLETED');
    });

    it('should return null status for HCPs without response', async () => {
      const mockCampaignHcps = [
        {
          id: 'ch-1',
          campaignId: 'campaign-1',
          hcpId: 'hcp-1',
          hcp: { id: 'hcp-1', firstName: 'John', lastName: 'Doe' },
        },
      ];

      (prisma.campaignHcp.findMany as Mock).mockResolvedValue(mockCampaignHcps);
      (prisma.surveyResponse.findMany as Mock).mockResolvedValue([]);

      const result = await distributionService.listCampaignHcps('campaign-1');

      expect(result[0].surveyStatus).toBeNull();
    });
  });

  describe('assignHcps', () => {
    it('should assign new HCPs to campaign', async () => {
      (prisma.campaignHcp.findMany as Mock).mockResolvedValue([]);
      (prisma.campaignHcp.createMany as Mock).mockResolvedValue({ count: 3 });

      const result = await distributionService.assignHcps('campaign-1', ['hcp-1', 'hcp-2', 'hcp-3']);

      expect(result.added).toBe(3);
      expect(result.skipped).toBe(0);
      expect(prisma.campaignHcp.createMany).toHaveBeenCalledWith({
        data: [
          { campaignId: 'campaign-1', hcpId: 'hcp-1' },
          { campaignId: 'campaign-1', hcpId: 'hcp-2' },
          { campaignId: 'campaign-1', hcpId: 'hcp-3' },
        ],
      });
    });

    it('should skip already assigned HCPs', async () => {
      (prisma.campaignHcp.findMany as Mock).mockResolvedValue([
        { hcpId: 'hcp-1' },
        { hcpId: 'hcp-2' },
      ]);
      (prisma.campaignHcp.createMany as Mock).mockResolvedValue({ count: 1 });

      const result = await distributionService.assignHcps('campaign-1', ['hcp-1', 'hcp-2', 'hcp-3']);

      expect(result.added).toBe(1);
      expect(result.skipped).toBe(2);
    });

    it('should handle all HCPs already assigned', async () => {
      (prisma.campaignHcp.findMany as Mock).mockResolvedValue([
        { hcpId: 'hcp-1' },
      ]);

      const result = await distributionService.assignHcps('campaign-1', ['hcp-1']);

      expect(result.added).toBe(0);
      expect(result.skipped).toBe(1);
      expect(prisma.campaignHcp.createMany).not.toHaveBeenCalled();
    });
  });

  describe('removeHcp', () => {
    it('should remove HCP from campaign', async () => {
      (prisma.campaignHcp.findUnique as Mock).mockResolvedValue({
        id: 'ch-1',
        emailSentAt: null,
      });
      (prisma.campaignHcp.delete as Mock).mockResolvedValue({ id: 'ch-1' });

      const result = await distributionService.removeHcp('campaign-1', 'hcp-1');

      expect(result.removed).toBe(true);
    });

    it('should throw error if HCP not assigned', async () => {
      (prisma.campaignHcp.findUnique as Mock).mockResolvedValue(null);

      await expect(
        distributionService.removeHcp('campaign-1', 'hcp-1')
      ).rejects.toThrow('HCP not assigned to this campaign');
    });

    it('should throw error if invitation already sent', async () => {
      (prisma.campaignHcp.findUnique as Mock).mockResolvedValue({
        id: 'ch-1',
        emailSentAt: new Date(),
      });

      await expect(
        distributionService.removeHcp('campaign-1', 'hcp-1')
      ).rejects.toThrow('Cannot remove HCP after survey invitation was sent');
    });
  });

  describe('getStats', () => {
    it('should return distribution statistics', async () => {
      (prisma.campaignHcp.count as Mock)
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(80); // invited
      (prisma.optOut.count as Mock).mockResolvedValue(5);
      (prisma.surveyResponse.groupBy as Mock).mockResolvedValue([
        { status: 'COMPLETED', _count: 50 },
        { status: 'IN_PROGRESS', _count: 10 },
        { status: 'OPENED', _count: 5 },
      ]);

      const result = await distributionService.getStats('campaign-1');

      expect(result.total).toBe(100);
      expect(result.invited).toBe(80);
      expect(result.notInvited).toBe(20);
      expect(result.completed).toBe(50);
      expect(result.inProgress).toBe(10);
      expect(result.opened).toBe(5);
      expect(result.optedOut).toBe(5);
      expect(result.completionRate).toBe(63); // 50/80 * 100
    });

    it('should handle zero invitations', async () => {
      (prisma.campaignHcp.count as Mock)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(0);
      (prisma.optOut.count as Mock).mockResolvedValue(0);
      (prisma.surveyResponse.groupBy as Mock).mockResolvedValue([]);

      const result = await distributionService.getStats('campaign-1');

      expect(result.completionRate).toBe(0);
    });
  });

  describe('listHcps', () => {
    it('should return paginated HCPs', async () => {
      const mockHcps = [
        { hcpId: 'hcp-1', hcp: { id: 'hcp-1', firstName: 'John', lastName: 'Doe' } },
      ];

      (prisma.campaignHcp.count as Mock).mockResolvedValue(1);
      (prisma.campaignHcp.findMany as Mock).mockResolvedValue(mockHcps);
      (prisma.surveyResponse.findMany as Mock).mockResolvedValue([]);

      const result = await distributionService.listHcps('campaign-1', { page: 1, limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        pages: 1,
      });
    });

    it('should filter by not_invited status', async () => {
      (prisma.campaignHcp.count as Mock).mockResolvedValue(0);
      (prisma.campaignHcp.findMany as Mock).mockResolvedValue([]);
      (prisma.surveyResponse.findMany as Mock).mockResolvedValue([]);

      await distributionService.listHcps('campaign-1', { page: 1, limit: 10, status: 'not_invited' });

      expect(prisma.campaignHcp.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ emailSentAt: null }),
        })
      );
    });

    it('should filter by invited status', async () => {
      (prisma.campaignHcp.count as Mock).mockResolvedValue(0);
      (prisma.campaignHcp.findMany as Mock).mockResolvedValue([]);
      (prisma.surveyResponse.findMany as Mock).mockResolvedValue([]);

      await distributionService.listHcps('campaign-1', { page: 1, limit: 10, status: 'invited' });

      expect(prisma.campaignHcp.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ emailSentAt: { not: null } }),
        })
      );
    });
  });

  describe('importHcpsFromFile', () => {
    it('should throw error for unsupported file format', async () => {
      const buffer = Buffer.from('test');

      await expect(
        distributionService.importHcpsFromFile('campaign-1', buffer, 'test.pdf', 'user-1')
      ).rejects.toThrow('Unsupported file format');
    });
  });
});
