import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma with inline mock object
vi.mock('../../lib/prisma', () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

// Mock logger
vi.mock('../../lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  LogActions: {
    AUTH_LOGIN: 'auth.login',
    AUTH_LOGOUT: 'auth.logout',
    AUTH_LOGIN_FAILED: 'auth.login_failed',
    AUTH_PASSWORD_RESET: 'auth.password_reset',
    USER_CREATED: 'user.created',
    USER_UPDATED: 'user.updated',
    USER_ROLE_CHANGED: 'user.role_changed',
    USER_DISABLED: 'user.disabled',
    HCP_VIEWED: 'hcp.viewed',
    HCP_CREATED: 'hcp.created',
    HCP_UPDATED: 'hcp.updated',
    HCP_EXPORTED: 'hcp.exported',
    SURVEY_SUBMITTED: 'survey.submitted',
    SURVEY_STARTED: 'survey.started',
    SURVEY_REMINDER_SENT: 'survey.reminder_sent',
    NOMINATION_MATCHED: 'nomination.matched',
    NOMINATION_EXCLUDED: 'nomination.excluded',
    NOMINATION_ALIAS_CREATED: 'nomination.alias_created',
    SCORE_PUBLISHED: 'score.published',
    SCORE_RECALCULATED: 'score.recalculated',
    CAMPAIGN_CREATED: 'campaign.created',
    CAMPAIGN_PUBLISHED: 'campaign.published',
    CAMPAIGN_CLOSED: 'campaign.closed',
    PAYMENT_EXPORTED: 'payment.exported',
    PAYMENT_STATUS_IMPORTED: 'payment.status_imported',
    PAYMENT_UPDATED: 'payment.updated',
  },
}));

import { AuditService } from '../audit.service';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuditService();
  });

  describe('log', () => {
    const context = {
      userId: 'user-1',
      tenantId: 'tenant-1',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      traceId: 'trace-123',
    };

    const event = {
      action: 'user.created',
      entityType: 'User',
      entityId: 'user-new',
      oldValues: undefined,
      newValues: { email: 'new@example.com' },
      metadata: { source: 'admin' },
    };

    it('should create audit log entry', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'log-1' } as any);

      await service.log(context, event);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          actorType: 'USER',
          tenantId: 'tenant-1',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          action: 'user.created',
          entityType: 'User',
          entityId: 'user-new',
          oldValues: undefined,
          newValues: { email: 'new@example.com' },
          metadata: {
            source: 'admin',
            traceId: 'trace-123',
          },
        },
      });
    });

    it('should default actorType to USER', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'log-1' } as any);

      await service.log({}, event);

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorType: 'USER',
          }),
        })
      );
    });

    it('should use provided actorType', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'log-1' } as any);

      await service.log({ ...context, actorType: 'SYSTEM' }, event);

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorType: 'SYSTEM',
          }),
        })
      );
    });

    it('should log error but not throw on database failure', async () => {
      vi.mocked(prisma.auditLog.create).mockRejectedValue(new Error('DB Error'));

      await expect(service.log(context, event)).resolves.not.toThrow();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to record audit event',
        expect.any(Object),
        expect.any(Error)
      );
    });

    it('should log debug message on success', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'log-1' } as any);

      await service.log(context, event);

      expect(logger.debug).toHaveBeenCalledWith('Audit event recorded', {
        trace_id: 'trace-123',
        action: 'user.created',
        entity_type: 'User',
        entity_id: 'user-new',
      });
    });
  });

  describe('logAuth', () => {
    const context = { userId: 'user-1', traceId: 'trace-1' };

    it('should log login event', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'log-1' } as any);

      await service.logAuth(context, 'login', 'user-1', { method: 'password' });

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'auth.login',
            entityType: 'User',
            entityId: 'user-1',
            metadata: expect.objectContaining({ method: 'password' }),
          }),
        })
      );
    });

    it('should log logout event', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'log-1' } as any);

      await service.logAuth(context, 'logout', 'user-1');

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'auth.logout',
          }),
        })
      );
    });

    it('should log failed login event', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'log-1' } as any);

      await service.logAuth(context, 'login_failed', 'unknown-user', {
        reason: 'invalid_password',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'auth.login_failed',
          }),
        })
      );
    });

    it('should log password reset event', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'log-1' } as any);

      await service.logAuth(context, 'password_reset', 'user-1');

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'auth.password_reset',
          }),
        })
      );
    });
  });

  describe('logUserChange', () => {
    const context = { userId: 'admin-1', tenantId: 'tenant-1' };

    it('should log user created event', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'log-1' } as any);

      await service.logUserChange(
        context,
        'created',
        'user-new',
        undefined,
        { email: 'new@example.com', role: 'TEAM_MEMBER' }
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'user.created',
            newValues: { email: 'new@example.com', role: 'TEAM_MEMBER' },
          }),
        })
      );
    });

    it('should log role change with old and new values', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'log-1' } as any);

      await service.logUserChange(
        context,
        'role_changed',
        'user-1',
        { role: 'TEAM_MEMBER' },
        { role: 'CLIENT_ADMIN' }
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'user.role_changed',
            oldValues: { role: 'TEAM_MEMBER' },
            newValues: { role: 'CLIENT_ADMIN' },
          }),
        })
      );
    });
  });

  describe('logHcpAccess', () => {
    const context = { userId: 'user-1', tenantId: 'tenant-1' };

    it('should log HCP viewed event', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'log-1' } as any);

      await service.logHcpAccess(context, 'viewed', 'hcp-1', undefined, undefined, {
        viewedFields: ['email', 'specialty'],
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'hcp.viewed',
            entityType: 'Hcp',
            entityId: 'hcp-1',
          }),
        })
      );
    });

    it('should log HCP export event', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'log-1' } as any);

      await service.logHcpAccess(context, 'exported', 'hcp-batch', undefined, undefined, {
        recordCount: 150,
        format: 'xlsx',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'hcp.exported',
          }),
        })
      );
    });
  });

  describe('logSurvey', () => {
    const context = { tenantId: 'tenant-1' };

    it('should log survey submitted event', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'log-1' } as any);

      await service.logSurvey(context, 'submitted', 'response-1', {
        campaignId: 'campaign-1',
        questionCount: 10,
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'survey.submitted',
            entityType: 'SurveyResponse',
            entityId: 'response-1',
          }),
        })
      );
    });
  });

  describe('logNomination', () => {
    const context = { userId: 'user-1' };

    it('should log nomination matched event', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'log-1' } as any);

      await service.logNomination(
        context,
        'matched',
        'nomination-1',
        { matchStatus: 'UNMATCHED' },
        { matchStatus: 'MATCHED', matchedHcpId: 'hcp-1' }
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'nomination.matched',
            entityType: 'Nomination',
          }),
        })
      );
    });
  });

  describe('logCampaign', () => {
    const context = { userId: 'user-1', tenantId: 'tenant-1' };

    it('should log campaign created event', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'log-1' } as any);

      await service.logCampaign(context, 'created', 'campaign-1', undefined, {
        name: 'New Campaign',
        status: 'DRAFT',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'campaign.created',
            entityType: 'Campaign',
          }),
        })
      );
    });

    it('should log campaign published event', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'log-1' } as any);

      await service.logCampaign(
        context,
        'published',
        'campaign-1',
        { status: 'CLOSED' },
        { status: 'PUBLISHED' }
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'campaign.published',
          }),
        })
      );
    });
  });

  describe('logScore', () => {
    const context = { userId: 'user-1' };

    it('should log score published event', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'log-1' } as any);

      await service.logScore(context, 'published', 'score-1', {
        campaignId: 'campaign-1',
        hcpCount: 50,
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'score.published',
            entityType: 'HcpDiseaseAreaScore',
          }),
        })
      );
    });
  });

  describe('logPayment', () => {
    const context = { userId: 'user-1' };

    it('should log payment exported event', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'log-1' } as any);

      await service.logPayment(
        context,
        'exported',
        'payment-batch-1',
        undefined,
        undefined,
        { recordCount: 25, totalAmount: 2500 }
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'payment.exported',
            entityType: 'Payment',
          }),
        })
      );
    });

    it('should log payment status update', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'log-1' } as any);

      await service.logPayment(
        context,
        'updated',
        'payment-1',
        { status: 'EXPORTED' },
        { status: 'CLAIMED' }
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'payment.updated',
          }),
        })
      );
    });
  });

  describe('query', () => {
    it('should return paginated audit logs', async () => {
      vi.mocked(prisma.auditLog.count).mockResolvedValue(100);
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
        {
          id: 'log-1',
          action: 'user.created',
          user: { id: 'user-1', email: 'admin@example.com', firstName: 'Admin', lastName: 'User' },
        },
      ] as any);

      const result = await service.query({
        page: 1,
        limit: 50,
      });

      expect(result.items).toHaveLength(1);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 50,
        total: 100,
        totalPages: 2,
      });
    });

    it('should filter by tenantId', async () => {
      vi.mocked(prisma.auditLog.count).mockResolvedValue(25);
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);

      await service.query({ tenantId: 'tenant-1' });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1' }),
        })
      );
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      vi.mocked(prisma.auditLog.count).mockResolvedValue(50);
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);

      await service.query({ startDate, endDate });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          }),
        })
      );
    });

    it('should filter by entityType and action', async () => {
      vi.mocked(prisma.auditLog.count).mockResolvedValue(10);
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);

      await service.query({
        entityType: 'Campaign',
        action: 'campaign.published',
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityType: 'Campaign',
            action: 'campaign.published',
          }),
        })
      );
    });

    it('should use default pagination values', async () => {
      vi.mocked(prisma.auditLog.count).mockResolvedValue(100);
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);

      await service.query({});

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 50,
        })
      );
    });
  });
});
