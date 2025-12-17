import { FastifyPluginAsync } from 'fastify';
import {
  createCampaignSchema,
  updateCampaignSchema,
  campaignListQuerySchema,
} from '@kol360/shared';
import { requireClientAdmin } from '../middleware/rbac';
import { CampaignService } from '../services/campaign.service';

const campaignService = new CampaignService();

export const campaignRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireClientAdmin());

  // List campaigns
  fastify.get('/', async (request) => {
    const query = campaignListQuerySchema.parse(request.query);
    return campaignService.list(query);
  });

  // Get campaign by ID
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const campaign = await campaignService.getById(request.params.id);
    if (!campaign) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Campaign not found',
        statusCode: 404,
      });
    }
    return campaign;
  });

  // Create campaign
  fastify.post('/', async (request, reply) => {
    const data = createCampaignSchema.parse(request.body);
    const campaign = await campaignService.create(data, request.user!.sub);

    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'campaign.created',
        entityType: 'Campaign',
        entityId: campaign.id,
        newValues: { name: data.name, clientId: data.clientId },
      },
    });

    return reply.status(201).send(campaign);
  });

  // Update campaign
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const data = updateCampaignSchema.parse(request.body);
    const campaign = await campaignService.update(request.params.id, data);

    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'campaign.updated',
        entityType: 'Campaign',
        entityId: campaign.id,
        newValues: data,
      },
    });

    return campaign;
  });

  // Delete campaign (draft only)
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      await campaignService.delete(request.params.id);

      await fastify.prisma.auditLog.create({
        data: {
          userId: request.user!.sub,
          action: 'campaign.deleted',
          entityType: 'Campaign',
          entityId: request.params.id,
        },
      });

      return reply.status(204).send();
    } catch (error) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: error instanceof Error ? error.message : 'Cannot delete campaign',
        statusCode: 400,
      });
    }
  });

  // Activate campaign (DRAFT -> ACTIVE)
  fastify.post<{ Params: { id: string } }>('/:id/activate', async (request, reply) => {
    try {
      const campaign = await campaignService.activate(request.params.id);

      await fastify.prisma.auditLog.create({
        data: {
          userId: request.user!.sub,
          action: 'campaign.activated',
          entityType: 'Campaign',
          entityId: campaign.id,
          newValues: { status: 'ACTIVE' },
        },
      });

      return campaign;
    } catch (error) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: error instanceof Error ? error.message : 'Cannot activate campaign',
        statusCode: 400,
      });
    }
  });

  // Close campaign (ACTIVE -> CLOSED)
  fastify.post<{ Params: { id: string } }>('/:id/close', async (request, reply) => {
    try {
      const campaign = await campaignService.close(request.params.id);

      await fastify.prisma.auditLog.create({
        data: {
          userId: request.user!.sub,
          action: 'campaign.closed',
          entityType: 'Campaign',
          entityId: campaign.id,
          newValues: { status: 'CLOSED' },
        },
      });

      return campaign;
    } catch (error) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: error instanceof Error ? error.message : 'Cannot close campaign',
        statusCode: 400,
      });
    }
  });

  // Reopen campaign (CLOSED -> ACTIVE)
  fastify.post<{ Params: { id: string } }>('/:id/reopen', async (request, reply) => {
    try {
      const campaign = await campaignService.reopen(request.params.id);

      await fastify.prisma.auditLog.create({
        data: {
          userId: request.user!.sub,
          action: 'campaign.reopened',
          entityType: 'Campaign',
          entityId: campaign.id,
          newValues: { status: 'ACTIVE' },
        },
      });

      return campaign;
    } catch (error) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: error instanceof Error ? error.message : 'Cannot reopen campaign',
        statusCode: 400,
      });
    }
  });

  // Publish campaign (CLOSED -> PUBLISHED)
  fastify.post<{ Params: { id: string } }>('/:id/publish', async (request, reply) => {
    try {
      const campaign = await campaignService.publish(request.params.id);

      await fastify.prisma.auditLog.create({
        data: {
          userId: request.user!.sub,
          action: 'campaign.published',
          entityType: 'Campaign',
          entityId: campaign.id,
          newValues: { status: 'PUBLISHED', publishedAt: campaign.publishedAt },
        },
      });

      return campaign;
    } catch (error) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: error instanceof Error ? error.message : 'Cannot publish campaign',
        statusCode: 400,
      });
    }
  });
};
