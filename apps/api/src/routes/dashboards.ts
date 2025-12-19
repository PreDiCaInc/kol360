import { FastifyPluginAsync, FastifyReply } from 'fastify';
import { dashboardService } from '../services/dashboard.service';
import {
  createDashboardSchema,
  updateDashboardSchema,
  addComponentSchema,
  updateComponentSchema,
} from '@kol360/shared';

export const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
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

  // Helper function to verify dashboard tenant access
  async function verifyDashboardAccess(
    dashboardId: string,
    user: { role: string; tenantId?: string },
    reply: FastifyReply
  ): Promise<boolean> {
    const dashboard = await fastify.prisma.dashboard.findUnique({
      where: { id: dashboardId },
      select: { clientId: true },
    });

    if (!dashboard) {
      reply.status(404).send({
        error: 'Not Found',
        message: 'Dashboard not found',
        statusCode: 404,
      });
      return false;
    }

    if (user.role !== 'PLATFORM_ADMIN' && dashboard.clientId !== user.tenantId) {
      reply.status(403).send({
        error: 'Forbidden',
        message: 'Cannot access data from other tenants',
        statusCode: 403,
      });
      return false;
    }

    return true;
  }

  // Helper function to verify component tenant access (via dashboard)
  async function verifyComponentAccess(
    componentId: string,
    user: { role: string; tenantId?: string },
    reply: FastifyReply
  ): Promise<boolean> {
    const component = await fastify.prisma.dashboardComponent.findUnique({
      where: { id: componentId },
      select: { dashboard: { select: { clientId: true } } },
    });

    if (!component) {
      reply.status(404).send({
        error: 'Not Found',
        message: 'Component not found',
        statusCode: 404,
      });
      return false;
    }

    if (user.role !== 'PLATFORM_ADMIN' && component.dashboard.clientId !== user.tenantId) {
      reply.status(403).send({
        error: 'Forbidden',
        message: 'Cannot access data from other tenants',
        statusCode: 403,
      });
      return false;
    }

    return true;
  }

  // Get dashboard for campaign
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/dashboard',
    async (request, reply) => {
      const { campaignId } = request.params;

      // Verify campaign belongs to user's tenant
      if (request.user) {
        const hasAccess = await verifyCampaignAccess(campaignId, request.user, reply);
        if (!hasAccess) return;
      }

      let dashboard = await dashboardService.getForCampaign(campaignId);

      // Auto-create default dashboard if none exists
      if (!dashboard) {
        const user = request.user;
        dashboard = await dashboardService.createDefaultForCampaign(
          campaignId,
          user?.tenantId ?? '',
          user?.sub ?? 'system'
        );
      }

      return dashboard;
    }
  );

  // Create dashboard for campaign
  fastify.post<{ Params: { campaignId: string }; Body: { name: string } }>(
    '/campaigns/:campaignId/dashboard',
    async (request, reply) => {
      const { campaignId } = request.params;
      const { name } = request.body;
      const user = request.user;

      // Verify campaign belongs to user's tenant
      if (user) {
        const hasAccess = await verifyCampaignAccess(campaignId, user, reply);
        if (!hasAccess) return;
      }

      const existing = await dashboardService.getForCampaign(campaignId);
      if (existing) {
        return reply.status(400).send({ error: 'Dashboard already exists for this campaign' });
      }

      const dashboard = await dashboardService.create({
        campaignId,
        name,
        clientId: user?.tenantId ?? '',
        createdBy: user?.sub ?? '',
      });

      return reply.status(201).send(dashboard);
    }
  );

  // Update dashboard
  fastify.patch<{ Params: { dashboardId: string }; Body: { name?: string; isPublished?: boolean } }>(
    '/dashboards/:dashboardId',
    async (request, reply) => {
      const { dashboardId } = request.params;

      // Verify dashboard belongs to user's tenant
      if (request.user) {
        const hasAccess = await verifyDashboardAccess(dashboardId, request.user, reply);
        if (!hasAccess) return;
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
      const { dashboardId } = request.params;

      // Verify dashboard belongs to user's tenant
      if (request.user) {
        const hasAccess = await verifyDashboardAccess(dashboardId, request.user, reply);
        if (!hasAccess) return;
      }

      const dashboard = await dashboardService.publish(dashboardId);
      return dashboard;
    }
  );

  // Unpublish dashboard
  fastify.post<{ Params: { dashboardId: string } }>(
    '/dashboards/:dashboardId/unpublish',
    async (request, reply) => {
      const { dashboardId } = request.params;

      // Verify dashboard belongs to user's tenant
      if (request.user) {
        const hasAccess = await verifyDashboardAccess(dashboardId, request.user, reply);
        if (!hasAccess) return;
      }

      const dashboard = await dashboardService.unpublish(dashboardId);
      return dashboard;
    }
  );

  // Add component to dashboard
  fastify.post<{ Params: { dashboardId: string }; Body: unknown }>(
    '/dashboards/:dashboardId/components',
    async (request, reply) => {
      const { dashboardId } = request.params;

      // Verify dashboard belongs to user's tenant
      if (request.user) {
        const hasAccess = await verifyDashboardAccess(dashboardId, request.user, reply);
        if (!hasAccess) return;
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
      const { componentId } = request.params;

      // Verify component belongs to user's tenant
      if (request.user) {
        const hasAccess = await verifyComponentAccess(componentId, request.user, reply);
        if (!hasAccess) return;
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
      const { componentId } = request.params;

      // Verify component belongs to user's tenant
      if (request.user) {
        const hasAccess = await verifyComponentAccess(componentId, request.user, reply);
        if (!hasAccess) return;
      }

      await dashboardService.removeComponent(componentId);
      return reply.status(204).send();
    }
  );

  // Toggle component visibility
  fastify.post<{ Params: { componentId: string } }>(
    '/components/:componentId/toggle',
    async (request, reply) => {
      const { componentId } = request.params;

      // Verify component belongs to user's tenant
      if (request.user) {
        const hasAccess = await verifyComponentAccess(componentId, request.user, reply);
        if (!hasAccess) return;
      }

      const component = await dashboardService.toggleComponentVisibility(componentId);
      return component;
    }
  );

  // Reorder components
  fastify.post<{ Params: { dashboardId: string }; Body: { componentIds: string[] } }>(
    '/dashboards/:dashboardId/reorder',
    async (request, reply) => {
      const { dashboardId } = request.params;

      // Verify dashboard belongs to user's tenant
      if (request.user) {
        const hasAccess = await verifyDashboardAccess(dashboardId, request.user, reply);
        if (!hasAccess) return;
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
      const { campaignId } = request.params;

      // Verify campaign belongs to user's tenant
      if (request.user) {
        const hasAccess = await verifyCampaignAccess(campaignId, request.user, reply);
        if (!hasAccess) return;
      }

      const stats = await dashboardService.getStats(campaignId);
      return stats;
    }
  );

  // Get completion funnel data
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/dashboard/funnel',
    async (request, reply) => {
      const { campaignId } = request.params;

      // Verify campaign belongs to user's tenant
      if (request.user) {
        const hasAccess = await verifyCampaignAccess(campaignId, request.user, reply);
        if (!hasAccess) return;
      }

      const funnel = await dashboardService.getCompletionFunnel(campaignId);
      return funnel;
    }
  );

  // Get score distribution
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/dashboard/score-distribution',
    async (request, reply) => {
      const { campaignId } = request.params;

      // Verify campaign belongs to user's tenant
      if (request.user) {
        const hasAccess = await verifyCampaignAccess(campaignId, request.user, reply);
        if (!hasAccess) return;
      }

      const distribution = await dashboardService.getScoreDistribution(campaignId);
      return distribution;
    }
  );

  // Get top KOLs
  fastify.get<{ Params: { campaignId: string }; Querystring: { limit?: string } }>(
    '/campaigns/:campaignId/dashboard/top-kols',
    async (request, reply) => {
      const { campaignId } = request.params;

      // Verify campaign belongs to user's tenant
      if (request.user) {
        const hasAccess = await verifyCampaignAccess(campaignId, request.user, reply);
        if (!hasAccess) return;
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
      const { campaignId } = request.params;

      // Verify campaign belongs to user's tenant
      if (request.user) {
        const hasAccess = await verifyCampaignAccess(campaignId, request.user, reply);
        if (!hasAccess) return;
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
      const { campaignId } = request.params;

      // Verify campaign belongs to user's tenant
      if (request.user) {
        const hasAccess = await verifyCampaignAccess(campaignId, request.user, reply);
        if (!hasAccess) return;
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
