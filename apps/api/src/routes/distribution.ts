import { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { assignHcpsSchema } from '@kol360/shared';
import { requireTenantUser, gateWritesToAdmins } from '../middleware/rbac';
import { distributionService } from '../services/distribution.service';
import { createAuditLog } from '../lib/audit';
import { importProgressStore } from '../services/import-progress.service';
import { logger } from '../lib/logger';
import multipart from '@fastify/multipart';

const campaignIdSchema = z.object({
  campaignId: z.string().cuid(),
});

export const distributionRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit
  // v1.17.17: tenant-user gate (TEAM_MEMBER read); writes admin-only.
  fastify.addHook('preHandler', requireTenantUser());
  fastify.addHook('preHandler', gateWritesToAdmins());

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

      const result = await distributionService.listHcps(request.params.campaignId, {
        status,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
      });

      // Strip surveyToken for non-PLATFORM_ADMIN users (security: prevent CLIENT_ADMIN from impersonating HCPs)
      if (request.user!.role !== 'PLATFORM_ADMIN') {
        result.items = result.items.map((item) => {
          const cleaned = { ...item };
          delete (cleaned as Record<string, unknown>).surveyToken;
          return cleaned;
        });
      }

      return result;
    }
  );

  // Survey status list — enriched view of campaign HCPs with derived status
  fastify.get<{
    Params: { campaignId: string };
    Querystring: {
      page?: string;
      limit?: string;
      search?: string;
      status?: string;  // comma-separated list for multi-select (e.g. 'completed,in_progress')
      sortBy?: string;
      sortOrder?: string;
    };
  }>(
    '/campaigns/:campaignId/survey-status',
    async (request, reply) => {
      const hasAccess = await verifyCampaignAccess(request.params.campaignId, request.user!, reply);
      if (!hasAccess) return;

      const { page, limit, search, status, sortBy, sortOrder } = request.query;

      const result = await distributionService.getSurveyStatusList(request.params.campaignId, {
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
        search,
        status, // comma-separated string; service splits into array
        sortBy: sortBy as 'firstName' | 'lastName' | 'specialty' | 'state' | 'status' | 'date' | 'lastQuestion' | undefined,
        sortOrder: sortOrder as 'asc' | 'desc' | undefined,
      });

      // Strip surveyToken for non-PLATFORM_ADMIN users (security: prevent client admins from impersonating HCPs)
      if (request.user!.role !== 'PLATFORM_ADMIN') {
        result.items = result.items.map((item) => {
          const cleaned = { ...item };
          delete (cleaned as Record<string, unknown>).surveyToken;
          return cleaned;
        });
      }

      return result;
    }
  );

  // List HCPs assigned to campaign (legacy endpoint)
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/hcps',
    async (request, reply) => {
      const hasAccess = await verifyCampaignAccess(request.params.campaignId, request.user!, reply);
      if (!hasAccess) return;

      const hcps = await distributionService.listCampaignHcps(request.params.campaignId);

      // Strip surveyToken for non-PLATFORM_ADMIN users
      if (request.user!.role !== 'PLATFORM_ADMIN') {
        return { items: hcps.map((item) => {
          const cleaned = { ...item };
          delete (cleaned as Record<string, unknown>).surveyToken;
          return cleaned;
        }) };
      }

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

  // Send all pending invitations (fire-and-forget with progress tracking)
  fastify.post<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/distribution/send-invitations',
    async (request, reply) => {
      const { campaignId } = request.params;
      const hasAccess = await verifyCampaignAccess(campaignId, request.user!, reply);
      if (!hasAccess) return;

      // Concurrent-send guard: check if already running for this campaign
      const activeKey = `email-inv:${campaignId}`;
      const existing = importProgressStore.findActiveByKey(activeKey);
      if (existing) {
        return { progressId: existing.id, status: 'already-running' };
      }

      const progressId = `${activeKey}:${Date.now()}`;

      // Create progress entry SYNCHRONOUSLY before fire-and-forget to prevent race condition
      importProgressStore.start(progressId, 'email-invitations', 0);

      // Fire and forget — don't await
      distributionService.sendInvitations(campaignId, progressId)
        .then(async (result) => {
          await createAuditLog(request.user!.sub, {
            action: 'distribution.invitations_sent',
            entityType: 'Campaign',
            entityId: campaignId,
            newValues: { sent: result.sent, failed: result.failed, skipped: result.skipped },
          }).catch(() => {}); // Audit log failure should not affect send result
        })
        .catch((error) => {
          logger.error('Background send-invitations failed', { campaignId, progressId }, error instanceof Error ? error : undefined);
          // Only mark failed if still processing (emailService may have already completed it)
          const current = importProgressStore.get(progressId);
          if (current?.status === 'processing') {
            importProgressStore.complete(progressId, { created: 0, updated: 0, errors: 1 });
          }
        });

      return { progressId, status: 'started' };
    }
  );

  // Legacy endpoint for sending invitations (backward compatibility — also fire-and-forget)
  fastify.post<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/send-invitations',
    async (request, reply) => {
      const { campaignId } = request.params;
      const hasAccess = await verifyCampaignAccess(campaignId, request.user!, reply);
      if (!hasAccess) return;

      const activeKey = `email-inv:${campaignId}`;
      const existing = importProgressStore.findActiveByKey(activeKey);
      if (existing) {
        return { progressId: existing.id, status: 'already-running' };
      }

      const progressId = `${activeKey}:${Date.now()}`;

      // Create progress entry SYNCHRONOUSLY before fire-and-forget to prevent race condition
      importProgressStore.start(progressId, 'email-invitations', 0);

      distributionService.sendInvitations(campaignId, progressId)
        .then(async (result) => {
          await createAuditLog(request.user!.sub, {
            action: 'campaign.invitations_sent',
            entityType: 'Campaign',
            entityId: campaignId,
            newValues: { sent: result.sent, failed: result.failed },
          }).catch(() => {});
        })
        .catch((error) => {
          logger.error('Background send-invitations (legacy) failed', { campaignId, progressId }, error instanceof Error ? error : undefined);
          const current = importProgressStore.get(progressId);
          if (current?.status === 'processing') {
            importProgressStore.complete(progressId, { created: 0, updated: 0, errors: 1 });
          }
        });

      return { progressId, status: 'started' };
    }
  );

  // Send reminders to non-responders (fire-and-forget with progress tracking)
  fastify.post<{
    Params: { campaignId: string };
    Body: { maxReminders?: number };
  }>(
    '/campaigns/:campaignId/distribution/send-reminders',
    async (request, reply) => {
      const { campaignId } = request.params;
      const hasAccess = await verifyCampaignAccess(campaignId, request.user!, reply);
      if (!hasAccess) return;

      // Concurrent-send guard
      const activeKey = `email-rem:${campaignId}`;
      const existing = importProgressStore.findActiveByKey(activeKey);
      if (existing) {
        return { progressId: existing.id, status: 'already-running' };
      }

      const progressId = `${activeKey}:${Date.now()}`;
      const { maxReminders = 3 } = request.body || {};

      // Create progress entry SYNCHRONOUSLY before fire-and-forget to prevent race condition
      importProgressStore.start(progressId, 'email-reminders', 0);

      // Fire and forget — don't await
      distributionService.sendReminders(campaignId, maxReminders, progressId)
        .then(async (result) => {
          await createAuditLog(request.user!.sub, {
            action: 'distribution.reminders_sent',
            entityType: 'Campaign',
            entityId: campaignId,
            newValues: { sent: result.sent, failed: result.failed, skipped: result.skipped, maxReminders },
          }).catch(() => {});
        })
        .catch((error) => {
          logger.error('Background send-reminders failed', { campaignId, progressId }, error instanceof Error ? error : undefined);
          const current = importProgressStore.get(progressId);
          if (current?.status === 'processing') {
            importProgressStore.complete(progressId, { created: 0, updated: 0, errors: 1 });
          }
        });

      return { progressId, status: 'started' };
    }
  );

  // Poll email send progress
  fastify.get<{ Params: { campaignId: string; progressId: string } }>(
    '/campaigns/:campaignId/distribution/progress/:progressId',
    async (request, reply) => {
      const { campaignId, progressId } = request.params;
      const hasAccess = await verifyCampaignAccess(campaignId, request.user!, reply);
      if (!hasAccess) return;

      const progress = importProgressStore.get(progressId);
      if (!progress) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Progress not found or expired',
          statusCode: 404,
        });
      }

      return progress;
    }
  );

  // Legacy endpoint for sending reminders (backward compatibility — also fire-and-forget)
  fastify.post<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/send-reminders',
    async (request, reply) => {
      const { campaignId } = request.params;
      const hasAccess = await verifyCampaignAccess(campaignId, request.user!, reply);
      if (!hasAccess) return;

      const activeKey = `email-rem:${campaignId}`;
      const existing = importProgressStore.findActiveByKey(activeKey);
      if (existing) {
        return { progressId: existing.id, status: 'already-running' };
      }

      const progressId = `${activeKey}:${Date.now()}`;

      // Create progress entry SYNCHRONOUSLY before fire-and-forget to prevent race condition
      importProgressStore.start(progressId, 'email-reminders', 0);

      distributionService.sendReminders(campaignId, 3, progressId)
        .then(async (result) => {
          await createAuditLog(request.user!.sub, {
            action: 'campaign.reminders_sent',
            entityType: 'Campaign',
            entityId: campaignId,
            newValues: { sent: result.sent },
          }).catch(() => {});
        })
        .catch((error) => {
          logger.error('Background send-reminders (legacy) failed', { campaignId, progressId }, error instanceof Error ? error : undefined);
          const current = importProgressStore.get(progressId);
          if (current?.status === 'processing') {
            importProgressStore.complete(progressId, { created: 0, updated: 0, errors: 1 });
          }
        });

      return { progressId, status: 'started' };
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

  // Import HCPs from Excel/CSV file and assign to campaign
  fastify.post<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/import-hcps',
    async (request, reply) => {
      const { campaignId } = request.params;

      const hasAccess = await verifyCampaignAccess(campaignId, request.user!, reply);
      if (!hasAccess) return;

      const file = await request.file();
      if (!file) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'No file uploaded',
          statusCode: 400,
        });
      }

      const filename = file.filename.toLowerCase();
      if (!filename.endsWith('.xlsx') && !filename.endsWith('.xls') && !filename.endsWith('.csv')) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Unsupported file format. Please use .xlsx, .xls, or .csv files.',
          statusCode: 400,
        });
      }

      try {
        const buffer = await file.toBuffer();
        const result = await distributionService.importHcpsFromFile(
          campaignId,
          buffer,
          file.filename,
          request.user!.sub
        );

        // v1.17.35: summary row carries the new batchId pointer + the
        // fileName so the audit-log query "where did this campaign get
        // populated from" is one SELECT. Per-row hcp.created /
        // hcp.updated rows are emitted from the service.
        await createAuditLog(request.user!.sub, {
          action: 'campaign.hcps_imported',
          entityType: 'Campaign',
          entityId: campaignId,
          newValues: {
            batchId: result.batchId,
            fileName: file.filename,
            hcpsCreated: result.hcpsCreated,
            hcpsExisting: result.hcpsExisting,
            addedToCampaign: result.addedToCampaign,
            skipped: result.skipped,
            errors: result.errors.length,
          },
        });

        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Import failed';
        return reply.status(400).send({ error: 'Bad Request', message, statusCode: 400 });
      }
    }
  );
};
