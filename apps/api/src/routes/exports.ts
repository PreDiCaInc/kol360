import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import multipart from '@fastify/multipart';
import { requireClientAdmin, requirePlatformAdmin } from '../middleware/rbac';
import { exportService } from '../services/export.service';
import { createAuditLog } from '../lib/audit';
import { PaymentStatus } from '@prisma/client';

const campaignIdSchema = z.object({
  id: z.string().cuid(),
});

export const exportRoutes: FastifyPluginAsync = async (fastify) => {
  // Register multipart for file uploads
  await fastify.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  // Export responses - requires at least client admin
  fastify.post<{ Params: z.infer<typeof campaignIdSchema> }>(
    '/:id/export/responses',
    { preHandler: requireClientAdmin() },
    async (request, reply) => {
      const { id: campaignId } = campaignIdSchema.parse(request.params);

      try {
        const result = await exportService.exportResponses(campaignId);

        await createAuditLog(request.user!.sub, {
          action: 'export.responses',
          entityType: 'Campaign',
          entityId: campaignId,
          newValues: { recordCount: result.recordCount, filename: result.filename },
        });

        reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        reply.header('Content-Disposition', `attachment; filename="${result.filename}"`);
        return reply.send(result.buffer);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Export failed';
        return reply.status(400).send({ error: 'Bad Request', message, statusCode: 400 });
      }
    }
  );

  // Export scores - requires at least client admin
  fastify.post<{ Params: z.infer<typeof campaignIdSchema> }>(
    '/:id/export/scores',
    { preHandler: requireClientAdmin() },
    async (request, reply) => {
      const { id: campaignId } = campaignIdSchema.parse(request.params);

      try {
        const result = await exportService.exportScores(campaignId);

        await createAuditLog(request.user!.sub, {
          action: 'export.scores',
          entityType: 'Campaign',
          entityId: campaignId,
          newValues: { recordCount: result.recordCount, filename: result.filename },
        });

        reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        reply.header('Content-Disposition', `attachment; filename="${result.filename}"`);
        return reply.send(result.buffer);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Export failed';
        return reply.status(400).send({ error: 'Bad Request', message, statusCode: 400 });
      }
    }
  );

  // Export payments - platform admin only
  fastify.post<{ Params: z.infer<typeof campaignIdSchema> }>(
    '/:id/export/payments',
    { preHandler: requirePlatformAdmin() },
    async (request, reply) => {
      const { id: campaignId } = campaignIdSchema.parse(request.params);

      try {
        const result = await exportService.exportPayments(campaignId, request.user!.sub);

        await createAuditLog(request.user!.sub, {
          action: 'export.payments',
          entityType: 'Campaign',
          entityId: campaignId,
          newValues: { recordCount: result.recordCount, filename: result.filename },
        });

        reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        reply.header('Content-Disposition', `attachment; filename="${result.filename}"`);
        return reply.send(result.buffer);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Export failed';
        return reply.status(400).send({ error: 'Bad Request', message, statusCode: 400 });
      }
    }
  );

  // Re-export payments (download again without changing status) - platform admin only
  fastify.post<{ Params: z.infer<typeof campaignIdSchema> }>(
    '/:id/export/payments/reexport',
    { preHandler: requirePlatformAdmin() },
    async (request, reply) => {
      const { id: campaignId } = campaignIdSchema.parse(request.params);

      try {
        const result = await exportService.reExportPayments(campaignId);

        await createAuditLog(request.user!.sub, {
          action: 'export.payments.reexport',
          entityType: 'Campaign',
          entityId: campaignId,
          newValues: { recordCount: result.recordCount, filename: result.filename },
        });

        reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        reply.header('Content-Disposition', `attachment; filename="${result.filename}"`);
        return reply.send(result.buffer);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Re-export failed';
        return reply.status(400).send({ error: 'Bad Request', message, statusCode: 400 });
      }
    }
  );

  // List payments
  fastify.get<{
    Params: z.infer<typeof campaignIdSchema>;
    Querystring: { status?: string; page?: string; limit?: string };
  }>(
    '/:id/payments',
    { preHandler: requireClientAdmin() },
    async (request) => {
      const { id: campaignId } = campaignIdSchema.parse(request.params);
      const { status, page = '1', limit = '20' } = request.query;

      return exportService.listPayments(campaignId, {
        status: status as PaymentStatus | undefined,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
      });
    }
  );

  // Get payment stats
  fastify.get<{ Params: z.infer<typeof campaignIdSchema> }>(
    '/:id/payments/stats',
    { preHandler: requireClientAdmin() },
    async (request) => {
      const { id: campaignId } = campaignIdSchema.parse(request.params);
      return exportService.getPaymentStats(campaignId);
    }
  );

  // Import payment status
  fastify.post<{ Params: z.infer<typeof campaignIdSchema> }>(
    '/:id/payments/import-status',
    { preHandler: requirePlatformAdmin() },
    async (request, reply) => {
      const { id: campaignId } = campaignIdSchema.parse(request.params);

      const file = await request.file();
      if (!file) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'No file uploaded',
          statusCode: 400,
        });
      }

      try {
        const buffer = await file.toBuffer();
        const result = await exportService.importPaymentStatus(
          campaignId,
          buffer,
          request.user!.sub
        );

        await createAuditLog(request.user!.sub, {
          action: 'import.payment_status',
          entityType: 'Campaign',
          entityId: campaignId,
          newValues: {
            processed: result.processed,
            updated: result.updated,
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
