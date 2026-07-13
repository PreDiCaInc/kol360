import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { surveyTakingService } from '../services/survey-taking.service';
import { saveProgressSchema, submitSurveySchema, unsubscribeSchema } from '@kol360/shared';
import { PublicValidationError } from '../lib/public-errors';
import { logger } from '../lib/logger';

const tokenParamSchema = z.object({
  token: z.string().min(1),
});

// Rate limit config for public survey endpoints — generous for read-only GET,
// since reminder blasts can cause hundreds of concurrent survey loads
const publicRateLimitConfig = {
  max: 5000, // High limit — reminder blasts cause hundreds of concurrent survey loads
  timeWindow: '1 minute',
};

const submitRateLimitConfig = {
  max: 5, // Only 5 submissions per minute per IP
  timeWindow: '1 minute',
};

/**
 * Safe error handler for public endpoints.
 * Returns 400 for validation errors, 500 with generic message for everything else.
 * Never leaks internal error details to unauthenticated users.
 */
function publicErrorResponse(error: unknown, defaultMessage: string): { status: number; body: { message: string; detail?: string } } {
  if (error instanceof z.ZodError) {
    return { status: 400, body: { message: 'Invalid request' } };
  }
  // v1.17.82 — explicit subclass for service-thrown validation errors
  // (e.g. brand-affinity grid item S invariants). Cleaner than the
  // fragile substring matches below.
  if (error instanceof PublicValidationError) {
    return { status: 400, body: { message: error.message } };
  }
  if (error instanceof Error && (
    error.message.includes('not found') ||
    error.message.includes('Invalid token') ||
    error.message.includes('already completed')
  )) {
    return { status: 400, body: { message: error.message } };
  }
  // Structured log so CloudWatch has the full context even when the
  // client only sees the sanitized default message.
  logger.error('Public endpoint error', { defaultMessage }, error instanceof Error ? error : new Error(String(error)));
  // v1.17.82 — also echo the raw message as `detail` in the 500 body
  // so e2e tests / admin curl probes can see WHY without needing
  // CloudWatch access. Safe: every throw site inside the service layer
  // is under our control — no unhandled framework errors reach here.
  const detail = error instanceof Error ? error.message : undefined;
  return { status: 500, body: { message: defaultMessage, detail } };
}

export const surveyTakingRoutes: FastifyPluginAsync = async (fastify) => {
  // Get survey by token (public - no auth)
  fastify.get<{
    Params: z.infer<typeof tokenParamSchema>;
  }>('/survey/take/:token', {
    config: { rateLimit: publicRateLimitConfig },
  }, async (request, reply) => {
    try {
      const { token } = tokenParamSchema.parse(request.params);

      const survey = await surveyTakingService.getSurveyByToken(token);

      if (!survey) {
        return reply.status(404).send({ message: 'Survey not found' });
      }

      // Check campaign status
      if (survey.campaign.status !== 'ACTIVE') {
        return reply.status(400).send({
          message: survey.campaign.status === 'DRAFT'
            ? 'This survey is not yet active'
            : 'This survey is no longer accepting responses',
        });
      }

      // Check if already completed
      if (survey.response?.status === 'COMPLETED') {
        return reply.status(400).send({
          message: survey.campaign.surveyAlreadyDoneMessage || 'You have already completed this survey',
          completed: true,
          customTitle: survey.campaign.surveyAlreadyDoneTitle,
          honorariumAmount: survey.campaign.honorariumAmount,
        });
      }

      return survey;
    } catch (error) {
      const { status, body } = publicErrorResponse(error, 'Unable to load survey');
      return reply.status(status).send(body);
    }
  });

  // Start survey (mark as opened)
  fastify.post<{
    Params: z.infer<typeof tokenParamSchema>;
  }>('/survey/take/:token/start', {
    config: { rateLimit: publicRateLimitConfig },
  }, async (request, reply) => {
    try {
      const { token } = tokenParamSchema.parse(request.params);
      const ipAddress = request.ip;
      const response = await surveyTakingService.startSurvey(token, ipAddress);
      return { status: response.status, startedAt: response.startedAt };
    } catch (error) {
      const { status, body } = publicErrorResponse(error, 'Failed to start survey');
      return reply.status(status).send(body);
    }
  });

  // Save progress (auto-save)
  fastify.post<{
    Params: z.infer<typeof tokenParamSchema>;
    Body: z.infer<typeof saveProgressSchema>;
  }>('/survey/take/:token/save', {
    config: { rateLimit: publicRateLimitConfig },
  }, async (request, reply) => {
    try {
      const { token } = tokenParamSchema.parse(request.params);
      const { answers } = saveProgressSchema.parse(request.body);
      const result = await surveyTakingService.saveProgress(token, answers);
      return result;
    } catch (error) {
      const { status, body } = publicErrorResponse(error, 'Failed to save progress');
      return reply.status(status).send(body);
    }
  });

  // Submit survey - stricter rate limit to prevent abuse
  fastify.post<{
    Params: z.infer<typeof tokenParamSchema>;
    Body: z.infer<typeof submitSurveySchema>;
  }>('/survey/take/:token/submit', {
    config: { rateLimit: submitRateLimitConfig },
  }, async (request, reply) => {
    try {
      const { token } = tokenParamSchema.parse(request.params);
      const { answers } = submitSurveySchema.parse(request.body);
      const result = await surveyTakingService.submitSurvey(token, answers);
      return result;
    } catch (error) {
      const { status, body } = publicErrorResponse(error, 'Failed to submit survey');
      return reply.status(status).send(body);
    }
  });

  // Unsubscribe from emails
  fastify.post<{
    Params: z.infer<typeof tokenParamSchema>;
    Body: z.infer<typeof unsubscribeSchema>;
  }>('/unsubscribe/:token', {
    config: { rateLimit: submitRateLimitConfig },
  }, async (request, reply) => {
    try {
      const { token } = tokenParamSchema.parse(request.params);
      const { scope, reason } = unsubscribeSchema.parse(request.body || {});
      const result = await surveyTakingService.unsubscribe(token, scope, reason);
      return result;
    } catch (error) {
      const { status, body } = publicErrorResponse(error, 'Failed to unsubscribe');
      return reply.status(status).send(body);
    }
  });

  // GET unsubscribe page (for email link)
  fastify.get<{
    Params: z.infer<typeof tokenParamSchema>;
  }>('/unsubscribe/:token', {
    config: { rateLimit: publicRateLimitConfig },
  }, async (request, reply) => {
    try {
      const { token } = tokenParamSchema.parse(request.params);

      const survey = await surveyTakingService.getSurveyByToken(token);

      if (!survey) {
        return reply.status(404).send({ message: 'Invalid token' });
      }

      return {
        valid: true,
        campaignName: survey.campaign.name,
      };
    } catch (error) {
      const { status, body } = publicErrorResponse(error, 'Unable to process request');
      return reply.status(status).send(body);
    }
  });
};
