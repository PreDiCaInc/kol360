import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { surveyTakingService } from '../services/survey-taking.service';
import { saveProgressSchema, submitSurveySchema, unsubscribeSchema } from '@kol360/shared';

const tokenParamSchema = z.object({
  token: z.string().min(1),
});

export const surveyTakingRoutes: FastifyPluginAsync = async (fastify) => {
  // Get survey by token (public - no auth)
  fastify.get<{
    Params: z.infer<typeof tokenParamSchema>;
  }>('/survey/take/:token', async (request, reply) => {
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
        message: 'You have already completed this survey',
        completed: true,
      });
    }

    return survey;
  });

  // Start survey (mark as opened)
  fastify.post<{
    Params: z.infer<typeof tokenParamSchema>;
  }>('/survey/take/:token/start', async (request, reply) => {
    const { token } = tokenParamSchema.parse(request.params);
    const ipAddress = request.ip;

    try {
      const response = await surveyTakingService.startSurvey(token, ipAddress);
      return { status: response.status, startedAt: response.startedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start survey';
      return reply.status(400).send({ message });
    }
  });

  // Save progress (auto-save)
  fastify.post<{
    Params: z.infer<typeof tokenParamSchema>;
    Body: z.infer<typeof saveProgressSchema>;
  }>('/survey/take/:token/save', async (request, reply) => {
    const { token } = tokenParamSchema.parse(request.params);
    const { answers } = saveProgressSchema.parse(request.body);

    try {
      const result = await surveyTakingService.saveProgress(token, answers);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save progress';
      return reply.status(400).send({ message });
    }
  });

  // Submit survey
  fastify.post<{
    Params: z.infer<typeof tokenParamSchema>;
    Body: z.infer<typeof submitSurveySchema>;
  }>('/survey/take/:token/submit', async (request, reply) => {
    const { token } = tokenParamSchema.parse(request.params);
    const { answers } = submitSurveySchema.parse(request.body);

    try {
      const result = await surveyTakingService.submitSurvey(token, answers);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit survey';
      return reply.status(400).send({ message });
    }
  });

  // Unsubscribe from emails
  fastify.post<{
    Params: z.infer<typeof tokenParamSchema>;
    Body: z.infer<typeof unsubscribeSchema>;
  }>('/unsubscribe/:token', async (request, reply) => {
    const { token } = tokenParamSchema.parse(request.params);
    const { scope, reason } = unsubscribeSchema.parse(request.body || {});

    try {
      const result = await surveyTakingService.unsubscribe(token, scope, reason);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to unsubscribe';
      return reply.status(400).send({ message });
    }
  });

  // GET unsubscribe page (for email link)
  fastify.get<{
    Params: z.infer<typeof tokenParamSchema>;
  }>('/unsubscribe/:token', async (request, reply) => {
    const { token } = tokenParamSchema.parse(request.params);

    // Validate token exists
    const survey = await surveyTakingService.getSurveyByToken(token);

    if (!survey) {
      return reply.status(404).send({ message: 'Invalid token' });
    }

    return {
      valid: true,
      campaignName: survey.campaign.name,
    };
  });
};
