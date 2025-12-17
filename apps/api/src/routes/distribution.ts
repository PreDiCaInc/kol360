import { FastifyPluginAsync } from 'fastify';
import { assignHcpsSchema } from '@kol360/shared';
import { requireClientAdmin } from '../middleware/rbac';
import { DistributionService } from '../services/distribution.service';

const distributionService = new DistributionService();

export const distributionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireClientAdmin());

  // List HCPs assigned to campaign
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/hcps',
    async (request) => {
      const hcps = await distributionService.listCampaignHcps(request.params.campaignId);
      return { items: hcps };
    }
  );

  // Assign HCPs to campaign (bulk)
  fastify.post<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/hcps',
    async (request, reply) => {
      const { hcpIds } = assignHcpsSchema.parse(request.body);
      const result = await distributionService.assignHcps(request.params.campaignId, hcpIds);

      await fastify.prisma.auditLog.create({
        data: {
          userId: request.user!.sub,
          action: 'campaign.hcps_assigned',
          entityType: 'Campaign',
          entityId: request.params.campaignId,
          newValues: { added: result.added, skipped: result.skipped },
        },
      });

      return result;
    }
  );

  // Remove HCP from campaign
  fastify.delete<{ Params: { campaignId: string; hcpId: string } }>(
    '/campaigns/:campaignId/hcps/:hcpId',
    async (request, reply) => {
      try {
        await distributionService.removeHcp(request.params.campaignId, request.params.hcpId);

        await fastify.prisma.auditLog.create({
          data: {
            userId: request.user!.sub,
            action: 'campaign.hcp_removed',
            entityType: 'Campaign',
            entityId: request.params.campaignId,
            newValues: { hcpId: request.params.hcpId },
          },
        });

        return reply.status(204).send();
      } catch (error) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: error instanceof Error ? error.message : 'Cannot remove HCP',
          statusCode: 400,
        });
      }
    }
  );

  // Send survey invitations
  fastify.post<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/send-invitations',
    async (request, reply) => {
      try {
        const result = await distributionService.sendInvitations(request.params.campaignId);

        await fastify.prisma.auditLog.create({
          data: {
            userId: request.user!.sub,
            action: 'campaign.invitations_sent',
            entityType: 'Campaign',
            entityId: request.params.campaignId,
            newValues: { sent: result.sent, failed: result.failed },
          },
        });

        return result;
      } catch (error) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: error instanceof Error ? error.message : 'Cannot send invitations',
          statusCode: 400,
        });
      }
    }
  );

  // Send reminders
  fastify.post<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/send-reminders',
    async (request, reply) => {
      try {
        const result = await distributionService.sendReminders(request.params.campaignId);

        await fastify.prisma.auditLog.create({
          data: {
            userId: request.user!.sub,
            action: 'campaign.reminders_sent',
            entityType: 'Campaign',
            entityId: request.params.campaignId,
            newValues: { sent: result.sent },
          },
        });

        return result;
      } catch (error) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: error instanceof Error ? error.message : 'Cannot send reminders',
          statusCode: 400,
        });
      }
    }
  );

  // Get distribution statistics
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/distribution-stats',
    async (request) => {
      return distributionService.getStats(request.params.campaignId);
    }
  );
};
