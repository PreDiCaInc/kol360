import { FastifyPluginAsync, FastifyReply } from 'fastify';
import { updateScoreConfigSchema } from '@kol360/shared';
import { requireClientAdmin } from '../middleware/rbac';
import { ScoreConfigService } from '../services/score-config.service';
import { createAuditLog } from '../lib/audit';

const scoreConfigService = new ScoreConfigService();

export const scoreConfigRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireClientAdmin());

  // Helper function to verify campaign tenant access
  async function verifyCampaignAccess(
    campaignId: string,
    user: { role: string; tenantId?: string },
    reply: FastifyReply
  ): Promise<boolean> {
    const campaign = await fastify.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { clientId: true },
    });

    if (!campaign) {
      reply.status(404).send({
        error: 'Not Found',
        message: 'Campaign not found',
        statusCode: 404,
      });
      return false;
    }

    if (user.role !== 'PLATFORM_ADMIN' && campaign.clientId !== user.tenantId) {
      reply.status(403).send({
        error: 'Forbidden',
        message: 'Cannot access data from other tenants',
        statusCode: 403,
      });
      return false;
    }

    return true;
  }

  // Get score config for campaign
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/score-config',
    async (request, reply) => {
      // Verify campaign belongs to user's tenant
      const hasAccess = await verifyCampaignAccess(request.params.campaignId, request.user!, reply);
      if (!hasAccess) return;

      return scoreConfigService.getByCampaignId(request.params.campaignId);
    }
  );

  // Update score config for campaign
  fastify.put<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/score-config',
    async (request, reply) => {
      // Verify campaign belongs to user's tenant
      const hasAccess = await verifyCampaignAccess(request.params.campaignId, request.user!, reply);
      if (!hasAccess) return;

      const data = updateScoreConfigSchema.parse(request.body);
      const config = await scoreConfigService.update(request.params.campaignId, data);

      await createAuditLog(request.user!.sub, {
        action: 'score_config.updated',
        entityType: 'CompositeScoreConfig',
        entityId: config.id,
        newValues: data,
      });

      return config;
    }
  );

  // Reset score config to defaults
  fastify.post<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/score-config/reset',
    async (request, reply) => {
      // Verify campaign belongs to user's tenant
      const hasAccess = await verifyCampaignAccess(request.params.campaignId, request.user!, reply);
      if (!hasAccess) return;

      const config = await scoreConfigService.resetToDefaults(request.params.campaignId);

      await createAuditLog(request.user!.sub, {
        action: 'score_config.reset',
        entityType: 'CompositeScoreConfig',
        entityId: config.id,
        newValues: { reset: true },
      });

      return config;
    }
  );
};
