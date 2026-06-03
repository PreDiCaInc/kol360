import { FastifyPluginAsync, FastifyReply } from 'fastify';
import { insightsReportService, MissingClientIdError } from '../services/insights-report.service';
import {
  insightsFilterSchema,
  leaderRankingQuerySchema,
  kolProfileQuerySchema,
  NOMINATION_TYPES,
} from '@kol360/shared';

/**
 * Wrap a 5-analysis-backed route handler so MissingClientIdError → 400.
 * The 3 campaign-scoped routes (demographics, respondent-analytics,
 * kol-nomination-metadata) accept clientId as an optional filter and don't
 * need this wrapper.
 */
async function requireClientId<T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | void> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof MissingClientIdError) {
      reply.status(400).send({
        error: 'Bad Request',
        message: err.message,
        statusCode: 400,
      });
      return;
    }
    throw err;
  }
}

/**
 * v1.17.5: parse respondent filters from query string. Used by
 * /demographics, /leader-rankings, /sociometric-summary. Categorical
 * filters are comma-separated; range filters are min/max numerics.
 * Accepts both the new plural names and the legacy singular fallbacks
 * so an older client tab doesn't break mid-deploy.
 */
function parseRespondentFilters(q: Record<string, string>) {
  const splitCsv = (v: string | undefined): string[] | undefined => {
    if (!v) return undefined;
    const parts = v.split(',').map((s) => s.trim()).filter(Boolean);
    return parts.length > 0 ? parts : undefined;
  };
  return {
    respondentRoles: splitCsv(q.respondentRoles) ?? splitCsv(q.respondentRole),
    coreFocuses: splitCsv(q.coreFocuses) ?? splitCsv(q.coreFocus),
    stateOfPractices: splitCsv(q.stateOfPractices) ?? splitCsv(q.stateOfPractice),
    practiceSettings: splitCsv(q.practiceSettings) ?? splitCsv(q.practiceSetting),
    yearsMin: q.yearsMin ? Number(q.yearsMin) : undefined,
    yearsMax: q.yearsMax ? Number(q.yearsMax) : undefined,
    monthlyPatientsMin: q.monthlyPatientsMin ? Number(q.monthlyPatientsMin) : undefined,
    monthlyPatientsMax: q.monthlyPatientsMax ? Number(q.monthlyPatientsMax) : undefined,
    dedPatientsMin: q.dedPatientsMin ? Number(q.dedPatientsMin) : undefined,
    dedPatientsMax: q.dedPatientsMax ? Number(q.dedPatientsMax) : undefined,
  };
}

export const insightsReportRoutes: FastifyPluginAsync = async (fastify) => {
  // List disease areas accessible to the current user, with campaign/KOL counts
  fastify.get('/disease-areas', async (request) => {
    const user = request.user!;

    const clientFilter = user.role === 'PLATFORM_ADMIN'
      ? {}
      : { clientId: user.tenantId! };

    const diseaseAreas = await fastify.prisma.diseaseArea.findMany({
      where: {
        isActive: true,
        campaigns: { some: clientFilter },
      },
      select: {
        id: true,
        name: true,
        therapeuticArea: true,
        code: true,
        _count: {
          select: {
            campaigns: { where: clientFilter },
          },
        },
      },
      orderBy: [{ therapeuticArea: 'asc' }, { name: 'asc' }],
    });

    const items = await Promise.all(
      diseaseAreas.map(async (da) => ({
        id: da.id,
        name: da.name,
        therapeuticArea: da.therapeuticArea,
        code: da.code,
        campaignCount: da._count.campaigns,
        kolCount: await fastify.prisma.hcpDiseaseAreaScore.count({
          where: { diseaseAreaId: da.id, isCurrent: true },
        }),
      }))
    );

    return { items };
  });

  // Helper to resolve clientId for campaign-scoped data
  // CLIENT_ADMIN: always uses their tenantId
  // PLATFORM_ADMIN: uses clientId query param if provided, undefined for "all"
  function resolveClientId(user: { role: string; tenantId?: string }, query: Record<string, string>): string | undefined {
    if (user.role === 'PLATFORM_ADMIN') {
      const qClientId = query.clientId;
      return qClientId && qClientId !== 'all' ? qClientId : undefined;
    }
    return user.tenantId;
  }

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

      const clientId = resolveClientId(user, request.query as Record<string, string>);
      return requireClientId(reply, () => insightsReportService.getSummary(diseaseAreaId, clientId));
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
      const clientId = resolveClientId(user, request.query as Record<string, string>);
      return requireClientId(reply, () => insightsReportService.getKolExplorer(diseaseAreaId, filters, clientId));
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
      const q = request.query as Record<string, string>;
      const excludeInternal = q.excludeInternalEmails === 'true';
      const clientId = resolveClientId(user, q);
      // v1.17.5: respondent filters carry over from Demographics.
      const respondentFilters = parseRespondentFilters(q);
      return requireClientId(reply, () =>
        insightsReportService.getLeaderRankings(diseaseAreaId, query, excludeInternal, clientId, respondentFilters)
      );
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

      const excludeInternal = (request.query as Record<string, string>).excludeInternalEmails === 'true';
      const clientId = resolveClientId(user, request.query as Record<string, string>);
      const profile = await requireClientId(reply, () =>
        insightsReportService.getKolProfile(diseaseAreaId, hcpId, excludeInternal, clientId)
      );
      if (reply.sent) return; // requireClientId already sent 400
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
      const q = request.query as Record<string, string>;
      const clientId = resolveClientId(user, q);
      // v1.17.5: respondent filters carry over from Demographics.
      const respondentFilters = parseRespondentFilters(q);
      return requireClientId(reply, () =>
        insightsReportService.getSociometricSummary(diseaseAreaId, filters, clientId, respondentFilters)
      );
    }
  );


  // Get demographics data (aggregated from survey response answers)
  fastify.get<{ Params: { diseaseAreaId: string } }>(
    '/:diseaseAreaId/demographics',
    async (request, reply) => {
      const { diseaseAreaId } = request.params;
      const user = request.user!;

      if (!(await verifyDiseaseAreaAccess(diseaseAreaId, user, reply))) {
        return;
      }

      const q = request.query as Record<string, string>;
      const clientId = resolveClientId(user, q);
      // v1.17.5: parser shared with /leader-rankings + /sociometric-summary
      // so the three surfaces accept the same query-param shape.
      const demographicFilters = parseRespondentFilters(q);
      const hasFilters = Object.values(demographicFilters).some(v => v !== undefined);
      return insightsReportService.getDemographics(diseaseAreaId, clientId, hasFilters ? demographicFilters : undefined);
    }
  );

  // Get KOL nomination metadata (nominator survey answers for a specific KOL)
  fastify.get<{ Params: { diseaseAreaId: string; hcpId: string } }>(
    '/:diseaseAreaId/kol-nomination-metadata/:hcpId',
    async (request, reply) => {
      const { diseaseAreaId, hcpId } = request.params;
      const user = request.user!;

      if (!(await verifyDiseaseAreaAccess(diseaseAreaId, user, reply))) {
        return;
      }

      const clientId = resolveClientId(user, request.query as Record<string, string>);
      return insightsReportService.getKolNominationMetadata(diseaseAreaId, hcpId, clientId);
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
