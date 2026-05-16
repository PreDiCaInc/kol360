import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { kolAnalysisService } from '../services/kol-analysis.service';
import { createAuditLog } from '../lib/audit';
import { analysisWeightsSchema, createAnalysisSchema, DEFAULT_ANALYSIS_WEIGHTS } from '@kol360/shared';

const updateCampaignsSchema = z.object({
  campaigns: z
    .array(z.object({ campaignId: z.string(), included: z.boolean() }))
    .min(1),
});

const updateAnalysisSchema = z.object({
  name: z.string().min(1).optional(),
  weights: analysisWeightsSchema.optional(),
});

// Survey-response + nomination counts per campaign (Nomination has no direct
// campaignId — it joins via SurveyResponse). Used to size campaigns in the
// curation UI.
async function campaignCounts(
  campaignIds: string[]
): Promise<Map<string, { responseCount: number; nominationCount: number }>> {
  const map = new Map<string, { responseCount: number; nominationCount: number }>();
  for (const id of campaignIds) map.set(id, { responseCount: 0, nominationCount: 0 });
  if (campaignIds.length === 0) return map;

  const responses = await prisma.surveyResponse.findMany({
    where: { campaignId: { in: campaignIds } },
    select: { id: true, campaignId: true },
  });
  for (const r of responses) {
    const e = map.get(r.campaignId);
    if (e) e.responseCount++;
  }
  if (responses.length > 0) {
    const respToCampaign = new Map(responses.map((r) => [r.id, r.campaignId]));
    const nomGroups = await prisma.nomination.groupBy({
      by: ['responseId'],
      where: { responseId: { in: responses.map((r) => r.id) } },
      _count: { _all: true },
    });
    for (const g of nomGroups) {
      const cid = respToCampaign.get(g.responseId);
      const e = cid ? map.get(cid) : undefined;
      if (e) e.nominationCount += g._count._all;
    }
  }
  return map;
}

function badRequest(reply: { status: (n: number) => { send: (b: unknown) => unknown } }, e: unknown) {
  if (e instanceof z.ZodError) {
    return reply.status(400).send({
      error: 'Bad Request',
      message: e.errors[0]?.message || 'Invalid input',
      statusCode: 400,
    });
  }
  throw e;
}

export const kolAnalysisRoutes: FastifyPluginAsync = async (fastify) => {
  // PLATFORM_ADMIN-only — curation is platform-owned (locked decision 1).
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.user?.role !== 'PLATFORM_ADMIN') {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Only platform admins can manage KOL analyses',
        statusCode: 403,
      });
    }
  });

  // GET /api/v1/admin/kol-analysis — list
  fastify.get('/', async () => {
    const items = await prisma.kolAnalysis.findMany({
      orderBy: { name: 'asc' },
      include: {
        client: { select: { id: true, name: true } },
        diseaseArea: { select: { id: true, name: true } },
        _count: { select: { campaigns: true, scores: true } },
      },
    });
    return { items };
  });

  // POST /api/v1/admin/kol-analysis — create an analysis for a (client, DA).
  // Works even when the client runs no campaigns (e.g. lite clients);
  // campaigns are added afterward via the curation picker.
  fastify.post<{ Body: z.infer<typeof createAnalysisSchema> }>(
    '/',
    async (request, reply) => {
      let body: z.infer<typeof createAnalysisSchema>;
      try {
        body = createAnalysisSchema.parse(request.body);
      } catch (e) {
        return badRequest(reply, e);
      }
      const [client, diseaseArea, existing] = await Promise.all([
        prisma.client.findUnique({ where: { id: body.clientId }, select: { id: true } }),
        prisma.diseaseArea.findUnique({ where: { id: body.diseaseAreaId }, select: { id: true } }),
        prisma.kolAnalysis.findUnique({
          where: {
            clientId_diseaseAreaId: {
              clientId: body.clientId,
              diseaseAreaId: body.diseaseAreaId,
            },
          },
          select: { id: true },
        }),
      ]);
      if (!client) return reply.status(400).send({ message: 'Client not found' });
      if (!diseaseArea) return reply.status(400).send({ message: 'Disease area not found' });
      if (existing) {
        return reply.status(409).send({
          message: 'An analysis already exists for this client and disease area',
          existingId: existing.id,
        });
      }
      const created = await prisma.kolAnalysis.create({
        data: {
          clientId: body.clientId,
          diseaseAreaId: body.diseaseAreaId,
          name: body.name,
          weightsJson: DEFAULT_ANALYSIS_WEIGHTS,
          createdBy: request.user!.sub,
        },
      });
      await createAuditLog(request.user!.sub, {
        action: 'kol_analysis.created',
        entityType: 'KolAnalysis',
        entityId: created.id,
        newValues: { clientId: body.clientId, diseaseAreaId: body.diseaseAreaId, name: body.name },
      });
      return reply.status(201).send(created);
    }
  );

  // GET /api/v1/admin/kol-analysis/:id — detail + campaigns + status
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const analysis = await prisma.kolAnalysis.findUnique({
      where: { id: request.params.id },
      include: {
        client: { select: { id: true, name: true } },
        diseaseArea: { select: { id: true, name: true } },
        campaigns: {
          include: { campaign: { select: { id: true, name: true, status: true } } },
        },
        _count: { select: { scores: true } },
      },
    });
    if (!analysis) {
      return reply.status(404).send({ message: 'Analysis not found' });
    }
    const counts = await campaignCounts(analysis.campaigns.map((c) => c.campaignId));
    return {
      ...analysis,
      campaigns: analysis.campaigns.map((c) => ({
        ...c,
        responseCount: counts.get(c.campaignId)?.responseCount ?? 0,
        nominationCount: counts.get(c.campaignId)?.nominationCount ?? 0,
      })),
    };
  });

  // GET /api/v1/admin/kol-analysis/:id/available-campaigns — campaigns in the
  // SAME disease area not yet linked to this analysis. Includes other clients'
  // campaigns (crossClient=true) so a lite client's analysis can pull shared
  // same-disease-area data.
  fastify.get<{ Params: { id: string } }>(
    '/:id/available-campaigns',
    async (request, reply) => {
      const analysis = await prisma.kolAnalysis.findUnique({
        where: { id: request.params.id },
        select: { id: true, clientId: true, diseaseAreaId: true },
      });
      if (!analysis) {
        return reply.status(404).send({ message: 'Analysis not found' });
      }
      const linked = await prisma.kolAnalysisCampaign.findMany({
        where: { analysisId: analysis.id },
        select: { campaignId: true },
      });
      const linkedIds = new Set(linked.map((l) => l.campaignId));
      const campaigns = await prisma.campaign.findMany({
        where: { diseaseAreaId: analysis.diseaseAreaId },
        select: {
          id: true,
          name: true,
          status: true,
          clientId: true,
          client: { select: { id: true, name: true } },
        },
        orderBy: { name: 'asc' },
      });
      const unlinked = campaigns.filter((c) => !linkedIds.has(c.id));
      const counts = await campaignCounts(unlinked.map((c) => c.id));
      const items = unlinked.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        clientId: c.clientId,
        clientName: c.client.name,
        crossClient: c.clientId !== analysis.clientId,
        responseCount: counts.get(c.id)?.responseCount ?? 0,
        nominationCount: counts.get(c.id)?.nominationCount ?? 0,
      }));
      return { items };
    }
  );

  // PUT /api/v1/admin/kol-analysis/:id — update name and/or weights.
  // Changing weights does NOT auto-recalc; the user clicks Recalculate
  // (locked decision: explicit button). calcStatus reflects staleness.
  fastify.put<{ Params: { id: string }; Body: z.infer<typeof updateAnalysisSchema> }>(
    '/:id',
    async (request, reply) => {
      const analysis = await prisma.kolAnalysis.findUnique({
        where: { id: request.params.id },
      });
      if (!analysis) {
        return reply.status(404).send({ message: 'Analysis not found' });
      }
      let body: z.infer<typeof updateAnalysisSchema>;
      try {
        body = updateAnalysisSchema.parse(request.body);
      } catch (e) {
        if (e instanceof z.ZodError) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: e.errors[0]?.message || 'Invalid input',
            statusCode: 400,
          });
        }
        throw e;
      }
      const updated = await prisma.kolAnalysis.update({
        where: { id: analysis.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.weights !== undefined
            ? { weightsJson: body.weights, calcStatus: 'idle' }
            : {}),
        },
      });
      await createAuditLog(request.user!.sub, {
        action: 'kol_analysis.updated',
        entityType: 'KolAnalysis',
        entityId: analysis.id,
        newValues: { name: body.name, weightsChanged: body.weights !== undefined },
      });
      return updated;
    }
  );

  // PUT /api/v1/admin/kol-analysis/:id/campaigns — replace include/exclude set
  fastify.put<{ Params: { id: string }; Body: z.infer<typeof updateCampaignsSchema> }>(
    '/:id/campaigns',
    async (request, reply) => {
      const analysis = await prisma.kolAnalysis.findUnique({
        where: { id: request.params.id },
      });
      if (!analysis) {
        return reply.status(404).send({ message: 'Analysis not found' });
      }
      let body: z.infer<typeof updateCampaignsSchema>;
      try {
        body = updateCampaignsSchema.parse(request.body);
      } catch (e) {
        if (e instanceof z.ZodError) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: e.errors[0]?.message || 'Invalid input',
            statusCode: 400,
          });
        }
        throw e;
      }
      // Same-disease-area guard: every referenced campaign must be in the
      // analysis's disease area. Pooling across disease areas is meaningless.
      const referenced = await prisma.campaign.findMany({
        where: { id: { in: body.campaigns.map((c) => c.campaignId) } },
        select: { id: true, diseaseAreaId: true },
      });
      const refById = new Map(referenced.map((c) => [c.id, c.diseaseAreaId]));
      for (const c of body.campaigns) {
        const daId = refById.get(c.campaignId);
        if (daId === undefined) {
          return reply.status(400).send({ message: `Campaign not found: ${c.campaignId}` });
        }
        if (daId !== analysis.diseaseAreaId) {
          return reply.status(400).send({
            message: `Campaign ${c.campaignId} is not in this analysis's disease area`,
          });
        }
      }
      await prisma.$transaction(
        body.campaigns.map((c) =>
          prisma.kolAnalysisCampaign.upsert({
            where: {
              analysisId_campaignId: {
                analysisId: analysis.id,
                campaignId: c.campaignId,
              },
            },
            create: {
              analysisId: analysis.id,
              campaignId: c.campaignId,
              included: c.included,
            },
            update: { included: c.included },
          })
        )
      );
      // Campaign set changed → scores are stale until Recalculate.
      await prisma.kolAnalysis.update({
        where: { id: analysis.id },
        data: { calcStatus: 'idle' },
      });
      await createAuditLog(request.user!.sub, {
        action: 'kol_analysis.campaigns_updated',
        entityType: 'KolAnalysis',
        entityId: analysis.id,
        newValues: { campaigns: body.campaigns },
      });
      return { ok: true };
    }
  );

  // POST /api/v1/admin/kol-analysis/:id/recalculate — trigger the engine
  fastify.post<{ Params: { id: string } }>(
    '/:id/recalculate',
    async (request, reply) => {
      const analysis = await prisma.kolAnalysis.findUnique({
        where: { id: request.params.id },
      });
      if (!analysis) {
        return reply.status(404).send({ message: 'Analysis not found' });
      }
      try {
        const result = await kolAnalysisService.recalculateAnalysis(analysis.id);
        await createAuditLog(request.user!.sub, {
          action: 'kol_analysis.recalculated',
          entityType: 'KolAnalysis',
          entityId: analysis.id,
          newValues: { processed: result.processed },
        });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Recalculation failed';
        return reply.status(400).send({ message });
      }
    }
  );
};
