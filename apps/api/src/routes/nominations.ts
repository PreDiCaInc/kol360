import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nominationService } from '../services/nomination.service';
import {
  nominationListQuerySchema,
  matchNominationSchema,
  createHcpFromNominationSchema,
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
  // List nominations for a campaign
  fastify.get<{
    Params: z.infer<typeof campaignIdParamSchema>;
    Querystring: z.infer<typeof nominationListQuerySchema>;
  }>('/:id/nominations', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const { id: campaignId } = campaignIdParamSchema.parse(request.params);
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
    const stats = await nominationService.getStats(campaignId);
    return stats;
  });

  // Bulk auto-match nominations
  fastify.post<{
    Params: z.infer<typeof campaignIdParamSchema>;
  }>('/:id/nominations/bulk-match', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const { id: campaignId } = campaignIdParamSchema.parse(request.params);

    try {
      const result = await nominationService.bulkAutoMatch(campaignId, request.user.sub);
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

    const { nid: nominationId } = nominationIdParamSchema.parse(request.params);
    const suggestions = await nominationService.getSuggestions(nominationId);
    return suggestions;
  });

  // Match nomination to existing HCP
  fastify.post<{
    Params: z.infer<typeof nominationIdParamSchema>;
    Body: z.infer<typeof matchNominationSchema>;
  }>('/:id/nominations/:nid/match', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const { nid: nominationId } = nominationIdParamSchema.parse(request.params);
    const { hcpId, addAlias } = matchNominationSchema.parse(request.body);

    try {
      const result = await nominationService.matchToHcp(
        nominationId,
        hcpId,
        addAlias,
        request.user.sub
      );
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to match nomination';
      return reply.status(400).send({ message });
    }
  });

  // Create new HCP and match nomination
  fastify.post<{
    Params: z.infer<typeof nominationIdParamSchema>;
    Body: z.infer<typeof createHcpFromNominationSchema>;
  }>('/:id/nominations/:nid/create-hcp', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const { nid: nominationId } = nominationIdParamSchema.parse(request.params);
    const hcpData = createHcpFromNominationSchema.parse(request.body);

    try {
      const result = await nominationService.createHcpAndMatch(
        nominationId,
        hcpData,
        request.user.sub
      );
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create HCP';
      return reply.status(400).send({ message });
    }
  });

  // Exclude nomination
  fastify.post<{
    Params: z.infer<typeof nominationIdParamSchema>;
  }>('/:id/nominations/:nid/exclude', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const { nid: nominationId } = nominationIdParamSchema.parse(request.params);

    try {
      const result = await nominationService.exclude(nominationId, request.user.sub);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to exclude nomination';
      return reply.status(400).send({ message });
    }
  });
};
