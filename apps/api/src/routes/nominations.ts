import { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nominationService } from '../services/nomination.service';
// score-calculation.service removed in Phase 3 PR A. The campaign-level
// post-bulk-match recalc calls are gone — the KOL Analysis recalc happens
// on /publish (or via the explicit Recalculate button on the analysis page).
import {
  nominationListQuerySchema,
  matchNominationSchema,
  createHcpFromNominationSchema,
  updateNominationRawNameSchema,
  excludeNominationSchema,
  bulkExcludeNominationsSchema,
  bulkAcceptNominationsSchema,
  nominationTopSuggestionsSchema,
  idParamSchema,
} from '@kol360/shared';

const campaignIdParamSchema = z.object({
  id: z.string().cuid(),
});

const nominationIdParamSchema = z.object({
  id: z.string().cuid(),
  nid: z.string().cuid(),
});

const nominationOnlyParamSchema = z.object({
  nid: z.string().cuid(),
});

export const nominationRoutes: FastifyPluginAsync = async (fastify) => {
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

  // List nominations for a campaign
  fastify.get<{
    Params: z.infer<typeof campaignIdParamSchema>;
    Querystring: z.infer<typeof nominationListQuerySchema>;
  }>('/:id/nominations', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const { id: campaignId } = campaignIdParamSchema.parse(request.params);

    // Verify campaign belongs to user's tenant
    const hasAccess = await verifyCampaignAccess(campaignId, request.user, reply);
    if (!hasAccess) return;

    const query = nominationListQuerySchema.parse(request.query);

    const result = await nominationService.listForCampaign(campaignId, query);
    return result;
  });

  // Get nomination stats for a campaign
  fastify.get<{
    Params: z.infer<typeof campaignIdParamSchema>;
  }>('/:id/nominations/stats', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const { id: campaignId } = campaignIdParamSchema.parse(request.params);

    // Verify campaign belongs to user's tenant
    const hasAccess = await verifyCampaignAccess(campaignId, request.user, reply);
    if (!hasAccess) return;

    const stats = await nominationService.getStats(campaignId);
    return stats;
  });

  // Bulk auto-match nominations (PLATFORM_ADMIN only)
  fastify.post<{
    Params: z.infer<typeof campaignIdParamSchema>;
  }>('/:id/nominations/bulk-match', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    // Only platform admins can modify nominations
    if (request.user.role !== 'PLATFORM_ADMIN') {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Only platform administrators can modify nominations',
        statusCode: 403,
      });
    }

    const { id: campaignId } = campaignIdParamSchema.parse(request.params);

    // Verify campaign belongs to user's tenant
    const hasAccess = await verifyCampaignAccess(campaignId, request.user, reply);
    if (!hasAccess) return;

    try {
      const result = await nominationService.bulkAutoMatch(campaignId, request.user.sub);
      // Campaign-level survey/composite recalc was here pre-v1.16.0; removed in
      // Phase 3 PR A. The KOL Analysis recalc fires on /publish (auto) or via
      // the explicit Recalculate button on the analysis page.
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to bulk match';
      return reply.status(400).send({ message });
    }
  });

  // Get suggestions for a nomination
  fastify.get<{
    Params: z.infer<typeof nominationIdParamSchema>;
  }>('/:id/nominations/:nid/suggestions', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const { id: campaignId, nid: nominationId } = nominationIdParamSchema.parse(request.params);

    // Verify campaign belongs to user's tenant
    const hasAccess = await verifyCampaignAccess(campaignId, request.user, reply);
    if (!hasAccess) return;

    const suggestions = await nominationService.getSuggestions(nominationId);
    return suggestions;
  });

  // Match nomination to existing HCP (PLATFORM_ADMIN only)
  fastify.post<{
    Params: z.infer<typeof nominationIdParamSchema>;
    Body: z.infer<typeof matchNominationSchema>;
  }>('/:id/nominations/:nid/match', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    // Only platform admins can modify nominations
    if (request.user.role !== 'PLATFORM_ADMIN') {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Only platform administrators can modify nominations',
        statusCode: 403,
      });
    }

    const { id: campaignId, nid: nominationId } = nominationIdParamSchema.parse(request.params);

    // Verify campaign belongs to user's tenant
    const hasAccess = await verifyCampaignAccess(campaignId, request.user, reply);
    if (!hasAccess) return;

    const { hcpId, addAlias, matchType, matchConfidence } = matchNominationSchema.parse(request.body);

    try {
      const result = await nominationService.matchToHcp(
        nominationId,
        hcpId,
        addAlias,
        request.user.sub,
        matchType,
        matchConfidence,
        true // isManual — human picked this from the dialog, mark as MATCHED
      );
      // Campaign-level score recalc removed in Phase 3 PR A — see /publish.
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to match nomination';
      return reply.status(400).send({ message });
    }
  });

  // Create new HCP and match nomination (PLATFORM_ADMIN only)
  fastify.post<{
    Params: z.infer<typeof nominationIdParamSchema>;
    Body: z.infer<typeof createHcpFromNominationSchema>;
  }>('/:id/nominations/:nid/create-hcp', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    // Only platform admins can modify nominations
    if (request.user.role !== 'PLATFORM_ADMIN') {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Only platform administrators can modify nominations',
        statusCode: 403,
      });
    }

    const { id: campaignId, nid: nominationId } = nominationIdParamSchema.parse(request.params);

    // Verify campaign belongs to user's tenant
    const hasAccess = await verifyCampaignAccess(campaignId, request.user, reply);
    if (!hasAccess) return;

    const hcpData = createHcpFromNominationSchema.parse(request.body);

    try {
      const result = await nominationService.createHcpAndMatch(
        nominationId,
        hcpData,
        request.user.sub
      );
      // Campaign-level score recalc removed in Phase 3 PR A — see /publish.
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create HCP';
      return reply.status(400).send({ message });
    }
  });

  // Exclude nomination (PLATFORM_ADMIN only)
  fastify.post<{
    Params: z.infer<typeof nominationIdParamSchema>;
    Body: z.infer<typeof excludeNominationSchema>;
  }>('/:id/nominations/:nid/exclude', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    // Only platform admins can modify nominations
    if (request.user.role !== 'PLATFORM_ADMIN') {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Only platform administrators can modify nominations',
        statusCode: 403,
      });
    }

    const { id: campaignId, nid: nominationId } = nominationIdParamSchema.parse(request.params);

    // Verify campaign belongs to user's tenant
    const hasAccess = await verifyCampaignAccess(campaignId, request.user, reply);
    if (!hasAccess) return;

    const { reason } = excludeNominationSchema.parse(request.body);

    try {
      const result = await nominationService.exclude(nominationId, request.user.sub, reason);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to exclude nomination';
      return reply.status(400).send({ message });
    }
  });

  // Batch top-suggestion lookup — page-level helper for the inline accept link.
  // POST (not GET) because the request body can hold up to 200 ids; URL-arg
  // limits would force ugly chunking on the client. Read-only — no mutation.
  fastify.post<{
    Params: z.infer<typeof campaignIdParamSchema>;
    Body: z.infer<typeof nominationTopSuggestionsSchema>;
  }>('/:id/nominations/top-suggestions', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }
    const { id: campaignId } = campaignIdParamSchema.parse(request.params);
    const hasAccess = await verifyCampaignAccess(campaignId, request.user, reply);
    if (!hasAccess) return;

    try {
      const { nominationIds } = nominationTopSuggestionsSchema.parse(request.body);
      const result = await nominationService.getTopSuggestions(campaignId, nominationIds);
      return result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: error.errors[0]?.message || 'Invalid input',
          statusCode: 400,
        });
      }
      const message = error instanceof Error ? error.message : 'Failed to load top suggestions';
      return reply.status(400).send({ message });
    }
  });

  // Bulk-accept the top suggestion for each given nomination (PLATFORM_ADMIN only).
  // The client is responsible for the <90% confirmation gate before calling this.
  fastify.post<{
    Params: z.infer<typeof campaignIdParamSchema>;
    Body: z.infer<typeof bulkAcceptNominationsSchema>;
  }>('/:id/nominations/bulk-accept', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }
    if (request.user.role !== 'PLATFORM_ADMIN') {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Only platform administrators can modify nominations',
        statusCode: 403,
      });
    }

    const { id: campaignId } = campaignIdParamSchema.parse(request.params);
    const hasAccess = await verifyCampaignAccess(campaignId, request.user, reply);
    if (!hasAccess) return;

    try {
      const { nominationIds } = bulkAcceptNominationsSchema.parse(request.body);
      const result = await nominationService.bulkAccept(campaignId, nominationIds, request.user.sub);
      // Campaign-level score recalc removed in Phase 3 PR A — see /publish.
      return result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: error.errors[0]?.message || 'Invalid input',
          statusCode: 400,
        });
      }
      const message = error instanceof Error ? error.message : 'Failed to bulk accept';
      return reply.status(400).send({ message });
    }
  });

  // Bulk exclude multiple nominations (PLATFORM_ADMIN only)
  fastify.post<{
    Params: z.infer<typeof campaignIdParamSchema>;
    Body: z.infer<typeof bulkExcludeNominationsSchema>;
  }>('/:id/nominations/bulk-exclude', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    if (request.user.role !== 'PLATFORM_ADMIN') {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Only platform administrators can modify nominations',
        statusCode: 403,
      });
    }

    const { id: campaignId } = campaignIdParamSchema.parse(request.params);

    const hasAccess = await verifyCampaignAccess(campaignId, request.user, reply);
    if (!hasAccess) return;

    try {
      const { nominationIds, reason } = bulkExcludeNominationsSchema.parse(request.body);
      const result = await nominationService.bulkExclude(nominationIds, request.user.sub, reason);
      return result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: error.errors[0]?.message || 'Invalid input',
          statusCode: 400,
        });
      }
      const message = error instanceof Error ? error.message : 'Failed to bulk exclude nominations';
      return reply.status(400).send({ message });
    }
  });

  // Update raw name (fix typos) (PLATFORM_ADMIN only)
  fastify.patch<{
    Params: z.infer<typeof nominationIdParamSchema>;
    Body: z.infer<typeof updateNominationRawNameSchema>;
  }>('/:id/nominations/:nid', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    // Only platform admins can modify nominations
    if (request.user.role !== 'PLATFORM_ADMIN') {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Only platform administrators can modify nominations',
        statusCode: 403,
      });
    }

    const { id: campaignId, nid: nominationId } = nominationIdParamSchema.parse(request.params);

    // Verify campaign belongs to user's tenant
    const hasAccess = await verifyCampaignAccess(campaignId, request.user, reply);
    if (!hasAccess) return;

    const { rawNameEntered } = updateNominationRawNameSchema.parse(request.body);

    try {
      const result = await nominationService.updateRawName(nominationId, rawNameEntered);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update nomination';
      return reply.status(400).send({ message });
    }
  });
};
