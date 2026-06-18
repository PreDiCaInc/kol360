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

// v1.17.5: parse respondent filters from query string. Used by
// /demographics, /leader-rankings, /sociometric-summary.
// v1.17.31: extracted to lib/respondent-filters.ts with unit tests
// (catches the comma-shred bug class — see
// docs/findings/splitcsv-comma-bug-2026-06-09.md).
import { parseRespondentFilters } from '../lib/respondent-filters';

export const insightsReportRoutes: FastifyPluginAsync = async (fastify) => {
  // List disease areas accessible to the current user, with campaign/KOL counts
  fastify.get('/disease-areas', async (request) => {
    const user = request.user!;

    const clientFilter = user.role === 'PLATFORM_ADMIN'
      ? {}
      : { clientId: user.tenantId! };

    // v1.17.49: broaden DA visibility to include lite-client KolAnalysis
    // links. Non-lite clients reach a DA via Campaign; lite clients have 0
    // campaigns by design and reach a DA only via KolAnalysis.
    // PLATFORM_ADMIN: clientFilter is {}, both sides match anything.
    const diseaseAreas = await fastify.prisma.diseaseArea.findMany({
      where: {
        isActive: true,
        OR: [
          { campaigns: { some: clientFilter } },
          { kolAnalyses: { some: clientFilter } },
        ],
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

    // v1.17.50 — companion to the 4.1.29 GET /disease-areas filter
    // broadening. Lite clients reach a DA via KolAnalysis only (0
    // campaigns by design). Pre-fix this access check rejected them
    // with 403, which the frontend swallowed as zeros across every
    // Insights tab. Same OR-on-EITHER-anchor pattern.
    const [campaignCount, analysisCount] = await Promise.all([
      fastify.prisma.campaign.count({
        where: { clientId: user.tenantId, diseaseAreaId },
      }),
      fastify.prisma.kolAnalysis.count({
        where: { clientId: user.tenantId, diseaseAreaId },
      }),
    ]);

    if (campaignCount === 0 && analysisCount === 0) {
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

  // v1.17.52 — Track B (Apply Filters batch UX) backend.
  // Cheap COUNT endpoints powering the live "N match" indicator next to
  // the Apply Filters button. Reuse the shared filter-parsing pipeline
  // so the count semantics align row-for-row with the corresponding
  // full-aggregation endpoint at Apply time.
  //
  // type=kols       → distinct HCPs matching (Sociometric Summary,
  //                    KOL Explorer, Benchmarking; takes insightsFilterSchema)
  // type=respondents → distinct respondents matching (Demographics;
  //                    takes respondent filters only)
  fastify.get<{ Params: { diseaseAreaId: string } }>(
    '/:diseaseAreaId/match-count',
    async (request, reply) => {
      const { diseaseAreaId } = request.params;
      const user = request.user!;

      if (!(await verifyDiseaseAreaAccess(diseaseAreaId, user, reply))) {
        return;
      }

      const q = request.query as Record<string, string>;
      const type = q.type === 'respondents' ? 'respondents' : 'kols';
      const clientId = resolveClientId(user, q);
      const respondentFilters = parseRespondentFilters(q);

      if (type === 'respondents') {
        return requireClientId(reply, () =>
          insightsReportService.getRespondentMatchCount(diseaseAreaId, respondentFilters, clientId)
        );
      }

      // type === 'kols' — accept the full insightsFilterSchema
      // (KOL-side categoricals + score ranges + search) plus
      // respondent filters via the shared parser.
      const filters = insightsFilterSchema.parse(request.query);
      return requireClientId(reply, () =>
        insightsReportService.getKolMatchCount(diseaseAreaId, filters, clientId, respondentFilters)
      );
    }
  );

  // KOL Profile drill-down match count — distinct nominators of the
  // given HCP matching the current respondent filter set.
  fastify.get<{ Params: { diseaseAreaId: string; hcpId: string } }>(
    '/:diseaseAreaId/kol-profile/:hcpId/match-count',
    async (request, reply) => {
      const { diseaseAreaId, hcpId } = request.params;
      const user = request.user!;

      if (!(await verifyDiseaseAreaAccess(diseaseAreaId, user, reply))) {
        return;
      }

      const q = request.query as Record<string, string>;
      const clientId = resolveClientId(user, q);
      const respondentFilters = parseRespondentFilters(q);
      return requireClientId(reply, () =>
        insightsReportService.getNominatorMatchCount(diseaseAreaId, hcpId, respondentFilters, clientId)
      );
    }
  );

  // v1.17.53 — survey-question text per nomination type. Powers the
  // (i) tooltip on each LeaderRankingPanel header in the Benchmarking
  // tab. One entry per nominationType; most-recent-campaign wins on
  // ties.
  // v1.17.55 — strip campaignName for non-PLATFORM_ADMIN viewers.
  // Lite clients pool data across OTHER clients' campaigns; showing
  // "Source: <other-client-campaign-name>" leaks the cross-tenant
  // data source. Conservative blanket rule: only PLATFORM_ADMIN sees
  // source. Service stays role-agnostic; gate here at the boundary.
  fastify.get<{ Params: { diseaseAreaId: string } }>(
    '/:diseaseAreaId/nomination-questions',
    async (request, reply) => {
      const { diseaseAreaId } = request.params;
      const user = request.user!;

      if (!(await verifyDiseaseAreaAccess(diseaseAreaId, user, reply))) {
        return;
      }

      const clientId = resolveClientId(user, request.query as Record<string, string>);
      const result = await requireClientId(reply, () =>
        insightsReportService.getNominationQuestions(diseaseAreaId, clientId)
      );
      if (!result || reply.sent) return;
      if (user.role !== 'PLATFORM_ADMIN') {
        return { items: result.items.map((it) => ({ ...it, campaignName: '' })) };
      }
      return result;
    }
  );

  // v1.17.53 — survey-question text per Demographics chart dimension.
  // Same UX pattern as /nomination-questions but keyed by dimension
  // slug (role, coreFocus, practiceSetting, yearsInPractice, etc.).
  // v1.17.55 — same campaignName strip for non-PLATFORM_ADMIN.
  fastify.get<{ Params: { diseaseAreaId: string } }>(
    '/:diseaseAreaId/demographic-questions',
    async (request, reply) => {
      const { diseaseAreaId } = request.params;
      const user = request.user!;

      if (!(await verifyDiseaseAreaAccess(diseaseAreaId, user, reply))) {
        return;
      }

      const clientId = resolveClientId(user, request.query as Record<string, string>);
      const result = await requireClientId(reply, () =>
        insightsReportService.getDemographicQuestions(diseaseAreaId, clientId)
      );
      if (!result || reply.sent) return;
      if (user.role !== 'PLATFORM_ADMIN') {
        return { items: result.items.map((it) => ({ ...it, campaignName: '' })) };
      }
      return result;
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
