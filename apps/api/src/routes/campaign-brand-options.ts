import { FastifyPluginAsync } from 'fastify';
import { upsertBrandOptionsSchema } from '@kol360/shared';
import { requireTenantUser, gateWritesToAdmins } from '../middleware/rbac';
import {
  BrandsFrozenError,
  CampaignBrandOptionService,
} from '../services/campaign-brand-option.service';
import { CampaignService } from '../services/campaign.service';
import { createAuditLog } from '../lib/audit';

const brandOptionService = new CampaignBrandOptionService();
const campaignService = new CampaignService();

/**
 * Brand-Affinity Grid — CampaignBrandOption CRUD routes (Phase 1).
 *
 * Mounted under `/api/v1/campaigns`. Shares the prefix with
 * `campaignRoutes` — Fastify allows multiple plugins at the same
 * prefix and merges their route trees.
 *
 * Read is tenant-user-gated; write is admin-only (matches
 * campaignRoutes' RBAC pattern).
 */
export const campaignBrandOptionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireTenantUser());
  fastify.addHook('preHandler', gateWritesToAdmins());

  // Helper — 404 or tenant guard on the campaign before doing anything else.
  async function guardCampaign(
    id: string,
    request: import('fastify').FastifyRequest,
    reply: import('fastify').FastifyReply
  ) {
    const campaign = await campaignService.getById(id);
    if (!campaign) {
      reply.status(404).send({
        error: 'Not Found',
        message: 'Campaign not found',
        statusCode: 404,
      });
      return null;
    }
    if (
      request.user!.role !== 'PLATFORM_ADMIN' &&
      campaign.clientId !== request.user!.tenantId
    ) {
      reply.status(403).send({
        error: 'Forbidden',
        message: 'Cannot access campaigns from other tenants',
        statusCode: 403,
      });
      return null;
    }
    return campaign;
  }

  // GET /:id/brand-options — list brand options + freeze status.
  fastify.get<{ Params: { id: string } }>(
    '/:id/brand-options',
    async (request, reply) => {
      const campaign = await guardCampaign(request.params.id, request, reply);
      if (!campaign) return;

      const brandOptions = await brandOptionService.list(request.params.id);
      return {
        brandOptions,
        brandsFrozenAt: campaign.brandsFrozenAt ?? null,
      };
    }
  );

  // PUT /:id/brand-options — full-replacement upsert.
  //   409 if brandsFrozenAt is set (spec item O).
  //   400 on Zod validation failure.
  fastify.put<{ Params: { id: string } }>(
    '/:id/brand-options',
    async (request, reply) => {
      const campaign = await guardCampaign(request.params.id, request, reply);
      if (!campaign) return;

      const parsed = upsertBrandOptionsSchema.parse(request.body);

      try {
        const brandOptions = await brandOptionService.upsert(
          request.params.id,
          parsed.brands
        );

        await createAuditLog(request.user!.sub, {
          action: 'campaign.brand_options_updated',
          entityType: 'Campaign',
          entityId: request.params.id,
          newValues: {
            brandCount: brandOptions.length,
            brandNames: brandOptions.map((b) => b.brandName),
          },
          tenantId: campaign.clientId,
        });

        return { brandOptions };
      } catch (err) {
        if (err instanceof BrandsFrozenError) {
          return reply.status(409).send({
            error: 'Conflict',
            message: err.message,
            statusCode: 409,
            brandsFrozenAt: err.frozenAt.toISOString(),
          });
        }
        throw err;
      }
    }
  );
};
