import { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/rbac';

export const diseaseAreaRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireAuth());

  // List all disease areas
  fastify.get('/', async () => {
    const diseaseAreas = await fastify.prisma.diseaseArea.findMany({
      where: { isActive: true },
      orderBy: [{ therapeuticArea: 'asc' }, { name: 'asc' }],
    });
    return { items: diseaseAreas };
  });

  // Get disease area by ID
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const diseaseArea = await fastify.prisma.diseaseArea.findUnique({
      where: { id: request.params.id },
    });
    if (!diseaseArea) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Disease area not found',
        statusCode: 404,
      });
    }
    return diseaseArea;
  });
};
