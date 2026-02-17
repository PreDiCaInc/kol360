import { FastifyPluginAsync, FastifyReply } from 'fastify';
import { insightsReportService } from '../services/insights-report.service';
import {
  insightsFilterSchema,
  leaderRankingQuerySchema,
  kolProfileQuerySchema,
  NOMINATION_TYPES,
} from '@kol360/shared';

export const insightsReportRoutes: FastifyPluginAsync = async (fastify) => {
  // Helper function to verify disease area access
  async function verifyDiseaseAreaAccess(
    diseaseAreaId: string,
    user: { role: string; tenantId?: string },
    reply: FastifyReply
  ): Promise<boolean> {
    const diseaseArea = await fastify.prisma.diseaseArea.findUnique({
      where: { id: diseaseAreaId },
      select: { id: true, name: true },
    });

    if (!diseaseArea) {
      reply.status(404).send({
        error: 'Not Found',
        message: 'Disease area not found',
        statusCode: 404,
      });
      return false;
    }

    // Platform admins can access all disease areas
    if (user.role === 'PLATFORM_ADMIN') {
      return true;
    }

    // CLIENT_ADMIN: Must have tenantId and campaigns in this disease area
    if (!user.tenantId) {
      reply.status(403).send({
        error: 'Forbidden',
        message: 'No tenant context available',
        statusCode: 403,
      });
      return false;
    }

    const campaignCount = await fastify.prisma.campaign.count({
      where: {
        clientId: user.tenantId,
        diseaseAreaId: diseaseAreaId,
      },
    });

    if (campaignCount === 0) {
      reply.status(403).send({
        error: 'Forbidden',
        message: 'No access to this disease area',
        statusCode: 403,
      });
      return false;
    }

    return true;
  }

  // Get summary stats for a disease area
  fastify.get<{ Params: { diseaseAreaId: string } }>(
    '/:diseaseAreaId/summary',
    async (request, reply) => {
      const { diseaseAreaId } = request.params;
      const user = request.user!;

      if (!(await verifyDiseaseAreaAccess(diseaseAreaId, user, reply))) {
        return;
      }

      return insightsReportService.getSummary(diseaseAreaId);
    }
  );

  // Get KOL Explorer data (paginated, filterable list of all KOLs)
  fastify.get<{ Params: { diseaseAreaId: string } }>(
    '/:diseaseAreaId/kol-explorer',
    async (request, reply) => {
      const { diseaseAreaId } = request.params;
      const user = request.user!;

      if (!(await verifyDiseaseAreaAccess(diseaseAreaId, user, reply))) {
        return;
      }

      const filters = insightsFilterSchema.parse(request.query);
      return insightsReportService.getKolExplorer(diseaseAreaId, filters);
    }
  );

  // Get leader rankings by nomination type
  fastify.get<{ Params: { diseaseAreaId: string } }>(
    '/:diseaseAreaId/leader-rankings',
    async (request, reply) => {
      const { diseaseAreaId } = request.params;
      const user = request.user!;

      if (!(await verifyDiseaseAreaAccess(diseaseAreaId, user, reply))) {
        return;
      }

      const query = leaderRankingQuerySchema.parse(request.query);
      return insightsReportService.getLeaderRankings(diseaseAreaId, query);
    }
  );

  // Get individual KOL profile
  fastify.get<{ Params: { diseaseAreaId: string; hcpId: string } }>(
    '/:diseaseAreaId/kol-profile/:hcpId',
    async (request, reply) => {
      const { diseaseAreaId, hcpId } = request.params;
      const user = request.user!;

      if (!(await verifyDiseaseAreaAccess(diseaseAreaId, user, reply))) {
        return;
      }

      const profile = await insightsReportService.getKolProfile(diseaseAreaId, hcpId);
      if (!profile) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'KOL not found in this disease area',
          statusCode: 404,
        });
      }

      return profile;
    }
  );

  // Get sociometric summary (master table with all nomination counts)
  fastify.get<{ Params: { diseaseAreaId: string } }>(
    '/:diseaseAreaId/sociometric-summary',
    async (request, reply) => {
      const { diseaseAreaId } = request.params;
      const user = request.user!;

      if (!(await verifyDiseaseAreaAccess(diseaseAreaId, user, reply))) {
        return;
      }

      const filters = insightsFilterSchema.parse(request.query);
      return insightsReportService.getSociometricSummary(diseaseAreaId, filters);
    }
  );

  // Get respondent analytics (demographics, distributions, completion trends)
  fastify.get<{ Params: { diseaseAreaId: string } }>(
    '/:diseaseAreaId/respondent-analytics',
    async (request, reply) => {
      const { diseaseAreaId } = request.params;
      const user = request.user!;

      if (!(await verifyDiseaseAreaAccess(diseaseAreaId, user, reply))) {
        return;
      }

      return insightsReportService.getRespondentAnalytics(diseaseAreaId);
    }
  );

  // Get filter options (specialties, states with data in this disease area)
  fastify.get<{ Params: { diseaseAreaId: string } }>(
    '/:diseaseAreaId/filter-options',
    async (request, reply) => {
      const { diseaseAreaId } = request.params;
      const user = request.user!;

      if (!(await verifyDiseaseAreaAccess(diseaseAreaId, user, reply))) {
        return;
      }

      return insightsReportService.getFilterOptions(diseaseAreaId);
    }
  );
};
