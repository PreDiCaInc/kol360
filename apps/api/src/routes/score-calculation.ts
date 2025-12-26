import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requirePlatformAdmin } from '../middleware/rbac';
import { scoreCalculationService } from '../services/score-calculation.service';
import { createAuditLog } from '../lib/audit';

const campaignIdSchema = z.object({
  id: z.string().cuid(),
});

export const scoreCalculationRoutes: FastifyPluginAsync = async (fastify) => {
  // All score calculation routes require platform admin
  fastify.addHook('preHandler', requirePlatformAdmin());

  // List campaign scores with HCP details
  fastify.get<{ Params: z.infer<typeof campaignIdSchema> }>(
    '/:id/scores',
    async (request, reply) => {
      const result = campaignIdSchema.safeParse(request.params);
      if (!result.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid campaign ID',
          statusCode: 400,
        });
      }

      // Get nomination types used in this campaign
      const surveyQuestions = await fastify.prisma.surveyQuestion.findMany({
        where: {
          campaignId: result.data.id,
          nominationType: { not: null },
        },
        select: { nominationType: true },
      });

      const nominationTypes = [...new Set(
        surveyQuestions
          .map(q => q.nominationType)
          .filter((t): t is NonNullable<typeof t> => t !== null)
      )];

      const scores = await fastify.prisma.hcpCampaignScore.findMany({
        where: { campaignId: result.data.id },
        include: {
          hcp: {
            select: {
              id: true,
              npi: true,
              firstName: true,
              lastName: true,
              specialty: true,
              city: true,
              state: true,
            },
          },
        },
        orderBy: [
          { scoreSurvey: 'desc' },
          { nominationCount: 'desc' },
        ],
      });

      // Get max nomination count for context
      const maxNominations = scores.length > 0
        ? Math.max(...scores.map((s) => s.nominationCount))
        : 0;

      return {
        items: scores,
        maxNominations,
        nominationTypes,
        total: scores.length,
      };
    }
  );

  // Get calculation status
  fastify.get<{ Params: z.infer<typeof campaignIdSchema> }>(
    '/:id/scores/status',
    async (request, reply) => {
      const result = campaignIdSchema.safeParse(request.params);
      if (!result.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid campaign ID',
          statusCode: 400,
        });
      }

      return scoreCalculationService.getCalculationStatus(result.data.id);
    }
  );

  // Calculate survey scores from nominations
  fastify.post<{ Params: z.infer<typeof campaignIdSchema> }>(
    '/:id/scores/calculate-survey',
    async (request, reply) => {
      const result = campaignIdSchema.safeParse(request.params);
      if (!result.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid campaign ID',
          statusCode: 400,
        });
      }

      const campaignId = result.data.id;

      try {
        const calcResult = await scoreCalculationService.calculateSurveyScores(campaignId);

        await createAuditLog(request.user!.sub, {
          action: 'scores.survey_calculated',
          entityType: 'Campaign',
          entityId: campaignId,
          newValues: calcResult,
        });

        return calcResult;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to calculate survey scores';
        return reply.status(400).send({ error: 'Bad Request', message, statusCode: 400 });
      }
    }
  );

  // Calculate composite scores
  fastify.post<{ Params: z.infer<typeof campaignIdSchema> }>(
    '/:id/scores/calculate-composite',
    async (request, reply) => {
      const result = campaignIdSchema.safeParse(request.params);
      if (!result.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid campaign ID',
          statusCode: 400,
        });
      }

      const campaignId = result.data.id;

      try {
        const calcResult = await scoreCalculationService.calculateCompositeScores(campaignId);

        await createAuditLog(request.user!.sub, {
          action: 'scores.composite_calculated',
          entityType: 'Campaign',
          entityId: campaignId,
          newValues: calcResult,
        });

        return calcResult;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to calculate composite scores';
        return reply.status(400).send({ error: 'Bad Request', message, statusCode: 400 });
      }
    }
  );

  // Calculate all scores (survey + composite in one call)
  fastify.post<{ Params: z.infer<typeof campaignIdSchema> }>(
    '/:id/scores/calculate-all',
    async (request, reply) => {
      const result = campaignIdSchema.safeParse(request.params);
      if (!result.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid campaign ID',
          statusCode: 400,
        });
      }

      const campaignId = result.data.id;

      try {
        const surveyResult = await scoreCalculationService.calculateSurveyScores(campaignId);
        const compositeResult = await scoreCalculationService.calculateCompositeScores(campaignId);

        const calcResult = {
          surveyScores: surveyResult,
          compositeScores: compositeResult,
        };

        await createAuditLog(request.user!.sub, {
          action: 'scores.all_calculated',
          entityType: 'Campaign',
          entityId: campaignId,
          newValues: calcResult,
        });

        return calcResult;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to calculate scores';
        return reply.status(400).send({ error: 'Bad Request', message, statusCode: 400 });
      }
    }
  );
};
