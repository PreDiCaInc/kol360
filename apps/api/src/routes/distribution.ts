import { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { assignHcpsSchema } from '@kol360/shared';
import { requireClientAdmin } from '../middleware/rbac';
import { distributionService } from '../services/distribution.service';
import { createAuditLog } from '../lib/audit';

const campaignIdSchema = z.object({
  campaignId: z.string().cuid(),
});

export const distributionRoutes: FastifyPluginAsync = async (fastify) => {
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

  // Get distribution statistics
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/distribution/stats',
    async (request, reply) => {
      const result = campaignIdSchema.safeParse(request.params);
      if (!result.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid campaign ID',
          statusCode: 400,
        });
      }

      const hasAccess = await verifyCampaignAccess(result.data.campaignId, request.user!, reply);
      if (!hasAccess) return;

      return distributionService.getStats(result.data.campaignId);
    }
  );

  // Legacy endpoint for stats (backward compatibility)
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/distribution-stats',
    async (request, reply) => {
      const hasAccess = await verifyCampaignAccess(request.params.campaignId, request.user!, reply);
      if (!hasAccess) return;

      return distributionService.getStats(request.params.campaignId);
    }
  );

  // List HCPs with email/response status (paginated)
  fastify.get<{
    Params: { campaignId: string };
    Querystring: { status?: string; page?: string; limit?: string };
  }>(
    '/campaigns/:campaignId/distribution',
    async (request, reply) => {
      const hasAccess = await verifyCampaignAccess(request.params.campaignId, request.user!, reply);
      if (!hasAccess) return;

      const { status, page = '1', limit = '50' } = request.query;

      return distributionService.listHcps(request.params.campaignId, {
        status,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
      });
    }
  );

  // List HCPs assigned to campaign (legacy endpoint)
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/hcps',
    async (request, reply) => {
      const hasAccess = await verifyCampaignAccess(request.params.campaignId, request.user!, reply);
      if (!hasAccess) return;

      const hcps = await distributionService.listCampaignHcps(request.params.campaignId);
      return { items: hcps };
    }
  );

  // Assign HCPs to campaign (bulk)
  fastify.post<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/hcps',
    async (request, reply) => {
      const hasAccess = await verifyCampaignAccess(request.params.campaignId, request.user!, reply);
      if (!hasAccess) return;

      const { hcpIds } = assignHcpsSchema.parse(request.body);
      const result = await distributionService.assignHcps(request.params.campaignId, hcpIds);

      await createAuditLog(request.user!.sub, {
        action: 'campaign.hcps_assigned',
        entityType: 'Campaign',
        entityId: request.params.campaignId,
        newValues: { added: result.added, skipped: result.skipped },
      });

      return result;
    }
  );

  // Remove HCP from campaign
  fastify.delete<{ Params: { campaignId: string; hcpId: string } }>(
    '/campaigns/:campaignId/hcps/:hcpId',
    async (request, reply) => {
      const hasAccess = await verifyCampaignAccess(request.params.campaignId, request.user!, reply);
      if (!hasAccess) return;

      try {
        await distributionService.removeHcp(request.params.campaignId, request.params.hcpId);

        await createAuditLog(request.user!.sub, {
          action: 'campaign.hcp_removed',
          entityType: 'Campaign',
          entityId: request.params.campaignId,
          newValues: { hcpId: request.params.hcpId },
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

  // Send all pending invitations
  fastify.post<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/distribution/send-invitations',
    async (request, reply) => {
      const hasAccess = await verifyCampaignAccess(request.params.campaignId, request.user!, reply);
      if (!hasAccess) return;

      try {
        const result = await distributionService.sendInvitations(request.params.campaignId);

        await createAuditLog(request.user!.sub, {
          action: 'distribution.invitations_sent',
          entityType: 'Campaign',
          entityId: request.params.campaignId,
          newValues: {
            sent: result.sent,
            failed: result.failed,
            skipped: result.skipped,
          },
        });

        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to send invitations';
        return reply.status(400).send({ error: 'Bad Request', message, statusCode: 400 });
      }
    }
  );

  // Legacy endpoint for sending invitations (backward compatibility)
  fastify.post<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/send-invitations',
    async (request, reply) => {
      const hasAccess = await verifyCampaignAccess(request.params.campaignId, request.user!, reply);
      if (!hasAccess) return;

      try {
        const result = await distributionService.sendInvitations(request.params.campaignId);

        await createAuditLog(request.user!.sub, {
          action: 'campaign.invitations_sent',
          entityType: 'Campaign',
          entityId: request.params.campaignId,
          newValues: { sent: result.sent, failed: result.failed },
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

  // Send reminders to non-responders
  fastify.post<{
    Params: { campaignId: string };
    Body: { maxReminders?: number };
  }>(
    '/campaigns/:campaignId/distribution/send-reminders',
    async (request, reply) => {
      const hasAccess = await verifyCampaignAccess(request.params.campaignId, request.user!, reply);
      if (!hasAccess) return;

      try {
        const { maxReminders = 3 } = request.body || {};
        const result = await distributionService.sendReminders(request.params.campaignId, maxReminders);

        await createAuditLog(request.user!.sub, {
          action: 'distribution.reminders_sent',
          entityType: 'Campaign',
          entityId: request.params.campaignId,
          newValues: {
            sent: result.sent,
            failed: result.failed,
            skipped: result.skipped,
            maxReminders,
          },
        });

        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to send reminders';
        return reply.status(400).send({ error: 'Bad Request', message, statusCode: 400 });
      }
    }
  );

  // Legacy endpoint for sending reminders (backward compatibility)
  fastify.post<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/send-reminders',
    async (request, reply) => {
      const hasAccess = await verifyCampaignAccess(request.params.campaignId, request.user!, reply);
      if (!hasAccess) return;

      try {
        const result = await distributionService.sendReminders(request.params.campaignId);

        await createAuditLog(request.user!.sub, {
          action: 'campaign.reminders_sent',
          entityType: 'Campaign',
          entityId: request.params.campaignId,
          newValues: { sent: result.sent },
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

  // Send single invitation (resend to specific HCP)
  fastify.post<{ Params: { campaignId: string; hcpId: string } }>(
    '/campaigns/:campaignId/distribution/:hcpId/send',
    async (request, reply) => {
      const { campaignId, hcpId } = request.params;

      const hasAccess = await verifyCampaignAccess(campaignId, request.user!, reply);
      if (!hasAccess) return;

      try {
        const result = await distributionService.sendSingleInvitation(campaignId, hcpId);

        await createAuditLog(request.user!.sub, {
          action: 'distribution.invitation_sent',
          entityType: 'CampaignHcp',
          entityId: `${campaignId}:${hcpId}`,
          newValues: { messageId: result.messageId },
        });

        return { success: true, messageId: result.messageId };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to send invitation';
        return reply.status(400).send({ error: 'Bad Request', message, statusCode: 400 });
      }
    }
  );
};
