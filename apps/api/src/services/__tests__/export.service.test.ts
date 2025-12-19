import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';

// Mock prisma with inline mock object
vi.mock('../../lib/prisma', () => ({
  prisma: {
    campaign: {
      findUnique: vi.fn(),
    },
    surveyQuestion: {
      findMany: vi.fn(),
    },
    surveyResponse: {
      findMany: vi.fn(),
    },
    hcpCampaignScore: {
      findMany: vi.fn(),
    },
    hcpDiseaseAreaScore: {
      findMany: vi.fn(),
    },
    payment: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      aggregate: vi.fn(),
    },
    paymentExportBatch: {
      create: vi.fn(),
      update: vi.fn(),
    },
    paymentImportBatch: {
      create: vi.fn(),
      update: vi.fn(),
    },
    paymentStatusHistory: {
      create: vi.fn(),
    },
  },
}));

import { ExportService } from '../export.service';
import { prisma } from '../../lib/prisma';

// Helper functions
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

function createMockHcp(overrides = {}) {
  return {
    id: 'hcp-1',
    firstName: 'John',
    lastName: 'Smith',
    email: 'doctor@hospital.com',
    npi: '1234567890',
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
    ...overrides,
  };
}

function createMockPayment(overrides = {}) {
  return {
    id: 'payment-1',
    campaignId: 'campaign-1',
    hcpId: 'hcp-1',
    amount: 100,
    status: 'PENDING_EXPORT',
    ...overrides,
  };
}

describe('ExportService', () => {
  let service: ExportService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ExportService();
  });

  describe('exportResponses', () => {
    it('should throw error when campaign not found', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(null);

      await expect(service.exportResponses('campaign-1')).rejects.toThrow(
        'Campaign not found'
      );
    });

    it('should export responses to Excel with correct structure', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(
        createMockCampaign({ name: 'Test Survey 2024' }) as any
      );

      vi.mocked(prisma.surveyQuestion.findMany).mockResolvedValue([
        { id: 'q1', questionTextSnapshot: 'What is your specialty?', sectionName: 'General' },
        { id: 'q2', questionTextSnapshot: 'Rate the treatment', sectionName: 'Rating' },
      ] as any);

      const mockHcp = createMockHcp({
        npi: '1234567890',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@hospital.com',
      });

      vi.mocked(prisma.surveyResponse.findMany).mockResolvedValue([
        {
          id: 'response-1',
          completedAt: new Date('2024-06-15'),
          respondentHcp: mockHcp,
          answers: [
            { questionId: 'q1', answerText: 'Cardiology', answerJson: null },
            { questionId: 'q2', answerText: '5', answerJson: null },
          ],
        },
      ] as any);

      const result = await service.exportResponses('campaign-1');

      expect(result.filename).toMatch(/^Test_Survey_2024_Responses_\d{4}-\d{2}-\d{2}\.xlsx$/);
      expect(result.recordCount).toBe(1);
      expect(result.buffer).toBeInstanceOf(Buffer);

      // Verify Excel content
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);
      const worksheet = workbook.getWorksheet('Survey Responses');

      expect(worksheet).toBeDefined();
      expect(worksheet!.getRow(1).values).toContain('NPI');
      expect(worksheet!.getRow(1).values).toContain('What is your specialty?');
    });

    it('should handle empty responses', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(createMockCampaign() as any);
      vi.mocked(prisma.surveyQuestion.findMany).mockResolvedValue([]);
      vi.mocked(prisma.surveyResponse.findMany).mockResolvedValue([]);

      const result = await service.exportResponses('campaign-1');

      expect(result.recordCount).toBe(0);
    });

    it('should sanitize campaign name in filename', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(
        createMockCampaign({ name: 'Test/Survey:2024' }) as any
      );
      vi.mocked(prisma.surveyQuestion.findMany).mockResolvedValue([]);
      vi.mocked(prisma.surveyResponse.findMany).mockResolvedValue([]);

      const result = await service.exportResponses('campaign-1');

      expect(result.filename).not.toContain('/');
      expect(result.filename).not.toContain(':');
      expect(result.filename).toContain('Test_Survey_2024');
    });
  });

  describe('exportScores', () => {
    it('should throw error when campaign not found', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(null);

      await expect(service.exportScores('campaign-1')).rejects.toThrow(
        'Campaign not found'
      );
    });

    it('should export scores with objective and survey scores', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue({
        ...createMockCampaign(),
        diseaseArea: { id: 'da-1', name: 'Cardiology' },
        compositeScoreConfig: {},
      } as any);

      const mockHcp = createMockHcp();
      vi.mocked(prisma.hcpCampaignScore.findMany).mockResolvedValue([
        {
          ...createMockHcpCampaignScore({
            hcpId: 'hcp-1',
            scoreSurvey: 85,
            nominationCount: 15,
            compositeScore: 78.5,
          }),
          hcp: mockHcp,
        },
      ] as any);

      vi.mocked(prisma.hcpDiseaseAreaScore.findMany).mockResolvedValue([
        createMockDiseaseAreaScore({ hcpId: 'hcp-1' }),
      ] as any);

      const result = await service.exportScores('campaign-1');

      expect(result.recordCount).toBe(1);
      expect(result.filename).toContain('Scores');

      // Verify Excel content
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);
      const worksheet = workbook.getWorksheet('HCP Scores');

      expect(worksheet).toBeDefined();
      const headers = worksheet!.getRow(1).values as string[];
      expect(headers).toContain('Rank');
      expect(headers).toContain('Publications Score');
      expect(headers).toContain('Survey Score');
      expect(headers).toContain('Composite Score');
    });

    it('should handle missing disease area scores', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue({
        ...createMockCampaign(),
        diseaseArea: { id: 'da-1', name: 'Cardiology' },
        compositeScoreConfig: {},
      } as any);

      vi.mocked(prisma.hcpCampaignScore.findMany).mockResolvedValue([
        {
          ...createMockHcpCampaignScore(),
          hcp: createMockHcp(),
        },
      ] as any);

      // No disease area scores
      vi.mocked(prisma.hcpDiseaseAreaScore.findMany).mockResolvedValue([]);

      const result = await service.exportScores('campaign-1');

      expect(result.recordCount).toBe(1);
    });
  });

  describe('exportPayments', () => {
    it('should throw error when campaign not found', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(null);

      await expect(service.exportPayments('campaign-1', 'user-1')).rejects.toThrow(
        'Campaign not found'
      );
    });

    it('should throw error when no pending payments', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(createMockCampaign() as any);
      vi.mocked(prisma.payment.findMany).mockResolvedValue([]);

      await expect(service.exportPayments('campaign-1', 'user-1')).rejects.toThrow(
        'No pending payments to export'
      );
    });

    it('should export payments and update statuses', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(createMockCampaign() as any);

      vi.mocked(prisma.payment.findMany).mockResolvedValue([
        {
          ...createMockPayment({ id: 'payment-1', amount: 100 }),
          hcp: createMockHcp(),
          response: { completedAt: new Date('2024-06-15') },
        },
        {
          ...createMockPayment({ id: 'payment-2', amount: 150 }),
          hcp: createMockHcp({ npi: '9876543210' }),
          response: { completedAt: new Date('2024-06-16') },
        },
      ] as any);

      vi.mocked(prisma.paymentExportBatch.create).mockResolvedValue({ id: 'batch-1' } as any);
      vi.mocked(prisma.payment.updateMany).mockResolvedValue({ count: 2 });
      vi.mocked(prisma.paymentStatusHistory.create).mockResolvedValue({} as any);
      vi.mocked(prisma.paymentExportBatch.update).mockResolvedValue({} as any);

      const result = await service.exportPayments('campaign-1', 'user-1');

      expect(result.recordCount).toBe(2);
      expect(result.filename).toContain('Payments');

      // Verify payments were marked as exported
      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['payment-1', 'payment-2'] } },
        data: {
          status: 'EXPORTED',
          exportedAt: expect.any(Date),
          exportBatchId: 'batch-1',
        },
      });

      // Verify status history was created
      expect(prisma.paymentStatusHistory.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('importPaymentStatus', () => {
    const createExcelBuffer = async (rows: Array<Record<string, string>>) => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sheet1');

      if (rows.length > 0) {
        const headers = Object.keys(rows[0]);
        worksheet.addRow(headers);
        rows.forEach((row) => worksheet.addRow(Object.values(row)));
      }

      return Buffer.from(await workbook.xlsx.writeBuffer());
    };

    it('should throw error when no status column found', async () => {
      const buffer = await createExcelBuffer([
        { 'Payment ID': 'payment-1', NPI: '1234567890' },
      ]);

      await expect(
        service.importPaymentStatus('campaign-1', buffer, 'user-1')
      ).rejects.toThrow('Status column not found');
    });

    it('should import payment status updates', async () => {
      const buffer = await createExcelBuffer([
        { 'Payment ID': 'payment-1', Status: 'claimed' },
        { NPI: '1234567890', Status: 'sent' },
      ]);

      vi.mocked(prisma.paymentImportBatch.create).mockResolvedValue({ id: 'import-1' } as any);
      vi.mocked(prisma.payment.findFirst)
        .mockResolvedValueOnce({ id: 'payment-1', status: 'EXPORTED' } as any)
        .mockResolvedValueOnce({ id: 'payment-2', status: 'EXPORTED' } as any);
      vi.mocked(prisma.payment.update).mockResolvedValue({} as any);
      vi.mocked(prisma.paymentStatusHistory.create).mockResolvedValue({} as any);
      vi.mocked(prisma.paymentImportBatch.update).mockResolvedValue({} as any);

      const result = await service.importPaymentStatus('campaign-1', buffer, 'user-1');

      expect(result.processed).toBe(2);
      expect(result.updated).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle unknown status values', async () => {
      const buffer = await createExcelBuffer([
        { 'Payment ID': 'payment-1', Status: 'unknown_status' },
      ]);

      vi.mocked(prisma.paymentImportBatch.create).mockResolvedValue({ id: 'import-1' } as any);
      vi.mocked(prisma.paymentImportBatch.update).mockResolvedValue({} as any);

      const result = await service.importPaymentStatus('campaign-1', buffer, 'user-1');

      expect(result.processed).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.errors[0].error).toContain('Unknown status');
    });

    it('should handle missing payment', async () => {
      const buffer = await createExcelBuffer([
        { 'Payment ID': 'nonexistent-payment', Status: 'claimed' },
      ]);

      vi.mocked(prisma.paymentImportBatch.create).mockResolvedValue({ id: 'import-1' } as any);
      vi.mocked(prisma.payment.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.paymentImportBatch.update).mockResolvedValue({} as any);

      const result = await service.importPaymentStatus('campaign-1', buffer, 'user-1');

      expect(result.updated).toBe(0);
      expect(result.errors[0].error).toContain('Payment not found');
    });

    it('should map various status values correctly', async () => {
      const buffer = await createExcelBuffer([
        { 'Payment ID': 'p1', Status: 'sent' },
        { 'Payment ID': 'p2', Status: 'delivered' },
        { 'Payment ID': 'p3', Status: 'opened' },
        { 'Payment ID': 'p4', Status: 'claimed' },
        { 'Payment ID': 'p5', Status: 'bounced' },
        { 'Payment ID': 'p6', Status: 'rejected' },
        { 'Payment ID': 'p7', Status: 'expired' },
      ]);

      vi.mocked(prisma.paymentImportBatch.create).mockResolvedValue({ id: 'import-1' } as any);
      vi.mocked(prisma.payment.findFirst).mockResolvedValue({ id: 'p1', status: 'EXPORTED' } as any);
      vi.mocked(prisma.payment.update).mockResolvedValue({} as any);
      vi.mocked(prisma.paymentStatusHistory.create).mockResolvedValue({} as any);
      vi.mocked(prisma.paymentImportBatch.update).mockResolvedValue({} as any);

      const result = await service.importPaymentStatus('campaign-1', buffer, 'user-1');

      expect(result.updated).toBe(7);
    });
  });

  describe('listPayments', () => {
    it('should return paginated payments list', async () => {
      vi.mocked(prisma.payment.count).mockResolvedValue(25);
      vi.mocked(prisma.payment.findMany).mockResolvedValue([
        {
          ...createMockPayment(),
          hcp: createMockHcp(),
          response: { completedAt: new Date() },
          statusHistory: [],
        },
      ] as any);

      const result = await service.listPayments('campaign-1', {
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

    it('should filter by status', async () => {
      vi.mocked(prisma.payment.count).mockResolvedValue(5);
      vi.mocked(prisma.payment.findMany).mockResolvedValue([]);

      await service.listPayments('campaign-1', {
        status: 'CLAIMED',
        page: 1,
        limit: 10,
      });

      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { campaignId: 'campaign-1', status: 'CLAIMED' },
        })
      );
    });
  });

  describe('getPaymentStats', () => {
    it('should return payment statistics by status', async () => {
      vi.mocked(prisma.payment.groupBy).mockResolvedValue([
        { status: 'PENDING_EXPORT', _count: 10, _sum: { amount: 1000 } },
        { status: 'CLAIMED', _count: 5, _sum: { amount: 500 } },
      ] as any);

      vi.mocked(prisma.payment.aggregate).mockResolvedValue({
        _count: 15,
        _sum: { amount: 1500 },
      } as any);

      const result = await service.getPaymentStats('campaign-1');

      expect(result.byStatus).toEqual({
        PENDING_EXPORT: { count: 10, amount: 1000 },
        CLAIMED: { count: 5, amount: 500 },
      });
      expect(result.total).toEqual({ count: 15, amount: 1500 });
    });
  });
});
