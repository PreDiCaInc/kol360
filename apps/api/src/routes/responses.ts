import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { responseService } from '../services/response.service';
import {
  responseListQuerySchema,
  updateAnswerSchema,
  excludeResponseSchema,
} from '@kol360/shared';
import { AuthUser } from '../plugins/auth';

const campaignIdParamSchema = z.object({
  id: z.string().cuid(),
});

const responseIdParamSchema = z.object({
  id: z.string().cuid(),
  rid: z.string().cuid(),
});

type AccessError = { ok: false; error: string; status: 404 | 403 };
type AccessSuccess = { ok: true; campaign: { clientId: string } };
type AccessResult = AccessError | AccessSuccess;

export const responseRoutes: FastifyPluginAsync = async (fastify) => {
  // Helper function to verify campaign tenant access
  async function verifyCampaignAccess(campaignId: string, user: AuthUser): Promise<AccessResult> {
    const campaign = await fastify.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { clientId: true },
    });

    if (!campaign) {
      return { ok: false, error: 'Campaign not found', status: 404 };
    }

    if (user.role !== 'PLATFORM_ADMIN' && campaign.clientId !== user.tenantId) {
      return { ok: false, error: 'Cannot access data from other tenants', status: 403 };
    }

    return { ok: true, campaign };
  }

  // List responses for a campaign
  fastify.get<{
    Params: z.infer<typeof campaignIdParamSchema>;
    Querystring: z.infer<typeof responseListQuerySchema>;
  }>('/:id/responses', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const { id: campaignId } = campaignIdParamSchema.parse(request.params);

    const access = await verifyCampaignAccess(campaignId, request.user);
    if (!access.ok) {
      return reply.status(access.status).send({
        error: access.status === 404 ? 'Not Found' : 'Forbidden',
        message: access.error,
        statusCode: access.status,
      });
    }

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

    const access = await verifyCampaignAccess(campaignId, request.user);
    if (!access.ok) {
      return reply.status(access.status).send({
        error: access.status === 404 ? 'Not Found' : 'Forbidden',
        message: access.error,
        statusCode: access.status,
      });
    }

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

    const { id: campaignId, rid: responseId } = responseIdParamSchema.parse(request.params);

    const access = await verifyCampaignAccess(campaignId, request.user);
    if (!access.ok) {
      return reply.status(access.status).send({
        error: access.status === 404 ? 'Not Found' : 'Forbidden',
        message: access.error,
        statusCode: access.status,
      });
    }

    const response = await responseService.getResponseDetail(responseId);

    if (!response) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Response not found',
        statusCode: 404,
      });
    }

    // Verify response belongs to the campaign
    if (response.campaignId !== campaignId) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Response not found in this campaign',
        statusCode: 404,
      });
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
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Only platform admins can edit responses',
        statusCode: 403,
      });
    }

    const { id: campaignId, rid: responseId } = responseIdParamSchema.parse(request.params);

    // Verify campaign exists
    const campaign = await fastify.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true },
    });

    if (!campaign) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Campaign not found',
        statusCode: 404,
      });
    }

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
      return reply.status(400).send({
        error: 'Bad Request',
        message,
        statusCode: 400,
      });
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
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Only platform admins can exclude responses',
        statusCode: 403,
      });
    }

    const { id: campaignId, rid: responseId } = responseIdParamSchema.parse(request.params);

    // Verify campaign exists
    const campaign = await fastify.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true },
    });

    if (!campaign) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Campaign not found',
        statusCode: 404,
      });
    }

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
      return reply.status(400).send({
        error: 'Bad Request',
        message,
        statusCode: 400,
      });
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
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Only platform admins can include responses',
        statusCode: 403,
      });
    }

    const { id: campaignId, rid: responseId } = responseIdParamSchema.parse(request.params);

    // Verify campaign exists
    const campaign = await fastify.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true },
    });

    if (!campaign) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Campaign not found',
        statusCode: 404,
      });
    }

    try {
      const response = await responseService.includeResponse(
        responseId,
        request.user.sub
      );
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to include response';
      return reply.status(400).send({
        error: 'Bad Request',
        message,
        statusCode: 400,
      });
    }
  });
};
