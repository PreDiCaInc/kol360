import { FastifyPluginAsync } from 'fastify';
import {
  createSectionSchema,
  updateSectionSchema,
  addQuestionToSectionSchema,
  reorderQuestionsSchema,
} from '@kol360/shared';
import { requireClientAdmin } from '../middleware/rbac';
import { SectionService } from '../services/section.service';
import { createAuditLog } from '../lib/audit';

const sectionService = new SectionService();

export const sectionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireClientAdmin());

  // List all section templates
  fastify.get('/', async () => {
    return sectionService.list();
  });

  // Get section by ID
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const section = await sectionService.getById(request.params.id);
    if (!section) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Section template not found',
        statusCode: 404,
      });
    }
    return section;
  });

  // Create section template
  fastify.post('/', async (request, reply) => {
    const data = createSectionSchema.parse(request.body);
    const section = await sectionService.create(data);

    await createAuditLog(request.user!.sub, {
      action: 'section.created',
      entityType: 'SectionTemplate',
      entityId: section.id,
      newValues: { name: data.name },
    });

    return reply.status(201).send(section);
  });

  // Update section template
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const data = updateSectionSchema.parse(request.body);
    const existing = await sectionService.getById(request.params.id);

    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Section template not found',
        statusCode: 404,
      });
    }

    const section = await sectionService.update(request.params.id, data);

    await createAuditLog(request.user!.sub, {
      action: 'section.updated',
      entityType: 'SectionTemplate',
      entityId: section.id,
      oldValues: { name: existing.name },
      newValues: data,
    });

    return section;
  });

  // Delete section template
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      await sectionService.delete(request.params.id);

      await createAuditLog(request.user!.sub, {
        action: 'section.deleted',
        entityType: 'SectionTemplate',
        entityId: request.params.id,
      });

      return reply.status(204).send();
    } catch (error) {
      if (error instanceof Error && error.message.includes('core sections')) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: error.message,
          statusCode: 400,
        });
      }
      throw error;
    }
  });

  // Add question to section
  fastify.post<{ Params: { id: string } }>('/:id/questions', async (request, reply) => {
    const { questionId } = addQuestionToSectionSchema.parse(request.body);

    try {
      const sectionQuestion = await sectionService.addQuestion(request.params.id, questionId);

      await createAuditLog(request.user!.sub, {
        action: 'section.question_added',
        entityType: 'SectionQuestion',
        entityId: sectionQuestion.id,
        newValues: { sectionId: request.params.id, questionId },
      });

      return reply.status(201).send(sectionQuestion);
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

  // Remove question from section
  fastify.delete<{ Params: { id: string; questionId: string } }>(
    '/:id/questions/:questionId',
    async (request, reply) => {
      await sectionService.removeQuestion(request.params.id, request.params.questionId);

      await createAuditLog(request.user!.sub, {
        action: 'section.question_removed',
        entityType: 'SectionQuestion',
        entityId: `${request.params.id}-${request.params.questionId}`,
      });

      return reply.status(204).send();
    }
  );

  // Reorder questions in section
  fastify.put<{ Params: { id: string } }>('/:id/questions/reorder', async (request) => {
    const { questionIds } = reorderQuestionsSchema.parse(request.body);
    await sectionService.reorderQuestions(request.params.id, questionIds);
    return { success: true };
  });
};
