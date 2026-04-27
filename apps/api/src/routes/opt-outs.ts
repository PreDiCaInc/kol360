import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { optOutService } from '../services/opt-out.service';
import { OptOutScope } from '@prisma/client';

const createOptOutSchema = z.object({
  scope: z.enum(['CAMPAIGN', 'GLOBAL']),
  campaignId: z.string().optional(),
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
});

const resubscribeSchema = z.object({
  reason: z.string().optional(),
});

export const optOutRoutes: FastifyPluginAsync = async (fastify) => {
  // PLATFORM_ADMIN-only guard for all routes in this plugin
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.user?.role !== 'PLATFORM_ADMIN') {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Only platform admins can manage opt-outs',
        statusCode: 403,
      });
    }
  });

  // POST /api/v1/admin/opt-outs/hcp/:hcpId — create an opt-out on behalf of an HCP
  fastify.post<{
    Params: { hcpId: string };
    Body: z.infer<typeof createOptOutSchema>;
  }>('/hcp/:hcpId', async (request, reply) => {
    try {
      const body = createOptOutSchema.parse(request.body);
      const result = await optOutService.optOutHcp({
        hcpId: request.params.hcpId,
        scope: body.scope as OptOutScope,
        campaignId: body.campaignId,
        reason: body.reason,
        userId: request.user!.sub,
      });
      return result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: error.errors[0]?.message || 'Invalid input',
          statusCode: 400,
        });
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(400).send({ error: 'Bad Request', message, statusCode: 400 });
    }
  });

  // POST /api/v1/admin/opt-outs/:id/resubscribe — admin resubscribe
  fastify.post<{
    Params: { id: string };
    Body: z.infer<typeof resubscribeSchema>;
  }>('/:id/resubscribe', async (request, reply) => {
    try {
      const body = resubscribeSchema.parse(request.body || {});
      const updated = await optOutService.resubscribeHcp({
        optOutId: request.params.id,
        userId: request.user!.sub,
        reason: body.reason,
      });
      return updated;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: error.errors[0]?.message || 'Invalid input',
          statusCode: 400,
        });
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(400).send({ error: 'Bad Request', message, statusCode: 400 });
    }
  });

  // GET /api/v1/admin/opt-outs/hcp/:hcpId/status — current opt-out status for an HCP
  fastify.get<{
    Params: { hcpId: string };
    Querystring: { campaignId?: string };
  }>('/hcp/:hcpId/status', async (request) => {
    return optOutService.getHcpOptOutStatus(request.params.hcpId, request.query.campaignId);
  });

  // GET /api/v1/admin/opt-outs — list all opt-outs with filters
  fastify.get<{
    Querystring: {
      page?: string;
      limit?: string;
      search?: string;
      scope?: string;
      status?: string;
      campaignId?: string;
      sortBy?: string;
      sortOrder?: string;
    };
  }>('/', async (request) => {
    const { page, limit, search, scope, status, campaignId, sortBy, sortOrder } = request.query;
    return optOutService.list({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
      scope: scope as OptOutScope | 'ALL' | undefined,
      status: status as 'active' | 'resubscribed' | 'all' | undefined,
      campaignId,
      sortBy: sortBy as 'optedOutAt' | 'email' | 'scope' | undefined,
      sortOrder: sortOrder as 'asc' | 'desc' | undefined,
    });
  });
};
