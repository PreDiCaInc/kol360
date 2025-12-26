import { FastifyPluginAsync } from 'fastify';
import { createClientSchema, updateClientSchema } from '@kol360/shared';
import { requirePlatformAdmin } from '../middleware/rbac';
import { ClientService } from '../services/client.service';
import { createAuditLog } from '../lib/audit';

const clientService = new ClientService();

export const clientRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply admin auth to all routes
  fastify.addHook('preHandler', requirePlatformAdmin());

  // List clients
  fastify.get('/', async (request) => {
    const { includeInactive } = request.query as { includeInactive?: string };
    const clients = await clientService.list(includeInactive === 'true');
    return { items: clients };
  });

  // Get client by ID
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const client = await clientService.getById(request.params.id);
    if (!client) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Client not found',
        statusCode: 404
      });
    }
    return client;
  });

  // Create client
  fastify.post('/', async (request, reply) => {
    const data = createClientSchema.parse(request.body);
    const client = await clientService.create(data, request.user!.sub);

    // Audit log
    await createAuditLog(request.user!.sub, {
      action: 'client.created',
      entityType: 'Client',
      entityId: client.id,
      newValues: data,
      tenantId: client.id,
    });

    return reply.status(201).send(client);
  });

  // Update client
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const data = updateClientSchema.parse(request.body);
    const existing = await clientService.getById(request.params.id);

    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Client not found',
        statusCode: 404
      });
    }

    const client = await clientService.update(request.params.id, data);

    // Audit log
    await createAuditLog(request.user!.sub, {
      action: 'client.updated',
      entityType: 'Client',
      entityId: client.id,
      oldValues: existing,
      newValues: data,
      tenantId: client.id,
    });

    return client;
  });

  // Deactivate client (soft delete)
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const existing = await clientService.getById(request.params.id);

    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Client not found',
        statusCode: 404
      });
    }

    await clientService.deactivate(request.params.id);

    // Audit log
    await createAuditLog(request.user!.sub, {
      action: 'client.deactivated',
      entityType: 'Client',
      entityId: request.params.id,
      oldValues: { isActive: true },
      newValues: { isActive: false },
      tenantId: request.params.id,
    });

    return reply.status(204).send();
  });
};
