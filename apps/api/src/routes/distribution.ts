import { FastifyPluginAsync } from 'fastify';
import { assignHcpsSchema } from '@kol360/shared';
import { requireClientAdmin } from '../middleware/rbac';
import { DistributionService } from '../services/distribution.service';
import { AuthUser } from '../plugins/auth';

const distributionService = new DistributionService();

type AccessError = { ok: false; error: string; status: 404 | 403 };
type AccessSuccess = { ok: true; campaign: { clientId: string } };
type AccessResult = AccessError | AccessSuccess;

export const distributionRoutes: FastifyPluginAsync = async (fastify) => {
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

  // List HCPs assigned to campaign
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/hcps',
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

      const hcps = await distributionService.listCampaignHcps(campaignId);
      return { items: hcps };
    }
  );

  // Assign HCPs to campaign (bulk)
  fastify.post<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/hcps',
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

      const { hcpIds } = assignHcpsSchema.parse(request.body);
      const result = await distributionService.assignHcps(campaignId, hcpIds);

      await fastify.prisma.auditLog.create({
        data: {
          userId: request.user!.sub,
          action: 'campaign.hcps_assigned',
          entityType: 'Campaign',
          entityId: campaignId,
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
      const { campaignId, hcpId } = request.params;

      const access = await verifyCampaignAccess(campaignId, request.user!);
      if (!access.ok) {
        return reply.status(access.status).send({
          error: access.status === 404 ? 'Not Found' : 'Forbidden',
          message: access.error,
          statusCode: access.status,
        });
      }

      try {
        await distributionService.removeHcp(campaignId, hcpId);

        await fastify.prisma.auditLog.create({
          data: {
            userId: request.user!.sub,
            action: 'campaign.hcp_removed',
            entityType: 'Campaign',
            entityId: campaignId,
            newValues: { hcpId },
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
      const { campaignId } = request.params;

      const access = await verifyCampaignAccess(campaignId, request.user!);
      if (!access.ok) {
        return reply.status(access.status).send({
          error: access.status === 404 ? 'Not Found' : 'Forbidden',
          message: access.error,
          statusCode: access.status,
        });
      }

      try {
        const result = await distributionService.sendInvitations(campaignId);

        await fastify.prisma.auditLog.create({
          data: {
            userId: request.user!.sub,
            action: 'campaign.invitations_sent',
            entityType: 'Campaign',
            entityId: campaignId,
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
      const { campaignId } = request.params;

      const access = await verifyCampaignAccess(campaignId, request.user!);
      if (!access.ok) {
        return reply.status(access.status).send({
          error: access.status === 404 ? 'Not Found' : 'Forbidden',
          message: access.error,
          statusCode: access.status,
        });
      }

      try {
        const result = await distributionService.sendReminders(campaignId);

        await fastify.prisma.auditLog.create({
          data: {
            userId: request.user!.sub,
            action: 'campaign.reminders_sent',
            entityType: 'Campaign',
            entityId: campaignId,
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

      return distributionService.getStats(campaignId);
    }
  );
};
