import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { ResponseService } from '../response.service';

// Mock prisma
vi.mock('../../lib/prisma', () => ({
  prisma: {
    surveyResponse: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn(),
    },
    surveyResponseAnswer: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from '../../lib/prisma';

describe('ResponseService', () => {
  let responseService: ResponseService;

  beforeEach(() => {
    responseService = new ResponseService();
    vi.clearAllMocks();
  });

  describe('listForCampaign', () => {
    it('should return paginated responses', async () => {
      const mockResponses = [
        {
          id: 'response-1',
          campaignId: 'campaign-1',
          status: 'COMPLETED',
          respondentHcp: { id: 'hcp-1', npi: '1234567890', firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
          _count: { nominations: 3 },
        },
      ];

      (prisma.surveyResponse.count as Mock).mockResolvedValue(1);
      (prisma.surveyResponse.findMany as Mock).mockResolvedValue(mockResponses);

      const result = await responseService.listForCampaign('campaign-1', { page: 1, limit: 10 });

      expect(result.items).toEqual(mockResponses);
      expect(result.pagination).toEqual({ page: 1, limit: 10, total: 1, pages: 1 });
    });

    it('should filter by status', async () => {
      (prisma.surveyResponse.count as Mock).mockResolvedValue(0);
      (prisma.surveyResponse.findMany as Mock).mockResolvedValue([]);

      await responseService.listForCampaign('campaign-1', { page: 1, limit: 10, status: 'COMPLETED' });

      expect(prisma.surveyResponse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { campaignId: 'campaign-1', status: 'COMPLETED' },
        })
      );
    });

    it('should handle pagination correctly', async () => {
      (prisma.surveyResponse.count as Mock).mockResolvedValue(25);
      (prisma.surveyResponse.findMany as Mock).mockResolvedValue([]);

      const result = await responseService.listForCampaign('campaign-1', { page: 3, limit: 10 });

      expect(prisma.surveyResponse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        })
      );
      expect(result.pagination.pages).toBe(3);
    });
  });

  describe('getResponseDetail', () => {
    it('should return response with all related data', async () => {
      const mockResponse = {
        id: 'response-1',
        campaignId: 'campaign-1',
        status: 'COMPLETED',
        respondentHcp: { id: 'hcp-1', firstName: 'John', lastName: 'Doe' },
        campaign: { id: 'campaign-1', name: 'Test Campaign', status: 'ACTIVE' },
        answers: [],
        nominations: [],
        payment: null,
      };

      (prisma.surveyResponse.findUnique as Mock).mockResolvedValue(mockResponse);

      const result = await responseService.getResponseDetail('response-1');

      expect(result).toEqual(mockResponse);
      expect(prisma.surveyResponse.findUnique).toHaveBeenCalledWith({
        where: { id: 'response-1' },
        include: expect.objectContaining({
          respondentHcp: true,
          campaign: expect.any(Object),
          answers: expect.any(Object),
          nominations: expect.any(Object),
          payment: true,
        }),
      });
    });

    it('should return null for non-existent response', async () => {
      (prisma.surveyResponse.findUnique as Mock).mockResolvedValue(null);

      const result = await responseService.getResponseDetail('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateAnswer', () => {
    it('should update existing answer', async () => {
      const mockResponse = {
        id: 'response-1',
        campaign: { id: 'campaign-1' },
      };
      const mockExistingAnswer = {
        id: 'answer-1',
        responseId: 'response-1',
        questionId: 'question-1',
        answerText: 'Old answer',
      };
      const mockUpdatedAnswer = {
        id: 'answer-1',
        responseId: 'response-1',
        questionId: 'question-1',
        answerText: 'New answer',
      };

      (prisma.surveyResponse.findUnique as Mock).mockResolvedValue(mockResponse);
      (prisma.surveyResponseAnswer.findFirst as Mock).mockResolvedValue(mockExistingAnswer);
      (prisma.surveyResponseAnswer.update as Mock).mockResolvedValue(mockUpdatedAnswer);
      (prisma.auditLog.create as Mock).mockResolvedValue({});

      const result = await responseService.updateAnswer('response-1', 'question-1', 'New answer', 'user-1');

      expect(result).toEqual(mockUpdatedAnswer);
      expect(prisma.surveyResponseAnswer.update).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'RESPONSE_ANSWER_EDITED',
          entityType: 'SurveyResponseAnswer',
          userId: 'user-1',
        }),
      });
    });

    it('should create new answer if not exists', async () => {
      const mockResponse = { id: 'response-1', campaign: { id: 'campaign-1' } };
      const mockNewAnswer = {
        id: 'answer-1',
        responseId: 'response-1',
        questionId: 'question-1',
        answerText: 'New answer',
      };

      (prisma.surveyResponse.findUnique as Mock).mockResolvedValue(mockResponse);
      (prisma.surveyResponseAnswer.findFirst as Mock).mockResolvedValue(null);
      (prisma.surveyResponseAnswer.create as Mock).mockResolvedValue(mockNewAnswer);
      (prisma.auditLog.create as Mock).mockResolvedValue({});

      const result = await responseService.updateAnswer('response-1', 'question-1', 'New answer', 'user-1');

      expect(result).toEqual(mockNewAnswer);
      expect(prisma.surveyResponseAnswer.create).toHaveBeenCalled();
    });

    it('should throw error if response not found', async () => {
      (prisma.surveyResponse.findUnique as Mock).mockResolvedValue(null);

      await expect(
        responseService.updateAnswer('non-existent', 'question-1', 'answer', 'user-1')
      ).rejects.toThrow('Response not found');
    });

    it('should handle JSON values', async () => {
      const mockResponse = { id: 'response-1', campaign: { id: 'campaign-1' } };
      const jsonValue = { option: 'selected', rating: 5 };

      (prisma.surveyResponse.findUnique as Mock).mockResolvedValue(mockResponse);
      (prisma.surveyResponseAnswer.findFirst as Mock).mockResolvedValue(null);
      (prisma.surveyResponseAnswer.create as Mock).mockResolvedValue({
        id: 'answer-1',
        answerJson: jsonValue,
      });
      (prisma.auditLog.create as Mock).mockResolvedValue({});

      await responseService.updateAnswer('response-1', 'question-1', jsonValue, 'user-1');

      expect(prisma.surveyResponseAnswer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          answerText: null,
          answerJson: jsonValue,
        }),
      });
    });
  });

  describe('excludeResponse', () => {
    it('should exclude a response', async () => {
      const mockResponse = { id: 'response-1', status: 'COMPLETED' };
      const mockExcludedResponse = { id: 'response-1', status: 'EXCLUDED' };

      (prisma.surveyResponse.findUnique as Mock).mockResolvedValue(mockResponse);
      (prisma.surveyResponse.update as Mock).mockResolvedValue(mockExcludedResponse);
      (prisma.auditLog.create as Mock).mockResolvedValue({});

      const result = await responseService.excludeResponse('response-1', 'Invalid data', 'admin-user');

      expect(result.status).toBe('EXCLUDED');
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'RESPONSE_EXCLUDED',
          metadata: expect.objectContaining({ reason: 'Invalid data' }),
        }),
      });
    });

    it('should throw error if response not found', async () => {
      (prisma.surveyResponse.findUnique as Mock).mockResolvedValue(null);

      await expect(
        responseService.excludeResponse('non-existent', 'reason', 'admin')
      ).rejects.toThrow('Response not found');
    });

    it('should throw error if already excluded', async () => {
      (prisma.surveyResponse.findUnique as Mock).mockResolvedValue({ id: 'response-1', status: 'EXCLUDED' });

      await expect(
        responseService.excludeResponse('response-1', 'reason', 'admin')
      ).rejects.toThrow('Response is already excluded');
    });
  });

  describe('includeResponse', () => {
    it('should re-include an excluded response', async () => {
      const mockResponse = { id: 'response-1', status: 'EXCLUDED' };
      const mockIncludedResponse = { id: 'response-1', status: 'COMPLETED' };

      (prisma.surveyResponse.findUnique as Mock).mockResolvedValue(mockResponse);
      (prisma.surveyResponse.update as Mock).mockResolvedValue(mockIncludedResponse);
      (prisma.auditLog.create as Mock).mockResolvedValue({});

      const result = await responseService.includeResponse('response-1', 'admin-user');

      expect(result.status).toBe('COMPLETED');
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'RESPONSE_INCLUDED',
        }),
      });
    });

    it('should throw error if response not found', async () => {
      (prisma.surveyResponse.findUnique as Mock).mockResolvedValue(null);

      await expect(
        responseService.includeResponse('non-existent', 'admin')
      ).rejects.toThrow('Response not found');
    });

    it('should throw error if not excluded', async () => {
      (prisma.surveyResponse.findUnique as Mock).mockResolvedValue({ id: 'response-1', status: 'COMPLETED' });

      await expect(
        responseService.includeResponse('response-1', 'admin')
      ).rejects.toThrow('Response is not excluded');
    });
  });

  describe('getResponseStats', () => {
    it('should return grouped stats by status', async () => {
      const mockStats = [
        { status: 'COMPLETED', _count: 10 },
        { status: 'IN_PROGRESS', _count: 5 },
        { status: 'EXCLUDED', _count: 2 },
      ];

      (prisma.surveyResponse.groupBy as Mock).mockResolvedValue(mockStats);

      const result = await responseService.getResponseStats('campaign-1');

      expect(result).toEqual({
        COMPLETED: 10,
        IN_PROGRESS: 5,
        EXCLUDED: 2,
      });
    });

    it('should return empty object for no responses', async () => {
      (prisma.surveyResponse.groupBy as Mock).mockResolvedValue([]);

      const result = await responseService.getResponseStats('campaign-1');

      expect(result).toEqual({});
    });
  });
});
