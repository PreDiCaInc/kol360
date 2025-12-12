import { FastifyPluginAsync } from 'fastify';
import { createHcpSchema, updateHcpSchema } from '@kol360/shared';
import { requireClientAdmin } from '../middleware/rbac';
import { HcpService } from '../services/hcp.service';
import multipart from '@fastify/multipart';

const hcpService = new HcpService();

export const hcpRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit
  fastify.addHook('preHandler', requireClientAdmin());

  // Get filter options (specialties and states)
  fastify.get('/filters', async () => {
    const [specialties, states] = await Promise.all([
      hcpService.getSpecialties(),
      hcpService.getStates(),
    ]);
    return { specialties, states };
  });

  // Search HCPs
  fastify.get('/', async (request) => {
    const { query, specialty, state, page, limit } = request.query as {
      query?: string;
      specialty?: string;
      state?: string;
      page?: string;
      limit?: string;
    };

    return hcpService.search({
      query,
      specialty,
      state,
      page: parseInt(page || '1', 10),
      limit: parseInt(limit || '50', 10),
    });
  });

  // Get HCP by ID
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const hcp = await hcpService.getById(request.params.id);
    if (!hcp) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'HCP not found',
        statusCode: 404,
      });
    }
    return hcp;
  });

  // Create HCP
  fastify.post('/', async (request, reply) => {
    const data = createHcpSchema.parse(request.body);

    // Check for duplicate NPI
    const existing = await hcpService.getByNpi(data.npi);
    if (existing) {
      return reply.status(409).send({
        error: 'Conflict',
        message: 'HCP with this NPI already exists',
        statusCode: 409,
      });
    }

    const hcp = await hcpService.create(data, request.user!.sub);

    // Audit log
    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'hcp.created',
        entityType: 'Hcp',
        entityId: hcp.id,
        newValues: { npi: data.npi, name: `${data.firstName} ${data.lastName}` },
      },
    });

    return reply.status(201).send(hcp);
  });

  // Update HCP
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const data = updateHcpSchema.parse(request.body);
    const existing = await hcpService.getById(request.params.id);

    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'HCP not found',
        statusCode: 404,
      });
    }

    const hcp = await hcpService.update(request.params.id, data);

    // Audit log
    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'hcp.updated',
        entityType: 'Hcp',
        entityId: hcp.id,
        oldValues: { firstName: existing.firstName, lastName: existing.lastName },
        newValues: data,
      },
    });

    return hcp;
  });

  // Bulk import HCPs from Excel
  fastify.post('/import', async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'No file uploaded',
        statusCode: 400,
      });
    }

    const buffer = await file.toBuffer();
    const result = await hcpService.importFromExcel(buffer, request.user!.sub);

    // Audit log
    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'hcp.bulk_import',
        entityType: 'Hcp',
        entityId: 'bulk',
        newValues: { created: result.created, updated: result.updated, errors: result.errors.length },
      },
    });

    return result;
  });

  // Get HCP aliases
  fastify.get<{ Params: { id: string } }>('/:id/aliases', async (request) => {
    return hcpService.getAliases(request.params.id);
  });

  // Add alias to HCP
  fastify.post<{ Params: { id: string } }>('/:id/aliases', async (request, reply) => {
    const { aliasName } = request.body as { aliasName: string };

    if (!aliasName || typeof aliasName !== 'string' || !aliasName.trim()) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'aliasName is required',
        statusCode: 400,
      });
    }

    const hcp = await hcpService.getById(request.params.id);
    if (!hcp) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'HCP not found',
        statusCode: 404,
      });
    }

    const alias = await hcpService.addAlias(request.params.id, aliasName.trim(), request.user!.sub);

    // Audit log
    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'hcp.alias_added',
        entityType: 'HcpAlias',
        entityId: alias.id,
        newValues: { hcpId: request.params.id, aliasName },
      },
    });

    return reply.status(201).send(alias);
  });

  // Remove alias from HCP
  fastify.delete<{ Params: { id: string; aliasId: string } }>(
    '/:id/aliases/:aliasId',
    async (request, reply) => {
      await hcpService.removeAlias(request.params.aliasId);

      // Audit log
      await fastify.prisma.auditLog.create({
        data: {
          userId: request.user!.sub,
          action: 'hcp.alias_removed',
          entityType: 'HcpAlias',
          entityId: request.params.aliasId,
        },
      });

      return reply.status(204).send();
    }
  );

  // Bulk import aliases from Excel
  fastify.post('/aliases/import', async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'No file uploaded',
        statusCode: 400,
      });
    }

    const buffer = await file.toBuffer();
    const result = await hcpService.importAliases(buffer, request.user!.sub);

    // Audit log
    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'hcp.aliases_bulk_import',
        entityType: 'HcpAlias',
        entityId: 'bulk',
        newValues: { created: result.created, skipped: result.skipped, errors: result.errors.length },
      },
    });

    return result;
  });
};
