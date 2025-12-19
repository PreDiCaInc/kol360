import { FastifyPluginAsync } from 'fastify';
import { updateScoreConfigSchema } from '@kol360/shared';
import { requireClientAdmin } from '../middleware/rbac';
import { ScoreConfigService } from '../services/score-config.service';
import { AuthUser } from '../plugins/auth';

const scoreConfigService = new ScoreConfigService();

type AccessError = { ok: false; error: string; status: 404 | 403 };
type AccessSuccess = { ok: true; campaign: { clientId: string } };
type AccessResult = AccessError | AccessSuccess;

export const scoreConfigRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireClientAdmin());

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

  // Get score config for campaign
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/score-config',
    async (request, reply) => {
      const { campaignId } = request.params;

      const access = await verifyCampaignAccess(campaignId, request.user!);
      if (!access.ok) {
        return reply.status(access.status).send({
          error: access.status === 404 ? 'Not Found' : 'Forbidden',
          message: access.error,
          statusCode: access.status,
        });
      }

      return scoreConfigService.getByCampaignId(campaignId);
    }
  );

  // Update score config for campaign
  fastify.put<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/score-config',
    async (request, reply) => {
      const { campaignId } = request.params;

      const access = await verifyCampaignAccess(campaignId, request.user!);
      if (!access.ok) {
        return reply.status(access.status).send({
          error: access.status === 404 ? 'Not Found' : 'Forbidden',
          message: access.error,
          statusCode: access.status,
        });
      }

      const data = updateScoreConfigSchema.parse(request.body);
      const config = await scoreConfigService.update(campaignId, data);

      await fastify.prisma.auditLog.create({
        data: {
          userId: request.user!.sub,
          action: 'score_config.updated',
          entityType: 'CompositeScoreConfig',
          entityId: config.id,
          newValues: data,
        },
      });

      return config;
    }
  );

  // Reset score config to defaults
  fastify.post<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/score-config/reset',
    async (request, reply) => {
      const { campaignId } = request.params;

      const access = await verifyCampaignAccess(campaignId, request.user!);
      if (!access.ok) {
        return reply.status(access.status).send({
          error: access.status === 404 ? 'Not Found' : 'Forbidden',
          message: access.error,
          statusCode: access.status,
        });
      }

      const config = await scoreConfigService.resetToDefaults(campaignId);

      await fastify.prisma.auditLog.create({
        data: {
          userId: request.user!.sub,
          action: 'score_config.reset',
          entityType: 'CompositeScoreConfig',
          entityId: config.id,
          newValues: { reset: true },
        },
      });

      return config;
    }
  );
};
