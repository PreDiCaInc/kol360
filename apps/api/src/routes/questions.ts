import { FastifyPluginAsync } from 'fastify';
import { createQuestionSchema, updateQuestionSchema } from '@kol360/shared';
import { requireClientAdmin } from '../middleware/rbac';
import { QuestionService } from '../services/question.service';

const questionService = new QuestionService();

export const questionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireClientAdmin());

  // Get categories (must be before /:id to avoid conflict)
  fastify.get('/categories', async () => {
    return questionService.getCategories();
  });

  // Get tags
  fastify.get('/tags', async () => {
    return questionService.getTags();
  });

  // List questions
  fastify.get('/', async (request) => {
    const { category, type, tags, status, search, page, limit } = request.query as {
      category?: string;
      type?: string;
      tags?: string;
      status?: string;
      search?: string;
      page?: string;
      limit?: string;
    };

    return questionService.list({
      category,
      type,
      tags: tags ? tags.split(',') : undefined,
      status: status || 'active',
      search,
      page: parseInt(page || '1', 10),
      limit: parseInt(limit || '50', 10),
    });
  });

  // Get question by ID
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const question = await questionService.getById(request.params.id);
    if (!question) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Question not found',
        statusCode: 404,
      });
    }
    return question;
  });

  // Create question
  fastify.post('/', async (request, reply) => {
    const data = createQuestionSchema.parse(request.body);
    const question = await questionService.create(data);

    // Audit log
    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'question.created',
        entityType: 'Question',
        entityId: question.id,
        newValues: { text: data.text, type: data.type, category: data.category },
      },
    });

    return reply.status(201).send(question);
  });

  // Update question
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const data = updateQuestionSchema.parse(request.body);

    const existing = await questionService.getById(request.params.id);
    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Question not found',
        statusCode: 404,
      });
    }

    try {
      const question = await questionService.update(request.params.id, data);

      // Audit log
      await fastify.prisma.auditLog.create({
        data: {
          userId: request.user!.sub,
          action: 'question.updated',
          entityType: 'Question',
          entityId: question.id,
          oldValues: { text: existing.text, type: existing.type },
          newValues: data,
        },
      });

      return question;
    } catch (error) {
      if (error instanceof Error && error.message.includes('active campaigns')) {
        return reply.status(409).send({
          error: 'Conflict',
          message: error.message,
          statusCode: 409,
        });
      }
      throw error;
    }
  });

  // Archive question
  fastify.post<{ Params: { id: string } }>('/:id/archive', async (request, reply) => {
    const existing = await questionService.getById(request.params.id);
    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Question not found',
        statusCode: 404,
      });
    }

    const question = await questionService.archive(request.params.id);

    // Audit log
    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'question.archived',
        entityType: 'Question',
        entityId: question.id,
      },
    });

    return question;
  });

  // Restore question
  fastify.post<{ Params: { id: string } }>('/:id/restore', async (request, reply) => {
    const existing = await questionService.getById(request.params.id);
    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Question not found',
        statusCode: 404,
      });
    }

    const question = await questionService.restore(request.params.id);

    // Audit log
    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'question.restored',
        entityType: 'Question',
        entityId: question.id,
      },
    });

    return question;
  });
};
