import pino from 'pino';
import { randomUUID } from 'crypto';

/**
 * Log levels per spec:
 * - ERROR: Failures requiring attention (DB connection failed, API errors)
 * - WARN: Potential issues, degraded service (retries, slow queries)
 * - INFO: Key business events (user login, survey submitted)
 * - DEBUG: Detailed flow (dev/staging only)
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogContext {
  trace_id?: string;
  user_id?: string;
  tenant_id?: string;
  action?: string;
  campaign_id?: string;
  response_id?: string;
  hcp_id?: string;
  duration_ms?: number;
  [key: string]: unknown;
}

// Create base logger with JSON formatting
const baseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label: string) => ({ level: label.toUpperCase() }),
    bindings: () => ({ service: 'api' }),
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  transport:
    process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});

/**
 * Generate a new trace ID for request correlation
 */
export function generateTraceId(): string {
  return randomUUID().replace(/-/g, '').substring(0, 16);
}

/**
 * Create a child logger with request context
 */
export function createRequestLogger(
  traceId: string,
  userId?: string,
  tenantId?: string
): pino.Logger {
  return baseLogger.child({
    trace_id: traceId,
    user_id: userId,
    tenant_id: tenantId,
  });
}

/**
 * Structured logger class for application logging
 */
class Logger {
  private context: LogContext = {};

  /**
   * Create a logger with initial context
   */
  withContext(context: LogContext): Logger {
    const logger = new Logger();
    logger.context = { ...this.context, ...context };
    return logger;
  }

  /**
   * Log an error - Failures requiring attention
   */
  error(message: string, context?: LogContext, error?: Error): void {
    const logData = this.buildLogData(context);
    if (error) {
      logData.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }
    baseLogger.error(logData, message);
  }

  /**
   * Log a warning - Potential issues, degraded service
   */
  warn(message: string, context?: LogContext): void {
    baseLogger.warn(this.buildLogData(context), message);
  }

  /**
   * Log info - Key business events
   */
  info(message: string, context?: LogContext): void {
    baseLogger.info(this.buildLogData(context), message);
  }

  /**
   * Log debug - Detailed flow (dev/staging only)
   */
  debug(message: string, context?: LogContext): void {
    baseLogger.debug(this.buildLogData(context), message);
  }

  private buildLogData(additionalContext?: LogContext): LogContext {
    return { ...this.context, ...additionalContext };
  }
}

// Export singleton logger instance
export const logger = new Logger();

/**
 * Business event actions for consistent logging
 */
export const LogActions = {
  // Authentication
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_LOGIN_FAILED: 'auth.login_failed',
  AUTH_PASSWORD_RESET: 'auth.password_reset',

  // User Management
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_ROLE_CHANGED: 'user.role_changed',
  USER_DISABLED: 'user.disabled',

  // HCP Data
  HCP_VIEWED: 'hcp.viewed',
  HCP_CREATED: 'hcp.created',
  HCP_UPDATED: 'hcp.updated',
  HCP_EXPORTED: 'hcp.exported',

  // Survey
  SURVEY_SUBMITTED: 'survey.submitted',
  SURVEY_STARTED: 'survey.started',
  SURVEY_REMINDER_SENT: 'survey.reminder_sent',

  // Nominations
  NOMINATION_MATCHED: 'nomination.matched',
  NOMINATION_EXCLUDED: 'nomination.excluded',
  NOMINATION_ALIAS_CREATED: 'nomination.alias_created',

  // Scores
  SCORE_PUBLISHED: 'score.published',
  SCORE_RECALCULATED: 'score.recalculated',

  // Campaign
  CAMPAIGN_CREATED: 'campaign.created',
  CAMPAIGN_PUBLISHED: 'campaign.published',
  CAMPAIGN_CLOSED: 'campaign.closed',

  // Payments
  PAYMENT_EXPORTED: 'payment.exported',
  PAYMENT_STATUS_IMPORTED: 'payment.status_imported',
  PAYMENT_UPDATED: 'payment.updated',

  // Configuration
  CONFIG_WEIGHTS_CHANGED: 'config.weights_changed',
  CONFIG_SURVEY_PUBLISHED: 'config.survey_published',
} as const;

export type LogAction = (typeof LogActions)[keyof typeof LogActions];
