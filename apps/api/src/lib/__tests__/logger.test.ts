import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateTraceId, LogActions, createRequestLogger, logger } from '../logger';

describe('Logger', () => {
  describe('generateTraceId', () => {
    it('should generate a 16 character trace ID', () => {
      const traceId = generateTraceId();
      expect(traceId).toHaveLength(16);
    });

    it('should generate unique trace IDs', () => {
      const traceIds = new Set();
      for (let i = 0; i < 100; i++) {
        traceIds.add(generateTraceId());
      }
      expect(traceIds.size).toBe(100);
    });

    it('should only contain alphanumeric characters', () => {
      const traceId = generateTraceId();
      expect(traceId).toMatch(/^[a-f0-9]+$/);
    });

    it('should be derived from UUID format', () => {
      // Generate multiple trace IDs and verify format
      for (let i = 0; i < 10; i++) {
        const traceId = generateTraceId();
        expect(traceId).toMatch(/^[a-f0-9]{16}$/);
      }
    });
  });

  describe('createRequestLogger', () => {
    it('should create a child logger with trace ID', () => {
      const childLogger = createRequestLogger('trace-123');
      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');
      expect(typeof childLogger.error).toBe('function');
      expect(typeof childLogger.warn).toBe('function');
      expect(typeof childLogger.debug).toBe('function');
    });

    it('should create a child logger with user and tenant context', () => {
      const childLogger = createRequestLogger('trace-123', 'user-1', 'tenant-1');
      expect(childLogger).toBeDefined();
    });
  });

  describe('logger instance', () => {
    it('should have error method', () => {
      expect(typeof logger.error).toBe('function');
    });

    it('should have warn method', () => {
      expect(typeof logger.warn).toBe('function');
    });

    it('should have info method', () => {
      expect(typeof logger.info).toBe('function');
    });

    it('should have debug method', () => {
      expect(typeof logger.debug).toBe('function');
    });

    it('should have withContext method', () => {
      expect(typeof logger.withContext).toBe('function');
    });

    it('withContext should return a new logger instance', () => {
      const contextLogger = logger.withContext({ trace_id: 'test-trace' });
      expect(contextLogger).toBeDefined();
      expect(typeof contextLogger.info).toBe('function');
    });

    it('withContext should chain properly', () => {
      const contextLogger = logger
        .withContext({ trace_id: 'test-trace' })
        .withContext({ user_id: 'user-1' });
      expect(contextLogger).toBeDefined();
    });
  });

  describe('LogActions', () => {
    it('should have all authentication actions', () => {
      expect(LogActions.AUTH_LOGIN).toBe('auth.login');
      expect(LogActions.AUTH_LOGOUT).toBe('auth.logout');
      expect(LogActions.AUTH_LOGIN_FAILED).toBe('auth.login_failed');
      expect(LogActions.AUTH_PASSWORD_RESET).toBe('auth.password_reset');
    });

    it('should have all user management actions', () => {
      expect(LogActions.USER_CREATED).toBe('user.created');
      expect(LogActions.USER_UPDATED).toBe('user.updated');
      expect(LogActions.USER_ROLE_CHANGED).toBe('user.role_changed');
      expect(LogActions.USER_DISABLED).toBe('user.disabled');
    });

    it('should have all HCP actions', () => {
      expect(LogActions.HCP_VIEWED).toBe('hcp.viewed');
      expect(LogActions.HCP_CREATED).toBe('hcp.created');
      expect(LogActions.HCP_UPDATED).toBe('hcp.updated');
      expect(LogActions.HCP_EXPORTED).toBe('hcp.exported');
    });

    it('should have all survey actions', () => {
      expect(LogActions.SURVEY_SUBMITTED).toBe('survey.submitted');
      expect(LogActions.SURVEY_STARTED).toBe('survey.started');
      expect(LogActions.SURVEY_REMINDER_SENT).toBe('survey.reminder_sent');
    });

    it('should have all nomination actions', () => {
      expect(LogActions.NOMINATION_MATCHED).toBe('nomination.matched');
      expect(LogActions.NOMINATION_EXCLUDED).toBe('nomination.excluded');
      expect(LogActions.NOMINATION_ALIAS_CREATED).toBe('nomination.alias_created');
    });

    it('should have all score actions', () => {
      expect(LogActions.SCORE_PUBLISHED).toBe('score.published');
      expect(LogActions.SCORE_RECALCULATED).toBe('score.recalculated');
    });

    it('should have all campaign actions', () => {
      expect(LogActions.CAMPAIGN_CREATED).toBe('campaign.created');
      expect(LogActions.CAMPAIGN_PUBLISHED).toBe('campaign.published');
      expect(LogActions.CAMPAIGN_CLOSED).toBe('campaign.closed');
    });

    it('should have all payment actions', () => {
      expect(LogActions.PAYMENT_EXPORTED).toBe('payment.exported');
      expect(LogActions.PAYMENT_STATUS_IMPORTED).toBe('payment.status_imported');
      expect(LogActions.PAYMENT_UPDATED).toBe('payment.updated');
    });

    it('should have all config actions', () => {
      expect(LogActions.CONFIG_WEIGHTS_CHANGED).toBe('config.weights_changed');
      expect(LogActions.CONFIG_SURVEY_PUBLISHED).toBe('config.survey_published');
    });
  });
});
