import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted for variables needed in vi.mock factories
const mockSend = vi.hoisted(() => vi.fn());

// Mock SES client with proper class syntax
vi.mock('@aws-sdk/client-ses', () => ({
  SESClient: class MockSESClient {
    send = mockSend;
  },
  SendEmailCommand: class MockSendEmailCommand {
    constructor(public params: any) {}
  },
}));

// Mock prisma with inline mock object
vi.mock('../../lib/prisma', () => ({
  prisma: {
    campaign: {
      findUnique: vi.fn(),
    },
    campaignHcp: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    surveyResponse: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    optOut: {
      findFirst: vi.fn(),
    },
  },
}));

// Mock logger
vi.mock('../../lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { EmailService } from '../email.service';
import { prisma } from '../../lib/prisma';

// Helper functions
function createMockCampaign(overrides = {}) {
  return {
    id: 'campaign-1',
    name: 'Test Campaign',
    clientId: 'client-1',
    diseaseAreaId: 'disease-area-1',
    status: 'ACTIVE',
    honorariumAmount: 100,
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

describe('EmailService', () => {
  let service: EmailService;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EmailService();
    process.env = { ...originalEnv, EMAIL_MOCK_MODE: 'false' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('sendEmail', () => {
    it('should send email successfully via SES', async () => {
      mockSend.mockResolvedValue({ MessageId: 'msg-123' });

      const result = await service.sendEmail({
        to: 'test@example.com',
        subject: 'Test Subject',
        htmlBody: '<p>Test</p>',
        textBody: 'Test',
      });

      expect(result).toEqual({ messageId: 'msg-123' });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should return mock message ID in mock mode', async () => {
      // MOCK_MODE is evaluated at module load time, so we need to reset modules
      // and reimport with the new env value
      vi.resetModules();
      process.env.EMAIL_MOCK_MODE = 'true';

      // Re-mock dependencies after reset
      vi.doMock('@aws-sdk/client-ses', () => ({
        SESClient: class MockSESClient {
          send = mockSend;
        },
        SendEmailCommand: class MockSendEmailCommand {
          constructor(public params: any) {}
        },
      }));
      vi.doMock('../../lib/prisma', () => ({
        prisma: {
          campaign: { findUnique: vi.fn() },
          campaignHcp: { findMany: vi.fn(), update: vi.fn() },
          surveyResponse: { findFirst: vi.fn(), findMany: vi.fn() },
          optOut: { findFirst: vi.fn() },
        },
      }));
      vi.doMock('../../lib/logger', () => ({
        logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
      }));

      const { EmailService: MockModeEmailService } = await import('../email.service');
      const mockModeService = new MockModeEmailService();

      const result = await mockModeService.sendEmail({
        to: 'test@example.com',
        subject: 'Test Subject',
        htmlBody: '<p>Test</p>',
        textBody: 'Test',
      });

      expect(result.messageId).toMatch(/^mock-\d+$/);
      expect(mockSend).not.toHaveBeenCalled();

      // Reset for other tests
      process.env.EMAIL_MOCK_MODE = 'false';
    });

    it('should throw error when SES fails', async () => {
      mockSend.mockRejectedValue(new Error('SES Error'));

      await expect(
        service.sendEmail({
          to: 'test@example.com',
          subject: 'Test',
          htmlBody: '<p>Test</p>',
          textBody: 'Test',
        })
      ).rejects.toThrow('SES Error');
    });
  });

  describe('sendSurveyInvitation', () => {
    const invitationParams = {
      campaignId: 'campaign-1',
      hcpId: 'hcp-1',
      email: 'doctor@hospital.com',
      firstName: 'John',
      lastName: 'Smith',
      surveyToken: 'token-123',
      campaignName: 'Cardiology KOL Survey',
      honorariumAmount: 150,
    };

    it('should throw error when recipient has opted out', async () => {
      vi.mocked(prisma.optOut.findFirst).mockResolvedValue({
        id: 'optout-1',
        email: 'doctor@hospital.com',
        scope: 'GLOBAL',
      } as any);

      await expect(service.sendSurveyInvitation(invitationParams)).rejects.toThrow(
        'Recipient has opted out'
      );
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should send invitation email when not opted out', async () => {
      vi.mocked(prisma.optOut.findFirst).mockResolvedValue(null);
      mockSend.mockResolvedValue({ MessageId: 'msg-123' });
      vi.mocked(prisma.campaignHcp.update).mockResolvedValue({} as any);

      const result = await service.sendSurveyInvitation(invitationParams);

      expect(result).toEqual({ messageId: 'msg-123' });
      expect(prisma.campaignHcp.update).toHaveBeenCalledWith({
        where: {
          campaignId_hcpId: { campaignId: 'campaign-1', hcpId: 'hcp-1' },
        },
        data: { emailSentAt: expect.any(Date) },
      });
    });

    it('should include honorarium text when amount is provided', async () => {
      vi.mocked(prisma.optOut.findFirst).mockResolvedValue(null);
      mockSend.mockResolvedValue({ MessageId: 'msg-123' });
      vi.mocked(prisma.campaignHcp.update).mockResolvedValue({} as any);

      await service.sendSurveyInvitation(invitationParams);

      const emailCommand = mockSend.mock.calls[0][0];
      expect(emailCommand.params.Message.Body.Html.Data).toContain('$150');
    });

    it('should not include honorarium text when amount is null', async () => {
      vi.mocked(prisma.optOut.findFirst).mockResolvedValue(null);
      mockSend.mockResolvedValue({ MessageId: 'msg-123' });
      vi.mocked(prisma.campaignHcp.update).mockResolvedValue({} as any);

      await service.sendSurveyInvitation({ ...invitationParams, honorariumAmount: null });

      const emailCommand = mockSend.mock.calls[0][0];
      expect(emailCommand.params.Message.Body.Html.Data).not.toContain('honorarium');
    });

    it('should include correct survey URL', async () => {
      vi.mocked(prisma.optOut.findFirst).mockResolvedValue(null);
      mockSend.mockResolvedValue({ MessageId: 'msg-123' });
      vi.mocked(prisma.campaignHcp.update).mockResolvedValue({} as any);

      await service.sendSurveyInvitation(invitationParams);

      const emailCommand = mockSend.mock.calls[0][0];
      expect(emailCommand.params.Message.Body.Html.Data).toContain('/survey/token-123');
    });
  });

  describe('sendReminderEmail', () => {
    const reminderParams = {
      campaignId: 'campaign-1',
      hcpId: 'hcp-1',
      email: 'doctor@hospital.com',
      firstName: 'John',
      lastName: 'Smith',
      surveyToken: 'token-123',
      campaignName: 'Cardiology KOL Survey',
      honorariumAmount: 150,
      reminderNumber: 1,
    };

    it('should throw error when recipient has opted out', async () => {
      vi.mocked(prisma.optOut.findFirst).mockResolvedValue({
        id: 'optout-1',
        scope: 'CAMPAIGN',
      } as any);

      await expect(service.sendReminderEmail(reminderParams)).rejects.toThrow(
        'Recipient has opted out'
      );
    });

    it('should throw error when survey already completed', async () => {
      vi.mocked(prisma.optOut.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.surveyResponse.findFirst).mockResolvedValue({
        id: 'response-1',
        status: 'COMPLETED',
      } as any);

      await expect(service.sendReminderEmail(reminderParams)).rejects.toThrow(
        'Survey already completed'
      );
    });

    it('should send reminder and increment reminder count', async () => {
      vi.mocked(prisma.optOut.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.surveyResponse.findFirst).mockResolvedValue(null);
      mockSend.mockResolvedValue({ MessageId: 'msg-456' });
      vi.mocked(prisma.campaignHcp.update).mockResolvedValue({} as any);

      const result = await service.sendReminderEmail(reminderParams);

      expect(result).toEqual({ messageId: 'msg-456' });
      expect(prisma.campaignHcp.update).toHaveBeenCalledWith({
        where: {
          campaignId_hcpId: { campaignId: 'campaign-1', hcpId: 'hcp-1' },
        },
        data: {
          reminderCount: { increment: 1 },
          lastReminderAt: expect.any(Date),
        },
      });
    });

    it('should include urgency text for reminder >= 2', async () => {
      vi.mocked(prisma.optOut.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.surveyResponse.findFirst).mockResolvedValue(null);
      mockSend.mockResolvedValue({ MessageId: 'msg-456' });
      vi.mocked(prisma.campaignHcp.update).mockResolvedValue({} as any);

      await service.sendReminderEmail({ ...reminderParams, reminderNumber: 2 });

      const emailCommand = mockSend.mock.calls[0][0];
      expect(emailCommand.params.Message.Body.Html.Data).toContain('closing soon');
    });
  });

  describe('sendBulkInvitations', () => {
    it('should throw error when campaign not found', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(null);

      await expect(service.sendBulkInvitations('campaign-1')).rejects.toThrow(
        'Campaign not found'
      );
    });

    it('should throw error when campaign is not active', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(
        createMockCampaign({ status: 'DRAFT' }) as any
      );

      await expect(service.sendBulkInvitations('campaign-1')).rejects.toThrow(
        'Can only send invitations for active campaigns'
      );
    });

    it('should send invitations to uninvited HCPs', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(
        createMockCampaign({ status: 'ACTIVE', honorariumAmount: 100 }) as any
      );

      vi.mocked(prisma.campaignHcp.findMany).mockResolvedValue([
        {
          surveyToken: 'token-1',
          hcp: createMockHcp({ id: 'hcp-1', email: 'doc1@hospital.com' }),
        },
        {
          surveyToken: 'token-2',
          hcp: createMockHcp({ id: 'hcp-2', email: 'doc2@hospital.com' }),
        },
      ] as any);

      vi.mocked(prisma.optOut.findFirst).mockResolvedValue(null);
      mockSend.mockResolvedValue({ MessageId: 'msg-123' });
      vi.mocked(prisma.campaignHcp.update).mockResolvedValue({} as any);

      const result = await service.sendBulkInvitations('campaign-1');

      expect(result.sent).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it('should skip HCPs without email', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(
        createMockCampaign({ status: 'ACTIVE' }) as any
      );

      vi.mocked(prisma.campaignHcp.findMany).mockResolvedValue([
        {
          surveyToken: 'token-1',
          hcp: createMockHcp({ id: 'hcp-1', email: null }),
        },
      ] as any);

      const result = await service.sendBulkInvitations('campaign-1');

      expect(result.sent).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors[0].error).toContain('has no email');
    });

    it('should handle individual send failures gracefully', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(
        createMockCampaign({ status: 'ACTIVE' }) as any
      );

      vi.mocked(prisma.campaignHcp.findMany).mockResolvedValue([
        {
          surveyToken: 'token-1',
          hcp: createMockHcp({ id: 'hcp-1', email: 'doc1@hospital.com' }),
        },
        {
          surveyToken: 'token-2',
          hcp: createMockHcp({ id: 'hcp-2', email: 'doc2@hospital.com' }),
        },
      ] as any);

      vi.mocked(prisma.optOut.findFirst).mockResolvedValue(null);
      mockSend
        .mockResolvedValueOnce({ MessageId: 'msg-123' })
        .mockRejectedValueOnce(new Error('SES Error'));
      vi.mocked(prisma.campaignHcp.update).mockResolvedValue({} as any);

      const result = await service.sendBulkInvitations('campaign-1');

      expect(result.sent).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors[0].error).toBe('SES Error');
    });
  });

  describe('sendBulkReminders', () => {
    it('should throw error when campaign not found', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(null);

      await expect(service.sendBulkReminders('campaign-1')).rejects.toThrow(
        'Campaign not found'
      );
    });

    it('should throw error when campaign is not active', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(
        createMockCampaign({ status: 'CLOSED' }) as any
      );

      await expect(service.sendBulkReminders('campaign-1')).rejects.toThrow(
        'Can only send reminders for active campaigns'
      );
    });

    it('should skip HCPs who have completed the survey', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(
        createMockCampaign({ status: 'ACTIVE' }) as any
      );

      vi.mocked(prisma.campaignHcp.findMany).mockResolvedValue([
        {
          surveyToken: 'token-1',
          reminderCount: 0,
          hcp: createMockHcp({ id: 'hcp-1', email: 'doc1@hospital.com' }),
        },
      ] as any);

      vi.mocked(prisma.surveyResponse.findMany).mockResolvedValue([
        { respondentHcpId: 'hcp-1' },
      ] as any);

      const result = await service.sendBulkReminders('campaign-1');

      expect(result.sent).toBe(0);
      expect(result.skipped).toBe(1);
    });

    it('should respect maxReminders limit', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(
        createMockCampaign({ status: 'ACTIVE' }) as any
      );

      vi.mocked(prisma.campaignHcp.findMany).mockResolvedValue([]);
      vi.mocked(prisma.surveyResponse.findMany).mockResolvedValue([]);

      const result = await service.sendBulkReminders('campaign-1', 2);

      expect(result.sent).toBe(0);
    });

    it('should send reminders to eligible HCPs', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(
        createMockCampaign({ status: 'ACTIVE', honorariumAmount: 100 }) as any
      );

      vi.mocked(prisma.campaignHcp.findMany).mockResolvedValue([
        {
          surveyToken: 'token-1',
          reminderCount: 1,
          hcp: createMockHcp({ id: 'hcp-1', email: 'doc1@hospital.com' }),
        },
      ] as any);

      vi.mocked(prisma.surveyResponse.findMany).mockResolvedValue([]);
      vi.mocked(prisma.optOut.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.surveyResponse.findFirst).mockResolvedValue(null);
      mockSend.mockResolvedValue({ MessageId: 'msg-123' });
      vi.mocked(prisma.campaignHcp.update).mockResolvedValue({} as any);

      const result = await service.sendBulkReminders('campaign-1');

      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);
    });
  });
});
