import { FastifyPluginAsync } from 'fastify';
import {
  createSurveyTemplateSchema,
  updateSurveyTemplateSchema,
  addSectionToTemplateSchema,
  reorderSectionsSchema,
  cloneTemplateSchema,
} from '@kol360/shared';
import { requireClientAdmin } from '../middleware/rbac';
import { SurveyTemplateService } from '../services/survey-template.service';

const surveyTemplateService = new SurveyTemplateService();

export const surveyTemplateRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireClientAdmin());

  // List all survey templates
  fastify.get('/', async () => {
    return surveyTemplateService.list();
  });

  // Get survey template by ID
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const template = await surveyTemplateService.getById(request.params.id);
    if (!template) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Survey template not found',
        statusCode: 404,
      });
    }
    return template;
  });

  // Create survey template
  fastify.post('/', async (request, reply) => {
    const data = createSurveyTemplateSchema.parse(request.body);
    const template = await surveyTemplateService.create(data);

    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'survey_template.created',
        entityType: 'SurveyTemplate',
        entityId: template.id,
        newValues: { name: data.name },
      },
    });

    return reply.status(201).send(template);
  });

  // Update survey template
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const data = updateSurveyTemplateSchema.parse(request.body);
    const existing = await surveyTemplateService.getById(request.params.id);

    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Survey template not found',
        statusCode: 404,
      });
    }

    const template = await surveyTemplateService.update(request.params.id, data);

    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'survey_template.updated',
        entityType: 'SurveyTemplate',
        entityId: template.id,
        oldValues: { name: existing.name },
        newValues: data,
      },
    });

    return template;
  });

  // Delete survey template
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      await surveyTemplateService.delete(request.params.id);

      await fastify.prisma.auditLog.create({
        data: {
          userId: request.user!.sub,
          action: 'survey_template.deleted',
          entityType: 'SurveyTemplate',
          entityId: request.params.id,
        },
      });

      return reply.status(204).send();
    } catch (error) {
      if (error instanceof Error && error.message.includes('used by campaigns')) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: error.message,
          statusCode: 400,
        });
      }
      throw error;
    }
  });

  // Clone survey template
  fastify.post<{ Params: { id: string } }>('/:id/clone', async (request, reply) => {
    const { name } = cloneTemplateSchema.parse(request.body);

    try {
      const template = await surveyTemplateService.clone(request.params.id, name);

      await fastify.prisma.auditLog.create({
        data: {
          userId: request.user!.sub,
          action: 'survey_template.cloned',
          entityType: 'SurveyTemplate',
          entityId: template.id,
          newValues: { name, sourceId: request.params.id },
        },
      });

      return reply.status(201).send(template);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({
          error: 'Not Found',
          message: error.message,
          statusCode: 404,
        });
      }
      throw error;
    }
  });

  // Add section to template
  fastify.post<{ Params: { id: string } }>('/:id/sections', async (request, reply) => {
    const { sectionId, isLocked } = addSectionToTemplateSchema.parse(request.body);

    try {
      const templateSection = await surveyTemplateService.addSection(
        request.params.id,
        sectionId,
        isLocked
      );

      await fastify.prisma.auditLog.create({
        data: {
          userId: request.user!.sub,
          action: 'survey_template.section_added',
          entityType: 'TemplateSection',
          entityId: templateSection.id,
          newValues: { templateId: request.params.id, sectionId },
        },
      });

      return reply.status(201).send(templateSection);
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        return reply.status(409).send({
          error: 'Conflict',
          message: error.message,
          statusCode: 409,
        });
      }
      throw error;
    }
  });

  // Remove section from template
  fastify.delete<{ Params: { id: string; sectionId: string } }>(
    '/:id/sections/:sectionId',
    async (request, reply) => {
      await surveyTemplateService.removeSection(request.params.id, request.params.sectionId);

      await fastify.prisma.auditLog.create({
        data: {
          userId: request.user!.sub,
          action: 'survey_template.section_removed',
          entityType: 'TemplateSection',
          entityId: `${request.params.id}-${request.params.sectionId}`,
        },
      });

      return reply.status(204).send();
    }
  );

  // Reorder sections in template
  fastify.put<{ Params: { id: string } }>('/:id/sections/reorder', async (request) => {
    const { sectionIds } = reorderSectionsSchema.parse(request.body);
    await surveyTemplateService.reorderSections(request.params.id, sectionIds);
    return { success: true };
  });
};
