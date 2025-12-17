import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { responseService } from '../services/response.service';
import {
  responseListQuerySchema,
  updateAnswerSchema,
  excludeResponseSchema,
  idParamSchema,
} from '@kol360/shared';

const campaignIdParamSchema = z.object({
  id: z.string().cuid(),
});

const responseIdParamSchema = z.object({
  id: z.string().cuid(),
  rid: z.string().cuid(),
});

export const responseRoutes: FastifyPluginAsync = async (fastify) => {
  // List responses for a campaign
  fastify.get<{
    Params: z.infer<typeof campaignIdParamSchema>;
    Querystring: z.infer<typeof responseListQuerySchema>;
  }>('/:id/responses', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const { id: campaignId } = campaignIdParamSchema.parse(request.params);
    const query = responseListQuerySchema.parse(request.query);

    const result = await responseService.listForCampaign(campaignId, query);
    return result;
  });

  // Get response stats for a campaign
  fastify.get<{
    Params: z.infer<typeof campaignIdParamSchema>;
  }>('/:id/responses/stats', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const { id: campaignId } = campaignIdParamSchema.parse(request.params);
    const stats = await responseService.getResponseStats(campaignId);
    return stats;
  });

  // Get response detail
  fastify.get<{
    Params: z.infer<typeof responseIdParamSchema>;
  }>('/:id/responses/:rid', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const { rid: responseId } = responseIdParamSchema.parse(request.params);
    const response = await responseService.getResponseDetail(responseId);

    if (!response) {
      return reply.status(404).send({ message: 'Response not found' });
    }

    return response;
  });

  // Update response answer (admin edit)
  fastify.put<{
    Params: z.infer<typeof responseIdParamSchema>;
    Body: z.infer<typeof updateAnswerSchema>;
  }>('/:id/responses/:rid', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    // Only PLATFORM_ADMIN can edit responses
    if (request.user.role !== 'PLATFORM_ADMIN') {
      return reply.status(403).send({ message: 'Only platform admins can edit responses' });
    }

    const { rid: responseId } = responseIdParamSchema.parse(request.params);
    const { questionId, value } = updateAnswerSchema.parse(request.body);

    try {
      const answer = await responseService.updateAnswer(
        responseId,
        questionId,
        value,
        request.user.sub
      );
      return answer;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update answer';
      return reply.status(400).send({ message });
    }
  });

  // Exclude response
  fastify.post<{
    Params: z.infer<typeof responseIdParamSchema>;
    Body: z.infer<typeof excludeResponseSchema>;
  }>('/:id/responses/:rid/exclude', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    // Only PLATFORM_ADMIN can exclude responses
    if (request.user.role !== 'PLATFORM_ADMIN') {
      return reply.status(403).send({ message: 'Only platform admins can exclude responses' });
    }

    const { rid: responseId } = responseIdParamSchema.parse(request.params);
    const { reason } = excludeResponseSchema.parse(request.body);

    try {
      const response = await responseService.excludeResponse(
        responseId,
        reason,
        request.user.sub
      );
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to exclude response';
      return reply.status(400).send({ message });
    }
  });

  // Re-include response
  fastify.post<{
    Params: z.infer<typeof responseIdParamSchema>;
  }>('/:id/responses/:rid/include', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    // Only PLATFORM_ADMIN can include responses
    if (request.user.role !== 'PLATFORM_ADMIN') {
      return reply.status(403).send({ message: 'Only platform admins can include responses' });
    }

    const { rid: responseId } = responseIdParamSchema.parse(request.params);

    try {
      const response = await responseService.includeResponse(
        responseId,
        request.user.sub
      );
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to include response';
      return reply.status(400).send({ message });
    }
  });
};
