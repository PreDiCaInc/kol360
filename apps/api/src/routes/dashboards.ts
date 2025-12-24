import { FastifyPluginAsync, FastifyReply } from 'fastify';
import { dashboardService } from '../services/dashboard.service';
import {
  createDashboardSchema,
  updateDashboardSchema,
  addComponentSchema,
  updateComponentSchema,
} from '@kol360/shared';

export const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  // ===== Platform Admin Dashboard Stats =====

  // Get overall dashboard stats (for platform admin home)
  fastify.get('/dashboard/stats', async (request, reply) => {
    const user = request.user;

    // Get client filter for non-platform admins
    const clientFilter = user?.role !== 'PLATFORM_ADMIN' && user?.tenantId
      ? { clientId: user.tenantId }
      : undefined;

    // Get counts
    const [
      clientsCount,
      campaignsCount,
      hcpsCount,
      responsesCount,
      nominationsCount,
      usersCount,
    ] = await Promise.all([
      // Clients (platform admin only)
      user?.role === 'PLATFORM_ADMIN'
        ? fastify.prisma.client.count()
        : Promise.resolve(0),

      // Campaigns by status
      fastify.prisma.campaign.groupBy({
        by: ['status'],
        _count: { id: true },
        where: clientFilter,
      }),

      // HCPs total and new this week
      Promise.all([
        fastify.prisma.hcp.count(),
        fastify.prisma.hcp.count({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        }),
      ]),

      // Response stats
      Promise.all([
        fastify.prisma.surveyResponse.count({ where: clientFilter ? { campaign: clientFilter } : undefined }),
        fastify.prisma.surveyResponse.count({
          where: {
            status: 'COMPLETED',
            ...(clientFilter ? { campaign: clientFilter } : {}),
          },
        }),
      ]),

      // Nomination stats
      fastify.prisma.nomination.groupBy({
        by: ['matchStatus'],
        _count: { id: true },
        where: clientFilter ? { response: { campaign: clientFilter } } : undefined,
      }),

      // User stats
      Promise.all([
        fastify.prisma.user.count({ where: clientFilter }),
        fastify.prisma.user.count({
          where: { status: 'PENDING_APPROVAL', ...clientFilter },
        }),
      ]),
    ]);

    // Calculate lite clients
    const liteClientsCount = user?.role === 'PLATFORM_ADMIN'
      ? await fastify.prisma.client.count({ where: { type: 'LITE' } })
      : 0;

    // Process campaigns by status
    const campaignsByStatus = campaignsCount.reduce((acc: Record<string, number>, item) => {
      acc[item.status] = item._count.id;
      return acc;
    }, {});

    // Process nominations by status
    const nominationsByStatus = nominationsCount.reduce((acc: Record<string, number>, item) => {
      acc[item.matchStatus] = item._count.id;
      return acc;
    }, {});

    const [hcpTotal, hcpNewThisWeek] = hcpsCount;
    const [totalResponses, completedResponses] = responsesCount;
    const [totalUsers, pendingApproval] = usersCount;

    return {
      clients: {
        total: clientsCount,
        active: await fastify.prisma.client.count({ where: { isActive: true } }),
        lite: liteClientsCount,
      },
      campaigns: {
        total: Object.values(campaignsByStatus).reduce((a, b) => a + b, 0),
        active: campaignsByStatus.ACTIVE || 0,
        draft: campaignsByStatus.DRAFT || 0,
        closed: campaignsByStatus.CLOSED || 0,
        published: campaignsByStatus.PUBLISHED || 0,
      },
      hcps: {
        total: hcpTotal,
        newThisWeek: hcpNewThisWeek,
      },
      responses: {
        total: totalResponses,
        completed: completedResponses,
        pending: totalResponses - completedResponses,
        completionRate: totalResponses > 0 ? Math.round((completedResponses / totalResponses) * 100) : 0,
      },
      nominations: {
        total: Object.values(nominationsByStatus).reduce((a, b) => a + b, 0),
        matched: nominationsByStatus.MATCHED || 0,
        unmatched: nominationsByStatus.UNMATCHED || 0,
        pendingReview: nominationsByStatus.UNMATCHED || 0,
      },
      users: {
        total: totalUsers,
        pendingApproval,
      },
    };
  });

  // Get client dashboard (for "View as Client" and client admins)
  fastify.get<{ Params: { clientId: string } }>(
    '/dashboards/client/:clientId',
    async (request, reply) => {
      const { clientId } = request.params;
      const user = request.user;

      // Verify access
      if (user?.role !== 'PLATFORM_ADMIN' && user?.tenantId !== clientId) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      // Get client info
      const client = await fastify.prisma.client.findUnique({
        where: { id: clientId },
        select: { id: true, name: true, type: true },
      });

      if (!client) {
        return reply.status(404).send({ error: 'Client not found' });
      }

      // Get disease areas for this client
      let diseaseAreas;
      if (client.type === 'LITE') {
        // Lite clients have specific disease area access
        diseaseAreas = await fastify.prisma.liteClientDiseaseArea.findMany({
          where: { clientId, isActive: true },
          include: { diseaseArea: true },
        }).then(items => items.map(i => i.diseaseArea));
      } else {
        // Full clients can see all disease areas from their campaigns
        diseaseAreas = await fastify.prisma.campaign.findMany({
          where: { clientId },
          select: { diseaseArea: true },
          distinct: ['diseaseAreaId'],
        }).then(items => items.map(i => i.diseaseArea));
      }

      // Get top KOLs with scores
      const topKols = await fastify.prisma.hcpDiseaseAreaScore.findMany({
        where: {
          isCurrent: true,
          diseaseAreaId: diseaseAreas.length > 0 ? { in: diseaseAreas.map(d => d.id) } : undefined,
          compositeScore: { not: null },
        },
        include: {
          hcp: {
            select: { id: true, firstName: true, lastName: true, specialty: true },
          },
        },
        orderBy: { compositeScore: 'desc' },
        take: 20,
      });

      // Get stats
      const publishedCampaigns = await fastify.prisma.campaign.count({
        where: { clientId, status: 'PUBLISHED' },
      });

      const avgCompositeScore = topKols.length > 0
        ? topKols.reduce((sum, k) => sum + Number(k.compositeScore || 0), 0) / topKols.length
        : 0;

      return {
        client,
        diseaseAreas,
        topKols: topKols.map((score, index) => ({
          id: score.hcp.id,
          firstName: score.hcp.firstName,
          lastName: score.hcp.lastName,
          specialty: score.hcp.specialty,
          compositeScore: Number(score.compositeScore),
          surveyScore: Number(score.scoreSurvey || 0),
          rank: index + 1,
        })),
        stats: {
          totalHcps: topKols.length,
          publishedCampaigns,
          avgCompositeScore,
        },
      };
    }
  );

  // ===== Dashboard Templates Management =====

  // List dashboard templates
  fastify.get('/dashboard-templates', async (request, reply) => {
    const user = request.user;
    if (user?.role !== 'PLATFORM_ADMIN') {
      return reply.status(403).send({ error: 'Platform admin access required' });
    }

    const templates = await fastify.prisma.dashboardTemplate.findMany({
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });

    return { items: templates };
  });

  // Get single dashboard template
  fastify.get<{ Params: { id: string } }>('/dashboard-templates/:id', async (request, reply) => {
    const { id } = request.params;
    const user = request.user;

    if (user?.role !== 'PLATFORM_ADMIN') {
      return reply.status(403).send({ error: 'Platform admin access required' });
    }

    const template = await fastify.prisma.dashboardTemplate.findUnique({
      where: { id },
      include: { templateComponents: { orderBy: { displayOrder: 'asc' } } },
    });

    if (!template) {
      return reply.status(404).send({ error: 'Template not found' });
    }

    return template;
  });

  // Create dashboard template
  fastify.post<{
    Body: {
      name: string;
      description?: string;
      isDefault?: boolean;
      isActive?: boolean;
      componentKeys?: string[];
    };
  }>('/dashboard-templates', async (request, reply) => {
    const user = request.user;
    if (user?.role !== 'PLATFORM_ADMIN') {
      return reply.status(403).send({ error: 'Platform admin access required' });
    }

    const { name, description, isDefault, isActive, componentKeys } = request.body;

    // If setting as default, unset other defaults
    if (isDefault) {
      await fastify.prisma.dashboardTemplate.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await fastify.prisma.dashboardTemplate.create({
      data: {
        name,
        description,
        isDefault: isDefault ?? false,
        isActive: isActive ?? true,
        componentKeys: componentKeys || [],
        createdBy: user?.sub,
      },
    });

    return reply.status(201).send(template);
  });

  // Update dashboard template
  fastify.put<{
    Params: { id: string };
    Body: {
      name?: string;
      description?: string;
      isDefault?: boolean;
      isActive?: boolean;
      componentKeys?: string[];
    };
  }>('/dashboard-templates/:id', async (request, reply) => {
    const { id } = request.params;
    const user = request.user;

    if (user?.role !== 'PLATFORM_ADMIN') {
      return reply.status(403).send({ error: 'Platform admin access required' });
    }

    const { isDefault, ...updateData } = request.body;

    // If setting as default, unset other defaults
    if (isDefault) {
      await fastify.prisma.dashboardTemplate.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const template = await fastify.prisma.dashboardTemplate.update({
      where: { id },
      data: { ...updateData, isDefault },
    });

    return template;
  });

  // Delete dashboard template
  fastify.delete<{ Params: { id: string } }>('/dashboard-templates/:id', async (request, reply) => {
    const { id } = request.params;
    const user = request.user;

    if (user?.role !== 'PLATFORM_ADMIN') {
      return reply.status(403).send({ error: 'Platform admin access required' });
    }

    // Check if it's the default template
    const template = await fastify.prisma.dashboardTemplate.findUnique({
      where: { id },
    });

    if (template?.isDefault) {
      return reply.status(400).send({ error: 'Cannot delete the default template' });
    }

    await fastify.prisma.dashboardTemplate.delete({ where: { id } });
    return reply.status(204).send();
  });
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
    const dashboard = await fastify.prisma.dashboardConfig.findUnique({
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
