import { FastifyPluginAsync } from 'fastify';
import { updateScoreConfigSchema } from '@kol360/shared';
import { requireClientAdmin } from '../middleware/rbac';
import { ScoreConfigService } from '../services/score-config.service';

const scoreConfigService = new ScoreConfigService();

export const scoreConfigRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireClientAdmin());

  // Get score config for campaign
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/score-config',
    async (request) => {
      return scoreConfigService.getByCampaignId(request.params.campaignId);
    }
  );

  // Update score config for campaign
  fastify.put<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/score-config',
    async (request, reply) => {
      const data = updateScoreConfigSchema.parse(request.body);
      const config = await scoreConfigService.update(request.params.campaignId, data);

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
      const config = await scoreConfigService.resetToDefaults(request.params.campaignId);

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
