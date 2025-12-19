import { FastifyPluginAsync } from 'fastify';
import { dashboardService } from '../services/dashboard.service';
import {
  updateDashboardSchema,
  addComponentSchema,
  updateComponentSchema,
} from '@kol360/shared';
import { AuthUser } from '../plugins/auth';

type CampaignAccessError = { ok: false; error: string; status: 404 | 403 };
type CampaignAccessSuccess = { ok: true; campaign: { clientId: string } };
type CampaignAccessResult = CampaignAccessError | CampaignAccessSuccess;

type DashboardAccessError = { ok: false; error: string; status: 404 | 403 };
type DashboardAccessSuccess = { ok: true; dashboard: { clientId: string } };
type DashboardAccessResult = DashboardAccessError | DashboardAccessSuccess;

type ComponentAccessError = { ok: false; error: string; status: 404 | 403 };
type ComponentAccessSuccess = { ok: true; component: { id: string; dashboard: { clientId: string } } };
type ComponentAccessResult = ComponentAccessError | ComponentAccessSuccess;

export const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  // Helper function to verify campaign tenant access
  async function verifyCampaignAccess(campaignId: string, user: AuthUser): Promise<CampaignAccessResult> {
    const campaign = await fastify.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { clientId: true },
    });

    if (!campaign) {
      return { ok: false, error: 'Campaign not found', status: 404 };
    }

    if (user.role !== 'PLATFORM_ADMIN' && campaign.clientId !== user.tenantId) {
      return { ok: false, error: 'Cannot access data from other tenants', status: 403 };
    }

    return { ok: true, campaign };
  }

  // Helper function to verify dashboard tenant access
  async function verifyDashboardAccess(dashboardId: string, user: AuthUser): Promise<DashboardAccessResult> {
    const dashboard = await fastify.prisma.dashboardConfig.findUnique({
      where: { id: dashboardId },
      select: { clientId: true },
    });

    if (!dashboard) {
      return { ok: false, error: 'Dashboard not found', status: 404 };
    }

    if (user.role !== 'PLATFORM_ADMIN' && dashboard.clientId !== user.tenantId) {
      return { ok: false, error: 'Cannot access data from other tenants', status: 403 };
    }

    return { ok: true, dashboard };
  }

  // Helper function to verify component tenant access via dashboard
  async function verifyComponentAccess(componentId: string, user: AuthUser): Promise<ComponentAccessResult> {
    const component = await fastify.prisma.dashboardComponent.findUnique({
      where: { id: componentId },
      include: { dashboard: { select: { clientId: true } } },
    });

    if (!component) {
      return { ok: false, error: 'Component not found', status: 404 };
    }

    if (user.role !== 'PLATFORM_ADMIN' && component.dashboard.clientId !== user.tenantId) {
      return { ok: false, error: 'Cannot access data from other tenants', status: 403 };
    }

    return { ok: true, component };
  }

  // Get dashboard for campaign
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/dashboard',
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ message: 'Unauthorized' });
      }

      const { campaignId } = request.params;

      // Tenant isolation check
      const access = await verifyCampaignAccess(campaignId, request.user);
      if (!access.ok) {
        return reply.status(access.status).send({
          error: access.status === 404 ? 'Not Found' : 'Forbidden',
          message: access.error,
          statusCode: access.status,
        });
      }

      let dashboard = await dashboardService.getForCampaign(campaignId);

      // Auto-create default dashboard if none exists
      if (!dashboard) {
        dashboard = await dashboardService.createDefaultForCampaign(
          campaignId,
          request.user.tenantId ?? '',
          request.user.sub ?? 'system'
        );
      }

      return dashboard;
    }
  );

  // Create dashboard for campaign
  fastify.post<{ Params: { campaignId: string }; Body: { name: string } }>(
    '/campaigns/:campaignId/dashboard',
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ message: 'Unauthorized' });
      }

      const { campaignId } = request.params;
      const { name } = request.body;

      // Tenant isolation check
      const access = await verifyCampaignAccess(campaignId, request.user);
      if (!access.ok) {
        return reply.status(access.status).send({
          error: access.status === 404 ? 'Not Found' : 'Forbidden',
          message: access.error,
          statusCode: access.status,
        });
      }

      const existing = await dashboardService.getForCampaign(campaignId);
      if (existing) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Dashboard already exists for this campaign',
          statusCode: 400,
        });
      }

      const dashboard = await dashboardService.create({
        campaignId,
        name,
        clientId: request.user.tenantId ?? '',
        createdBy: request.user.sub ?? '',
      });

      return reply.status(201).send(dashboard);
    }
  );

  // Update dashboard
  fastify.patch<{ Params: { dashboardId: string }; Body: { name?: string; isPublished?: boolean } }>(
    '/dashboards/:dashboardId',
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ message: 'Unauthorized' });
      }

      const { dashboardId } = request.params;

      // Tenant isolation check
      const access = await verifyDashboardAccess(dashboardId, request.user);
      if (!access.ok) {
        return reply.status(access.status).send({
          error: access.status === 404 ? 'Not Found' : 'Forbidden',
          message: access.error,
          statusCode: access.status,
        });
      }

      const body = updateDashboardSchema.parse(request.body);
      const dashboard = await dashboardService.update(dashboardId, body);
      return dashboard;
    }
  );

  // Publish dashboard
  fastify.post<{ Params: { dashboardId: string } }>(
    '/dashboards/:dashboardId/publish',
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ message: 'Unauthorized' });
      }

      const { dashboardId } = request.params;

      // Tenant isolation check
      const access = await verifyDashboardAccess(dashboardId, request.user);
      if (!access.ok) {
        return reply.status(access.status).send({
          error: access.status === 404 ? 'Not Found' : 'Forbidden',
          message: access.error,
          statusCode: access.status,
        });
      }

      const dashboard = await dashboardService.publish(dashboardId);
      return dashboard;
    }
  );

  // Unpublish dashboard
  fastify.post<{ Params: { dashboardId: string } }>(
    '/dashboards/:dashboardId/unpublish',
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ message: 'Unauthorized' });
      }

      const { dashboardId } = request.params;

      // Tenant isolation check
      const access = await verifyDashboardAccess(dashboardId, request.user);
      if (!access.ok) {
        return reply.status(access.status).send({
          error: access.status === 404 ? 'Not Found' : 'Forbidden',
          message: access.error,
          statusCode: access.status,
        });
      }

      const dashboard = await dashboardService.unpublish(dashboardId);
      return dashboard;
    }
  );

  // Add component to dashboard
  fastify.post<{ Params: { dashboardId: string }; Body: unknown }>(
    '/dashboards/:dashboardId/components',
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ message: 'Unauthorized' });
      }

      const { dashboardId } = request.params;

      // Tenant isolation check
      const access = await verifyDashboardAccess(dashboardId, request.user);
      if (!access.ok) {
        return reply.status(access.status).send({
          error: access.status === 404 ? 'Not Found' : 'Forbidden',
          message: access.error,
          statusCode: access.status,
        });
      }

      const body = addComponentSchema.parse(request.body);

      const component = await dashboardService.addComponent(dashboardId, {
        componentType: body.componentType,
        componentKey: body.componentKey,
        configJson: body.configJson ?? null,
        sectionTitle: body.sectionTitle,
        displayOrder: body.displayOrder,
        isVisible: body.isVisible,
      });

      return reply.status(201).send(component);
    }
  );

  // Update component
  fastify.patch<{ Params: { componentId: string }; Body: unknown }>(
    '/components/:componentId',
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ message: 'Unauthorized' });
      }

      const { componentId } = request.params;

      // Tenant isolation check
      const access = await verifyComponentAccess(componentId, request.user);
      if (!access.ok) {
        return reply.status(access.status).send({
          error: access.status === 404 ? 'Not Found' : 'Forbidden',
          message: access.error,
          statusCode: access.status,
        });
      }

      const body = updateComponentSchema.parse(request.body);

      const component = await dashboardService.updateComponent(componentId, {
        configJson: body.configJson ?? undefined,
        sectionTitle: body.sectionTitle,
        displayOrder: body.displayOrder,
        isVisible: body.isVisible,
      });

      return component;
    }
  );

  // Delete component
  fastify.delete<{ Params: { componentId: string } }>(
    '/components/:componentId',
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ message: 'Unauthorized' });
      }

      const { componentId } = request.params;

      // Tenant isolation check
      const access = await verifyComponentAccess(componentId, request.user);
      if (!access.ok) {
        return reply.status(access.status).send({
          error: access.status === 404 ? 'Not Found' : 'Forbidden',
          message: access.error,
          statusCode: access.status,
        });
      }

      await dashboardService.removeComponent(componentId);
      return reply.status(204).send();
    }
  );

  // Toggle component visibility
  fastify.post<{ Params: { componentId: string } }>(
    '/components/:componentId/toggle',
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ message: 'Unauthorized' });
      }

      const { componentId } = request.params;

      // Tenant isolation check
      const access = await verifyComponentAccess(componentId, request.user);
      if (!access.ok) {
        return reply.status(access.status).send({
          error: access.status === 404 ? 'Not Found' : 'Forbidden',
          message: access.error,
          statusCode: access.status,
        });
      }

      const component = await dashboardService.toggleComponentVisibility(componentId);
      return component;
    }
  );

  // Reorder components
  fastify.post<{ Params: { dashboardId: string }; Body: { componentIds: string[] } }>(
    '/dashboards/:dashboardId/reorder',
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ message: 'Unauthorized' });
      }

      const { dashboardId } = request.params;

      // Tenant isolation check
      const access = await verifyDashboardAccess(dashboardId, request.user);
      if (!access.ok) {
        return reply.status(access.status).send({
          error: access.status === 404 ? 'Not Found' : 'Forbidden',
          message: access.error,
          statusCode: access.status,
        });
      }

      const { componentIds } = request.body;
      const dashboard = await dashboardService.reorderComponents(dashboardId, componentIds);
      return dashboard;
    }
  );

  // ===== Dashboard Data Endpoints =====

  // Get dashboard stats
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/dashboard/stats',
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ message: 'Unauthorized' });
      }

      const { campaignId } = request.params;

      // Tenant isolation check
      const access = await verifyCampaignAccess(campaignId, request.user);
      if (!access.ok) {
        return reply.status(access.status).send({
          error: access.status === 404 ? 'Not Found' : 'Forbidden',
          message: access.error,
          statusCode: access.status,
        });
      }

      const stats = await dashboardService.getStats(campaignId);
      return stats;
    }
  );

  // Get completion funnel data
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/dashboard/funnel',
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ message: 'Unauthorized' });
      }

      const { campaignId } = request.params;

      // Tenant isolation check
      const access = await verifyCampaignAccess(campaignId, request.user);
      if (!access.ok) {
        return reply.status(access.status).send({
          error: access.status === 404 ? 'Not Found' : 'Forbidden',
          message: access.error,
          statusCode: access.status,
        });
      }

      const funnel = await dashboardService.getCompletionFunnel(campaignId);
      return funnel;
    }
  );

  // Get score distribution
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/dashboard/score-distribution',
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ message: 'Unauthorized' });
      }

      const { campaignId } = request.params;

      // Tenant isolation check
      const access = await verifyCampaignAccess(campaignId, request.user);
      if (!access.ok) {
        return reply.status(access.status).send({
          error: access.status === 404 ? 'Not Found' : 'Forbidden',
          message: access.error,
          statusCode: access.status,
        });
      }

      const distribution = await dashboardService.getScoreDistribution(campaignId);
      return distribution;
    }
  );

  // Get top KOLs
  fastify.get<{ Params: { campaignId: string }; Querystring: { limit?: string } }>(
    '/campaigns/:campaignId/dashboard/top-kols',
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ message: 'Unauthorized' });
      }

      const { campaignId } = request.params;

      // Tenant isolation check
      const access = await verifyCampaignAccess(campaignId, request.user);
      if (!access.ok) {
        return reply.status(access.status).send({
          error: access.status === 404 ? 'Not Found' : 'Forbidden',
          message: access.error,
          statusCode: access.status,
        });
      }

      const limit = parseInt(request.query.limit || '10', 10);
      const kols = await dashboardService.getTopKols(campaignId, limit);
      return kols;
    }
  );

  // Get segment scores
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/dashboard/segment-scores',
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ message: 'Unauthorized' });
      }

      const { campaignId } = request.params;

      // Tenant isolation check
      const access = await verifyCampaignAccess(campaignId, request.user);
      if (!access.ok) {
        return reply.status(access.status).send({
          error: access.status === 404 ? 'Not Found' : 'Forbidden',
          message: access.error,
          statusCode: access.status,
        });
      }

      const segments = await dashboardService.getSegmentScores(campaignId);
      return segments;
    }
  );

  // Get custom chart data
  fastify.get<{
    Params: { campaignId: string };
    Querystring: { questionId?: string; groupBy?: string; metric?: string };
  }>(
    '/campaigns/:campaignId/dashboard/custom-chart',
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ message: 'Unauthorized' });
      }

      const { campaignId } = request.params;

      // Tenant isolation check
      const access = await verifyCampaignAccess(campaignId, request.user);
      if (!access.ok) {
        return reply.status(access.status).send({
          error: access.status === 404 ? 'Not Found' : 'Forbidden',
          message: access.error,
          statusCode: access.status,
        });
      }

      const { questionId, groupBy, metric = 'count' } = request.query;

      const data = await dashboardService.getCustomChartData(campaignId, {
        questionId,
        groupBy,
        metric,
      });

      return data;
    }
  );
};
