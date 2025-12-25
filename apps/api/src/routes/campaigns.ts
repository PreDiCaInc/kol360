import { FastifyPluginAsync } from 'fastify';
import {
  createCampaignSchema,
  updateCampaignSchema,
  campaignListQuerySchema,
  emailTemplatesSchema,
  landingPageTemplatesSchema,
} from '@kol360/shared';
import { requireClientAdmin } from '../middleware/rbac';
import { CampaignService } from '../services/campaign.service';
import { createAuditLog } from '../lib/audit';

const campaignService = new CampaignService();

export const campaignRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireClientAdmin());

  // List campaigns
  fastify.get('/', async (request) => {
    const query = campaignListQuerySchema.parse(request.query);

    // Client admins can only see their own tenant's campaigns
    const effectiveClientId = request.user!.role === 'PLATFORM_ADMIN'
      ? query.clientId
      : request.user!.tenantId;

    return campaignService.list({ ...query, clientId: effectiveClientId });
  });

  // Get campaign by ID
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const campaign = await campaignService.getById(request.params.id);
    if (!campaign) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Campaign not found',
        statusCode: 404,
      });
    }

    // Client admins can only view campaigns from their tenant
    if (request.user!.role !== 'PLATFORM_ADMIN' && campaign.clientId !== request.user!.tenantId) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Cannot access campaigns from other tenants',
        statusCode: 403,
      });
    }

    return campaign;
  });

  // Create campaign
  fastify.post('/', async (request, reply) => {
    const data = createCampaignSchema.parse(request.body);

    // Client admins can only create campaigns for their own tenant
    if (request.user!.role !== 'PLATFORM_ADMIN') {
      if (data.clientId && data.clientId !== request.user!.tenantId) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Cannot create campaigns for other tenants',
          statusCode: 403,
        });
      }
      // Force clientId to their tenant
      data.clientId = request.user!.tenantId!;
    }

    const campaign = await campaignService.create(data, request.user!.sub);

    await createAuditLog(request.user!.sub, {
      action: 'campaign.created',
      entityType: 'Campaign',
      entityId: campaign.id,
      newValues: { name: data.name, clientId: data.clientId },
      tenantId: data.clientId,
    });

    return reply.status(201).send(campaign);
  });

  // Update campaign
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const data = updateCampaignSchema.parse(request.body);
    const existing = await campaignService.getById(request.params.id);

    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Campaign not found',
        statusCode: 404,
      });
    }

    // Client admins can only update campaigns from their tenant
    if (request.user!.role !== 'PLATFORM_ADMIN' && existing.clientId !== request.user!.tenantId) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Cannot update campaigns from other tenants',
        statusCode: 403,
      });
    }

    const campaign = await campaignService.update(request.params.id, data);

    await createAuditLog(request.user!.sub, {
      action: 'campaign.updated',
      entityType: 'Campaign',
      entityId: campaign.id,
      newValues: data,
    });

    return campaign;
  });

  // Delete campaign (draft only)
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const existing = await campaignService.getById(request.params.id);

    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Campaign not found',
        statusCode: 404,
      });
    }

    // Client admins can only delete campaigns from their tenant
    if (request.user!.role !== 'PLATFORM_ADMIN' && existing.clientId !== request.user!.tenantId) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Cannot delete campaigns from other tenants',
        statusCode: 403,
      });
    }

    try {
      await campaignService.delete(request.params.id);

      await createAuditLog(request.user!.sub, {
        action: 'campaign.deleted',
        entityType: 'Campaign',
        entityId: request.params.id,
      });

      return reply.status(204).send();
    } catch (error) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: error instanceof Error ? error.message : 'Cannot delete campaign',
        statusCode: 400,
      });
    }
  });

  // Activate campaign (DRAFT -> ACTIVE)
  fastify.post<{ Params: { id: string } }>('/:id/activate', async (request, reply) => {
    const existing = await campaignService.getById(request.params.id);

    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Campaign not found',
        statusCode: 404,
      });
    }

    // Client admins can only activate campaigns from their tenant
    if (request.user!.role !== 'PLATFORM_ADMIN' && existing.clientId !== request.user!.tenantId) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Cannot activate campaigns from other tenants',
        statusCode: 403,
      });
    }

    try {
      const campaign = await campaignService.activate(request.params.id);

      await createAuditLog(request.user!.sub, {
        action: 'campaign.activated',
        entityType: 'Campaign',
        entityId: campaign.id,
        newValues: { status: 'ACTIVE' },
      });

      return campaign;
    } catch (error) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: error instanceof Error ? error.message : 'Cannot activate campaign',
        statusCode: 400,
      });
    }
  });

  // Close campaign (ACTIVE -> CLOSED)
  fastify.post<{ Params: { id: string } }>('/:id/close', async (request, reply) => {
    const existing = await campaignService.getById(request.params.id);

    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Campaign not found',
        statusCode: 404,
      });
    }

    // Client admins can only close campaigns from their tenant
    if (request.user!.role !== 'PLATFORM_ADMIN' && existing.clientId !== request.user!.tenantId) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Cannot close campaigns from other tenants',
        statusCode: 403,
      });
    }

    try {
      const campaign = await campaignService.close(request.params.id);

      await createAuditLog(request.user!.sub, {
        action: 'campaign.closed',
        entityType: 'Campaign',
        entityId: campaign.id,
        newValues: { status: 'CLOSED' },
      });

      return campaign;
    } catch (error) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: error instanceof Error ? error.message : 'Cannot close campaign',
        statusCode: 400,
      });
    }
  });

  // Reopen campaign (CLOSED -> ACTIVE)
  fastify.post<{ Params: { id: string } }>('/:id/reopen', async (request, reply) => {
    const existing = await campaignService.getById(request.params.id);

    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Campaign not found',
        statusCode: 404,
      });
    }

    // Client admins can only reopen campaigns from their tenant
    if (request.user!.role !== 'PLATFORM_ADMIN' && existing.clientId !== request.user!.tenantId) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Cannot reopen campaigns from other tenants',
        statusCode: 403,
      });
    }

    try {
      const campaign = await campaignService.reopen(request.params.id);

      await createAuditLog(request.user!.sub, {
        action: 'campaign.reopened',
        entityType: 'Campaign',
        entityId: campaign.id,
        newValues: { status: 'ACTIVE' },
      });

      return campaign;
    } catch (error) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: error instanceof Error ? error.message : 'Cannot reopen campaign',
        statusCode: 400,
      });
    }
  });

  // Publish campaign (CLOSED -> PUBLISHED)
  fastify.post<{ Params: { id: string } }>('/:id/publish', async (request, reply) => {
    const existing = await campaignService.getById(request.params.id);

    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Campaign not found',
        statusCode: 404,
      });
    }

    // Client admins can only publish campaigns from their tenant
    if (request.user!.role !== 'PLATFORM_ADMIN' && existing.clientId !== request.user!.tenantId) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Cannot publish campaigns from other tenants',
        statusCode: 403,
      });
    }

    try {
      const campaign = await campaignService.publish(request.params.id, request.user!.sub);

      await createAuditLog(request.user!.sub, {
        action: 'campaign.published',
        entityType: 'Campaign',
        entityId: campaign.id,
        newValues: { status: 'PUBLISHED', publishedAt: campaign.publishedAt },
      });

      return campaign;
    } catch (error) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: error instanceof Error ? error.message : 'Cannot publish campaign',
        statusCode: 400,
      });
    }
  });

  // Get email templates for campaign
  fastify.get<{ Params: { id: string } }>('/:id/email-templates', async (request, reply) => {
    const campaign = await campaignService.getById(request.params.id);
    if (!campaign) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Campaign not found',
        statusCode: 404,
      });
    }

    // Client admins can only view templates from their tenant
    if (request.user!.role !== 'PLATFORM_ADMIN' && campaign.clientId !== request.user!.tenantId) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Cannot access campaigns from other tenants',
        statusCode: 403,
      });
    }

    return {
      invitationEmailSubject: campaign.invitationEmailSubject,
      invitationEmailBody: campaign.invitationEmailBody,
      reminderEmailSubject: campaign.reminderEmailSubject,
      reminderEmailBody: campaign.reminderEmailBody,
    };
  });

  // Update email templates for campaign
  fastify.put<{ Params: { id: string } }>('/:id/email-templates', async (request, reply) => {
    const data = emailTemplatesSchema.parse(request.body);
    const existing = await campaignService.getById(request.params.id);

    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Campaign not found',
        statusCode: 404,
      });
    }

    // Client admins can only update templates from their tenant
    if (request.user!.role !== 'PLATFORM_ADMIN' && existing.clientId !== request.user!.tenantId) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Cannot update campaigns from other tenants',
        statusCode: 403,
      });
    }

    const campaign = await campaignService.updateEmailTemplates(request.params.id, data);

    await createAuditLog(request.user!.sub, {
      action: 'campaign.email_templates_updated',
      entityType: 'Campaign',
      entityId: campaign.id,
      newValues: {
        invitationEmailSubject: data.invitationEmailSubject ? '(updated)' : null,
        reminderEmailSubject: data.reminderEmailSubject ? '(updated)' : null,
      },
    });

    return {
      invitationEmailSubject: campaign.invitationEmailSubject,
      invitationEmailBody: campaign.invitationEmailBody,
      reminderEmailSubject: campaign.reminderEmailSubject,
      reminderEmailBody: campaign.reminderEmailBody,
    };
  });

  // Get landing page templates for campaign
  fastify.get<{ Params: { id: string } }>('/:id/landing-page-templates', async (request, reply) => {
    const campaign = await campaignService.getById(request.params.id);
    if (!campaign) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Campaign not found',
        statusCode: 404,
      });
    }

    // Client admins can only view templates from their tenant
    if (request.user!.role !== 'PLATFORM_ADMIN' && campaign.clientId !== request.user!.tenantId) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Cannot access campaigns from other tenants',
        statusCode: 403,
      });
    }

    return {
      surveyWelcomeTitle: campaign.surveyWelcomeTitle,
      surveyWelcomeMessage: campaign.surveyWelcomeMessage,
      surveyThankYouTitle: campaign.surveyThankYouTitle,
      surveyThankYouMessage: campaign.surveyThankYouMessage,
      surveyAlreadyDoneTitle: campaign.surveyAlreadyDoneTitle,
      surveyAlreadyDoneMessage: campaign.surveyAlreadyDoneMessage,
    };
  });

  // Update landing page templates for campaign
  fastify.put<{ Params: { id: string } }>('/:id/landing-page-templates', async (request, reply) => {
    const data = landingPageTemplatesSchema.parse(request.body);
    const existing = await campaignService.getById(request.params.id);

    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Campaign not found',
        statusCode: 404,
      });
    }

    // Client admins can only update templates from their tenant
    if (request.user!.role !== 'PLATFORM_ADMIN' && existing.clientId !== request.user!.tenantId) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Cannot update campaigns from other tenants',
        statusCode: 403,
      });
    }

    const campaign = await campaignService.updateLandingPageTemplates(request.params.id, data);

    await createAuditLog(request.user!.sub, {
      action: 'campaign.landing_page_templates_updated',
      entityType: 'Campaign',
      entityId: campaign.id,
      newValues: {
        surveyWelcomeTitle: data.surveyWelcomeTitle ? '(updated)' : null,
        surveyThankYouTitle: data.surveyThankYouTitle ? '(updated)' : null,
      },
    });

    return {
      surveyWelcomeTitle: campaign.surveyWelcomeTitle,
      surveyWelcomeMessage: campaign.surveyWelcomeMessage,
      surveyThankYouTitle: campaign.surveyThankYouTitle,
      surveyThankYouMessage: campaign.surveyThankYouMessage,
      surveyAlreadyDoneTitle: campaign.surveyAlreadyDoneTitle,
      surveyAlreadyDoneMessage: campaign.surveyAlreadyDoneMessage,
    };
  });

  // Get survey preview data for a campaign
  fastify.get<{ Params: { id: string } }>('/:id/survey-preview', async (request, reply) => {
    const campaignId = request.params.id;

    const campaign = await fastify.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        surveyQuestions: {
          include: {
            question: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!campaign) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Campaign not found',
        statusCode: 404,
      });
    }

    // Client admins can only view their own campaigns
    if (request.user!.role !== 'PLATFORM_ADMIN' && campaign.clientId !== request.user!.tenantId) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Cannot access campaigns from other tenants',
        statusCode: 403,
      });
    }

    // Transform questions for preview
    const questions = campaign.surveyQuestions.map((sq) => ({
      id: sq.id,
      questionId: sq.questionId,
      text: sq.questionTextSnapshot,
      type: sq.question.type,
      section: sq.sectionName,
      isRequired: sq.isRequired,
      options: sq.question.options,
      minEntries: sq.question.minEntries,
      defaultEntries: sq.question.defaultEntries,
      nominationType: sq.nominationType,
    }));

    // Group by section
    const sections: Record<string, typeof questions> = {};
    for (const q of questions) {
      const sectionName = q.section || 'General';
      if (!sections[sectionName]) {
        sections[sectionName] = [];
      }
      sections[sectionName].push(q);
    }

    return {
      campaignName: campaign.name,
      honorariumAmount: campaign.honorariumAmount ? Number(campaign.honorariumAmount) : null,
      welcomeTitle: campaign.surveyWelcomeTitle,
      welcomeMessage: campaign.surveyWelcomeMessage,
      thankYouTitle: campaign.surveyThankYouTitle,
      thankYouMessage: campaign.surveyThankYouMessage,
      questions,
      sections,
      totalQuestions: questions.length,
    };
  });

  // Get campaign audit log (status history)
  fastify.get<{ Params: { id: string } }>('/:id/audit-log', async (request, reply) => {
    const campaign = await campaignService.getById(request.params.id);
    if (!campaign) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Campaign not found',
        statusCode: 404,
      });
    }

    // Client admins can only view their own campaigns
    if (request.user!.role !== 'PLATFORM_ADMIN' && campaign.clientId !== request.user!.tenantId) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Cannot access campaigns from other tenants',
        statusCode: 403,
      });
    }

    // Query audit logs for this campaign
    const logs = await fastify.prisma.auditLog.findMany({
      where: {
        entityType: 'Campaign',
        entityId: request.params.id,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { items: logs };
  });
};
