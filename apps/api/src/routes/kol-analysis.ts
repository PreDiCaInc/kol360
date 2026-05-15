import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { kolAnalysisService } from '../services/kol-analysis.service';
import { createAuditLog } from '../lib/audit';

const updateCampaignsSchema = z.object({
  campaigns: z
    .array(z.object({ campaignId: z.string(), included: z.boolean() }))
    .min(1),
});

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

  // GET /api/v1/admin/kol-analyses — list
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

  // GET /api/v1/admin/kol-analyses/:id — detail + campaigns + status
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
    return analysis;
  });

  // PUT /api/v1/admin/kol-analyses/:id/campaigns — replace include/exclude set
  fastify.put<{ Params: { id: string }; Body: z.infer<typeof updateCampaignsSchema> }>(
    '/:id/campaigns',
    async (request, reply) => {
      const analysis = await prisma.kolAnalysis.findUnique({
        where: { id: request.params.id },
      });
      if (!analysis) {
        return reply.status(404).send({ message: 'Analysis not found' });
      }
      const body = updateCampaignsSchema.parse(request.body);
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
      await createAuditLog(request.user!.sub, {
        action: 'kol_analysis.campaigns_updated',
        entityType: 'KolAnalysis',
        entityId: analysis.id,
        newValues: { campaigns: body.campaigns },
      });
      return { ok: true };
    }
  );

  // POST /api/v1/admin/kol-analyses/:id/recalculate — trigger the engine
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
