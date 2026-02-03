import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { AuditService } from '../audit.service';

// Mock prisma
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
    CAMPAIGN_CREATED: 'campaign.created',
    CAMPAIGN_PUBLISHED: 'campaign.published',
    CAMPAIGN_CLOSED: 'campaign.closed',
    SCORE_PUBLISHED: 'score.published',
    SCORE_RECALCULATED: 'score.recalculated',
    PAYMENT_EXPORTED: 'payment.exported',
    PAYMENT_STATUS_IMPORTED: 'payment.status_imported',
    PAYMENT_UPDATED: 'payment.updated',
  },
}));

import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';

describe('AuditService', () => {
  let auditService: AuditService;

  beforeEach(() => {
    auditService = new AuditService();
    vi.clearAllMocks();
  });

  describe('log', () => {
    it('should create audit log entry', async () => {
      (prisma.auditLog.create as Mock).mockResolvedValue({ id: 'audit-1' });

      await auditService.log(
        { userId: 'user-1', tenantId: 'tenant-1', ipAddress: '127.0.0.1' },
        { action: 'test.action', entityType: 'TestEntity', entityId: 'entity-1' }
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          tenantId: 'tenant-1',
          ipAddress: '127.0.0.1',
          action: 'test.action',
          entityType: 'TestEntity',
          entityId: 'entity-1',
        }),
      });
    });

    it('should include old and new values', async () => {
      (prisma.auditLog.create as Mock).mockResolvedValue({ id: 'audit-1' });

      await auditService.log(
        { userId: 'user-1' },
        {
          action: 'test.update',
          entityType: 'TestEntity',
          entityId: 'entity-1',
          oldValues: { name: 'old' },
          newValues: { name: 'new' },
        }
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          oldValues: { name: 'old' },
          newValues: { name: 'new' },
        }),
      });
    });

    it('should default actorType to USER', async () => {
      (prisma.auditLog.create as Mock).mockResolvedValue({ id: 'audit-1' });

      await auditService.log(
        { userId: 'user-1' },
        { action: 'test.action', entityType: 'Test', entityId: '1' }
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorType: 'USER',
        }),
      });
    });

    it('should not throw on database error', async () => {
      (prisma.auditLog.create as Mock).mockRejectedValue(new Error('DB error'));

      await expect(
        auditService.log(
          { userId: 'user-1' },
          { action: 'test.action', entityType: 'Test', entityId: '1' }
        )
      ).resolves.not.toThrow();

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('logAuth', () => {
    it('should log login event', async () => {
      (prisma.auditLog.create as Mock).mockResolvedValue({ id: 'audit-1' });

      await auditService.logAuth({ userId: 'user-1' }, 'login', 'user-1');

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'auth.login',
          entityType: 'User',
          entityId: 'user-1',
        }),
      });
    });

    it('should log logout event', async () => {
      (prisma.auditLog.create as Mock).mockResolvedValue({ id: 'audit-1' });

      await auditService.logAuth({ userId: 'user-1' }, 'logout', 'user-1');

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'auth.logout',
        }),
      });
    });

    it('should log login failed event', async () => {
      (prisma.auditLog.create as Mock).mockResolvedValue({ id: 'audit-1' });

      await auditService.logAuth({ ipAddress: '1.2.3.4' }, 'login_failed', 'unknown');

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'auth.login_failed',
          ipAddress: '1.2.3.4',
        }),
      });
    });
  });

  describe('logUserChange', () => {
    it('should log user created event', async () => {
      (prisma.auditLog.create as Mock).mockResolvedValue({ id: 'audit-1' });

      await auditService.logUserChange(
        { userId: 'admin-1' },
        'created',
        'user-1',
        undefined,
        { email: 'test@example.com', role: 'TEAM_MEMBER' }
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'user.created',
          entityId: 'user-1',
          newValues: { email: 'test@example.com', role: 'TEAM_MEMBER' },
        }),
      });
    });

    it('should log role change with old and new values', async () => {
      (prisma.auditLog.create as Mock).mockResolvedValue({ id: 'audit-1' });

      await auditService.logUserChange(
        { userId: 'admin-1' },
        'role_changed',
        'user-1',
        { role: 'TEAM_MEMBER' },
        { role: 'CLIENT_ADMIN' }
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'user.role_changed',
          oldValues: { role: 'TEAM_MEMBER' },
          newValues: { role: 'CLIENT_ADMIN' },
        }),
      });
    });
  });

  describe('logHcpAccess', () => {
    it('should log HCP viewed event', async () => {
      (prisma.auditLog.create as Mock).mockResolvedValue({ id: 'audit-1' });

      await auditService.logHcpAccess({ userId: 'user-1' }, 'viewed', 'hcp-1');

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'hcp.viewed',
          entityType: 'Hcp',
          entityId: 'hcp-1',
        }),
      });
    });

    it('should log HCP exported event with metadata', async () => {
      (prisma.auditLog.create as Mock).mockResolvedValue({ id: 'audit-1' });

      await auditService.logHcpAccess(
        { userId: 'user-1' },
        'exported',
        'hcp-1',
        undefined,
        undefined,
        { format: 'csv', count: 100 }
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'hcp.exported',
          metadata: expect.objectContaining({ format: 'csv', count: 100 }),
        }),
      });
    });
  });

  describe('logCampaign', () => {
    it('should log campaign created event', async () => {
      (prisma.auditLog.create as Mock).mockResolvedValue({ id: 'audit-1' });

      await auditService.logCampaign({ userId: 'user-1' }, 'created', 'campaign-1');

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'campaign.created',
          entityType: 'Campaign',
        }),
      });
    });

    it('should log campaign published event', async () => {
      (prisma.auditLog.create as Mock).mockResolvedValue({ id: 'audit-1' });

      await auditService.logCampaign({ userId: 'user-1' }, 'published', 'campaign-1');

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'campaign.published',
        }),
      });
    });
  });

  describe('query', () => {
    it('should return paginated audit logs', async () => {
      const mockLogs = [
        { id: 'log-1', action: 'test', entityType: 'Test', user: { id: 'user-1' } },
      ];

      (prisma.auditLog.count as Mock).mockResolvedValue(1);
      (prisma.auditLog.findMany as Mock).mockResolvedValue(mockLogs);

      const result = await auditService.query({ page: 1, limit: 50 });

      expect(result.items).toEqual(mockLogs);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 50,
        total: 1,
        totalPages: 1,
      });
    });

    it('should filter by tenantId', async () => {
      (prisma.auditLog.count as Mock).mockResolvedValue(0);
      (prisma.auditLog.findMany as Mock).mockResolvedValue([]);

      await auditService.query({ tenantId: 'tenant-1' });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1' }),
        })
      );
    });

    it('should filter by userId', async () => {
      (prisma.auditLog.count as Mock).mockResolvedValue(0);
      (prisma.auditLog.findMany as Mock).mockResolvedValue([]);

      await auditService.query({ userId: 'user-1' });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1' }),
        })
      );
    });

    it('should filter by date range', async () => {
      (prisma.auditLog.count as Mock).mockResolvedValue(0);
      (prisma.auditLog.findMany as Mock).mockResolvedValue([]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      await auditService.query({ startDate, endDate });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: startDate, lte: endDate },
          }),
        })
      );
    });

    it('should use default pagination values', async () => {
      (prisma.auditLog.count as Mock).mockResolvedValue(0);
      (prisma.auditLog.findMany as Mock).mockResolvedValue([]);

      await auditService.query({});

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 50,
        })
      );
    });
  });
});
