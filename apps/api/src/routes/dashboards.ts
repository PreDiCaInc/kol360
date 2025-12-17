import { FastifyPluginAsync } from 'fastify';
import { dashboardService } from '../services/dashboard.service';
import {
  createDashboardSchema,
  updateDashboardSchema,
  addComponentSchema,
  updateComponentSchema,
} from '@kol360/shared';

export const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  // Get dashboard for campaign
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/dashboard',
    async (request, reply) => {
      const { campaignId } = request.params;

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
      const dashboard = await dashboardService.publish(dashboardId);
      return dashboard;
    }
  );

  // Unpublish dashboard
  fastify.post<{ Params: { dashboardId: string } }>(
    '/dashboards/:dashboardId/unpublish',
    async (request, reply) => {
      const { dashboardId } = request.params;
      const dashboard = await dashboardService.unpublish(dashboardId);
      return dashboard;
    }
  );

  // Add component to dashboard
  fastify.post<{ Params: { dashboardId: string }; Body: unknown }>(
    '/dashboards/:dashboardId/components',
    async (request, reply) => {
      const { dashboardId } = request.params;
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
      await dashboardService.removeComponent(componentId);
      return reply.status(204).send();
    }
  );

  // Toggle component visibility
  fastify.post<{ Params: { componentId: string } }>(
    '/components/:componentId/toggle',
    async (request, reply) => {
      const { componentId } = request.params;
      const component = await dashboardService.toggleComponentVisibility(componentId);
      return component;
    }
  );

  // Reorder components
  fastify.post<{ Params: { dashboardId: string }; Body: { componentIds: string[] } }>(
    '/dashboards/:dashboardId/reorder',
    async (request, reply) => {
      const { dashboardId } = request.params;
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
      const stats = await dashboardService.getStats(campaignId);
      return stats;
    }
  );

  // Get completion funnel data
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/dashboard/funnel',
    async (request, reply) => {
      const { campaignId } = request.params;
      const funnel = await dashboardService.getCompletionFunnel(campaignId);
      return funnel;
    }
  );

  // Get score distribution
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/dashboard/score-distribution',
    async (request, reply) => {
      const { campaignId } = request.params;
      const distribution = await dashboardService.getScoreDistribution(campaignId);
      return distribution;
    }
  );

  // Get top KOLs
  fastify.get<{ Params: { campaignId: string }; Querystring: { limit?: string } }>(
    '/campaigns/:campaignId/dashboard/top-kols',
    async (request, reply) => {
      const { campaignId } = request.params;
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
