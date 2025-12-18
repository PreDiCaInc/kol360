import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateTraceId, LogActions } from '../logger';

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
