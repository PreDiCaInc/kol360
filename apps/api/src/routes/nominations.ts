import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nominationService } from '../services/nomination.service';
import {
  nominationListQuerySchema,
  matchNominationSchema,
  createHcpFromNominationSchema,
} from '@kol360/shared';
import { AuthUser } from '../plugins/auth';

const campaignIdParamSchema = z.object({
  id: z.string().cuid(),
});

const nominationIdParamSchema = z.object({
  id: z.string().cuid(),
  nid: z.string().cuid(),
});

type AccessError = { ok: false; error: string; status: 404 | 403 };
type AccessSuccess = { ok: true; campaign: { clientId: string } };
type AccessResult = AccessError | AccessSuccess;

export const nominationRoutes: FastifyPluginAsync = async (fastify) => {
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

  // List nominations for a campaign
  fastify.get<{
    Params: z.infer<typeof campaignIdParamSchema>;
    Querystring: z.infer<typeof nominationListQuerySchema>;
  }>('/:id/nominations', async (request, reply) => {
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

    const query = nominationListQuerySchema.parse(request.query);
    const result = await nominationService.listForCampaign(campaignId, query);
    return result;
  });

  // Get nomination stats for a campaign
  fastify.get<{
    Params: z.infer<typeof campaignIdParamSchema>;
  }>('/:id/nominations/stats', async (request, reply) => {
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

    const stats = await nominationService.getStats(campaignId);
    return stats;
  });

  // Bulk auto-match nominations
  fastify.post<{
    Params: z.infer<typeof campaignIdParamSchema>;
  }>('/:id/nominations/bulk-match', async (request, reply) => {
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

    try {
      const result = await nominationService.bulkAutoMatch(campaignId, request.user.sub);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to bulk match';
      return reply.status(400).send({
        error: 'Bad Request',
        message,
        statusCode: 400,
      });
    }
  });

  // Get suggestions for a nomination
  fastify.get<{
    Params: z.infer<typeof nominationIdParamSchema>;
  }>('/:id/nominations/:nid/suggestions', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const { id: campaignId, nid: nominationId } = nominationIdParamSchema.parse(request.params);

    const access = await verifyCampaignAccess(campaignId, request.user);
    if (!access.ok) {
      return reply.status(access.status).send({
        error: access.status === 404 ? 'Not Found' : 'Forbidden',
        message: access.error,
        statusCode: access.status,
      });
    }

    const suggestions = await nominationService.getSuggestions(nominationId);
    return suggestions;
  });

  // Match nomination to existing HCP
  fastify.post<{
    Params: z.infer<typeof nominationIdParamSchema>;
    Body: z.infer<typeof matchNominationSchema>;
  }>('/:id/nominations/:nid/match', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const { id: campaignId, nid: nominationId } = nominationIdParamSchema.parse(request.params);

    const access = await verifyCampaignAccess(campaignId, request.user);
    if (!access.ok) {
      return reply.status(access.status).send({
        error: access.status === 404 ? 'Not Found' : 'Forbidden',
        message: access.error,
        statusCode: access.status,
      });
    }

    const { hcpId, addAlias } = matchNominationSchema.parse(request.body);

    try {
      const result = await nominationService.matchToHcp(
        nominationId,
        hcpId,
        addAlias,
        request.user.sub
      );
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to match nomination';
      return reply.status(400).send({
        error: 'Bad Request',
        message,
        statusCode: 400,
      });
    }
  });

  // Create new HCP and match nomination
  fastify.post<{
    Params: z.infer<typeof nominationIdParamSchema>;
    Body: z.infer<typeof createHcpFromNominationSchema>;
  }>('/:id/nominations/:nid/create-hcp', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const { id: campaignId, nid: nominationId } = nominationIdParamSchema.parse(request.params);

    const access = await verifyCampaignAccess(campaignId, request.user);
    if (!access.ok) {
      return reply.status(access.status).send({
        error: access.status === 404 ? 'Not Found' : 'Forbidden',
        message: access.error,
        statusCode: access.status,
      });
    }

    const hcpData = createHcpFromNominationSchema.parse(request.body);

    try {
      const result = await nominationService.createHcpAndMatch(
        nominationId,
        hcpData,
        request.user.sub
      );
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create HCP';
      return reply.status(400).send({
        error: 'Bad Request',
        message,
        statusCode: 400,
      });
    }
  });

  // Exclude nomination
  fastify.post<{
    Params: z.infer<typeof nominationIdParamSchema>;
  }>('/:id/nominations/:nid/exclude', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const { id: campaignId, nid: nominationId } = nominationIdParamSchema.parse(request.params);

    const access = await verifyCampaignAccess(campaignId, request.user);
    if (!access.ok) {
      return reply.status(access.status).send({
        error: access.status === 404 ? 'Not Found' : 'Forbidden',
        message: access.error,
        statusCode: access.status,
      });
    }

    try {
      const result = await nominationService.exclude(nominationId, request.user.sub);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to exclude nomination';
      return reply.status(400).send({
        error: 'Bad Request',
        message,
        statusCode: 400,
      });
    }
  });
};
