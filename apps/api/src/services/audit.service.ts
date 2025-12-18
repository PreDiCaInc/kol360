import { prisma } from '../lib/prisma';
import { logger, LogActions } from '../lib/logger';

// Actor types for audit logging
type ActorType = 'USER' | 'SYSTEM' | 'API_KEY';

/**
 * Audit event categories per spec:
 * - Authentication: Login, logout, failed login, password reset
 * - User Management: User created, role changed, user disabled
 * - Data Access: HCP data viewed, exported, modified
 * - Survey: Response submitted, edited, deleted
 * - Nominations: Matched, excluded, alias created
 * - Scores: Published, recalculated
 * - Payments: Exported, status imported, manually updated
 * - Configuration: Campaign created, weights changed, survey published
 */

export interface AuditContext {
  userId?: string;
  actorType?: ActorType;
  tenantId?: string;
  ipAddress?: string;
  userAgent?: string;
  traceId?: string;
}

export interface AuditEventData {
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Audit logging service for compliance-sensitive operations
 * Retention: 5 years per data retention policy
 */
export class AuditService {
  /**
   * Record an audit event
   */
  async log(context: AuditContext, event: AuditEventData): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: context.userId,
          actorType: context.actorType || 'USER',
          tenantId: context.tenantId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
          oldValues: event.oldValues ?? undefined,
          newValues: event.newValues ?? undefined,
          metadata: {
            ...event.metadata,
            traceId: context.traceId,
          },
        },
      });

      logger.debug('Audit event recorded', {
        trace_id: context.traceId,
        action: event.action,
        entity_type: event.entityType,
        entity_id: event.entityId,
      });
    } catch (error) {
      // Log but don't throw - audit logging should not break business operations
      logger.error(
        'Failed to record audit event',
        {
          trace_id: context.traceId,
          action: event.action,
          entity_type: event.entityType,
          entity_id: event.entityId,
        },
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  // Convenience methods for common audit events

  /**
   * Log authentication events
   */
  async logAuth(
    context: AuditContext,
    action: 'login' | 'logout' | 'login_failed' | 'password_reset',
    userId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const actionMap = {
      login: LogActions.AUTH_LOGIN,
      logout: LogActions.AUTH_LOGOUT,
      login_failed: LogActions.AUTH_LOGIN_FAILED,
      password_reset: LogActions.AUTH_PASSWORD_RESET,
    };

    await this.log(context, {
      action: actionMap[action],
      entityType: 'User',
      entityId: userId,
      metadata,
    });
  }

  /**
   * Log user management events
   */
  async logUserChange(
    context: AuditContext,
    action: 'created' | 'updated' | 'role_changed' | 'disabled',
    userId: string,
    oldValues?: Record<string, unknown>,
    newValues?: Record<string, unknown>
  ): Promise<void> {
    const actionMap = {
      created: LogActions.USER_CREATED,
      updated: LogActions.USER_UPDATED,
      role_changed: LogActions.USER_ROLE_CHANGED,
      disabled: LogActions.USER_DISABLED,
    };

    await this.log(context, {
      action: actionMap[action],
      entityType: 'User',
      entityId: userId,
      oldValues,
      newValues,
    });
  }

  /**
   * Log HCP data access events
   */
  async logHcpAccess(
    context: AuditContext,
    action: 'viewed' | 'created' | 'updated' | 'exported',
    hcpId: string,
    oldValues?: Record<string, unknown>,
    newValues?: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const actionMap = {
      viewed: LogActions.HCP_VIEWED,
      created: LogActions.HCP_CREATED,
      updated: LogActions.HCP_UPDATED,
      exported: LogActions.HCP_EXPORTED,
    };

    await this.log(context, {
      action: actionMap[action],
      entityType: 'Hcp',
      entityId: hcpId,
      oldValues,
      newValues,
      metadata,
    });
  }

  /**
   * Log survey events
   */
  async logSurvey(
    context: AuditContext,
    action: 'submitted' | 'started' | 'reminder_sent',
    responseId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const actionMap = {
      submitted: LogActions.SURVEY_SUBMITTED,
      started: LogActions.SURVEY_STARTED,
      reminder_sent: LogActions.SURVEY_REMINDER_SENT,
    };

    await this.log(context, {
      action: actionMap[action],
      entityType: 'SurveyResponse',
      entityId: responseId,
      metadata,
    });
  }

  /**
   * Log nomination events
   */
  async logNomination(
    context: AuditContext,
    action: 'matched' | 'excluded' | 'alias_created',
    nominationId: string,
    oldValues?: Record<string, unknown>,
    newValues?: Record<string, unknown>
  ): Promise<void> {
    const actionMap = {
      matched: LogActions.NOMINATION_MATCHED,
      excluded: LogActions.NOMINATION_EXCLUDED,
      alias_created: LogActions.NOMINATION_ALIAS_CREATED,
    };

    await this.log(context, {
      action: actionMap[action],
      entityType: 'Nomination',
      entityId: nominationId,
      oldValues,
      newValues,
    });
  }

  /**
   * Log campaign events
   */
  async logCampaign(
    context: AuditContext,
    action: 'created' | 'published' | 'closed',
    campaignId: string,
    oldValues?: Record<string, unknown>,
    newValues?: Record<string, unknown>
  ): Promise<void> {
    const actionMap = {
      created: LogActions.CAMPAIGN_CREATED,
      published: LogActions.CAMPAIGN_PUBLISHED,
      closed: LogActions.CAMPAIGN_CLOSED,
    };

    await this.log(context, {
      action: actionMap[action],
      entityType: 'Campaign',
      entityId: campaignId,
      oldValues,
      newValues,
    });
  }

  /**
   * Log score events
   */
  async logScore(
    context: AuditContext,
    action: 'published' | 'recalculated',
    scoreId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const actionMap = {
      published: LogActions.SCORE_PUBLISHED,
      recalculated: LogActions.SCORE_RECALCULATED,
    };

    await this.log(context, {
      action: actionMap[action],
      entityType: 'HcpDiseaseAreaScore',
      entityId: scoreId,
      metadata,
    });
  }

  /**
   * Log payment events
   */
  async logPayment(
    context: AuditContext,
    action: 'exported' | 'status_imported' | 'updated',
    paymentId: string,
    oldValues?: Record<string, unknown>,
    newValues?: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const actionMap = {
      exported: LogActions.PAYMENT_EXPORTED,
      status_imported: LogActions.PAYMENT_STATUS_IMPORTED,
      updated: LogActions.PAYMENT_UPDATED,
    };

    await this.log(context, {
      action: actionMap[action],
      entityType: 'Payment',
      entityId: paymentId,
      oldValues,
      newValues,
      metadata,
    });
  }

  /**
   * Query audit logs with filters
   */
  async query(filters: {
    tenantId?: string;
    userId?: string;
    entityType?: string;
    entityId?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const {
      tenantId,
      userId,
      entityType,
      entityId,
      action,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = filters;

    const where: Record<string, unknown> = {};
    if (tenantId) where.tenantId = tenantId;
    if (userId) where.userId = userId;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (action) where.action = action;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) (where.createdAt as Record<string, Date>).gte = startDate;
      if (endDate) (where.createdAt as Record<string, Date>).lte = endDate;
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

// Export singleton instance
export const auditService = new AuditService();
