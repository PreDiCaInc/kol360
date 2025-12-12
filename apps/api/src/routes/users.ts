import { FastifyPluginAsync } from 'fastify';
import { createUserSchema, updateUserSchema } from '@kol360/shared';
import { requireClientAdmin, requirePlatformAdmin, requireTenantAccess } from '../middleware/rbac';
import { UserService } from '../services/user.service';

const userService = new UserService();

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  // List users - Platform Admin sees all, Client Admin sees their tenant
  fastify.get('/', {
    preHandler: requireClientAdmin(),
  }, async (request) => {
    const { clientId, role, status, page = '1', limit = '20' } = request.query as {
      clientId?: string;
      role?: string;
      status?: string;
      page?: string;
      limit?: string;
    };

    // Client admins can only see their own tenant's users
    const effectiveClientId = request.user!.role === 'PLATFORM_ADMIN'
      ? clientId
      : request.user!.tenantId;

    return userService.list({
      clientId: effectiveClientId,
      role,
      status,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  });

  // Get user by ID
  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: requireClientAdmin(),
  }, async (request, reply) => {
    const user = await userService.getById(request.params.id);

    if (!user) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'User not found',
        statusCode: 404
      });
    }

    // Client admins can only view users from their tenant
    if (request.user!.role !== 'PLATFORM_ADMIN' && user.clientId !== request.user!.tenantId) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Cannot access users from other tenants',
        statusCode: 403
      });
    }

    return user;
  });

  // Invite new user
  fastify.post('/invite', {
    preHandler: requireClientAdmin(),
  }, async (request, reply) => {
    const data = createUserSchema.parse(request.body);

    // Client admins can only invite to their own tenant
    if (request.user!.role === 'CLIENT_ADMIN') {
      if (data.clientId && data.clientId !== request.user!.tenantId) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Cannot invite users to other tenants',
          statusCode: 403
        });
      }
      // Force the clientId to their tenant
      data.clientId = request.user!.tenantId;

      // Client admins cannot create platform admins
      if (data.role === 'PLATFORM_ADMIN') {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Cannot create platform admin users',
          statusCode: 403
        });
      }
    }

    const user = await userService.invite(data);

    // Audit log
    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'user.invited',
        entityType: 'User',
        entityId: user.id,
        newValues: { email: data.email, role: data.role },
      },
    });

    return reply.status(201).send(user);
  });

  // Update user
  fastify.put<{ Params: { id: string } }>('/:id', {
    preHandler: requireClientAdmin(),
  }, async (request, reply) => {
    const data = updateUserSchema.parse(request.body);
    const existing = await userService.getById(request.params.id);

    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'User not found',
        statusCode: 404
      });
    }

    // Client admins can only update users from their tenant
    if (request.user!.role === 'CLIENT_ADMIN') {
      if (existing.clientId !== request.user!.tenantId) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Cannot update users from other tenants',
          statusCode: 403
        });
      }
      // Client admins cannot promote to platform admin
      if (data.role === 'PLATFORM_ADMIN') {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Cannot promote users to platform admin',
          statusCode: 403
        });
      }
    }

    const user = await userService.update(request.params.id, data);

    // Audit log
    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'user.updated',
        entityType: 'User',
        entityId: user.id,
        oldValues: { role: existing.role, firstName: existing.firstName, lastName: existing.lastName },
        newValues: data,
      },
    });

    return user;
  });

  // Approve pending user (Platform Admin only)
  fastify.post<{ Params: { id: string } }>('/:id/approve', {
    preHandler: requirePlatformAdmin(),
  }, async (request, reply) => {
    const existing = await userService.getById(request.params.id);

    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'User not found',
        statusCode: 404
      });
    }

    if (existing.status !== 'PENDING_VERIFICATION') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'User is not pending approval',
        statusCode: 400
      });
    }

    const user = await userService.approve(request.params.id, request.user!.sub);

    // Audit log
    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'user.approved',
        entityType: 'User',
        entityId: user.id,
        oldValues: { status: 'PENDING_VERIFICATION' },
        newValues: { status: 'ACTIVE' },
      },
    });

    return user;
  });

  // Disable user
  fastify.post<{ Params: { id: string } }>('/:id/disable', {
    preHandler: requireClientAdmin(),
  }, async (request, reply) => {
    const existing = await userService.getById(request.params.id);

    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'User not found',
        statusCode: 404
      });
    }

    // Client admins can only disable users from their tenant
    if (request.user!.role === 'CLIENT_ADMIN' && existing.clientId !== request.user!.tenantId) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Cannot disable users from other tenants',
        statusCode: 403
      });
    }

    // Prevent disabling yourself
    if (existing.cognitoSub === request.user!.sub) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Cannot disable your own account',
        statusCode: 400
      });
    }

    const user = await userService.disable(request.params.id);

    // Audit log
    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'user.disabled',
        entityType: 'User',
        entityId: user.id,
        oldValues: { status: existing.status },
        newValues: { status: 'DISABLED' },
      },
    });

    return user;
  });

  // Enable user
  fastify.post<{ Params: { id: string } }>('/:id/enable', {
    preHandler: requireClientAdmin(),
  }, async (request, reply) => {
    const existing = await userService.getById(request.params.id);

    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'User not found',
        statusCode: 404
      });
    }

    // Client admins can only enable users from their tenant
    if (request.user!.role === 'CLIENT_ADMIN' && existing.clientId !== request.user!.tenantId) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Cannot enable users from other tenants',
        statusCode: 403
      });
    }

    if (existing.status !== 'DISABLED') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'User is not disabled',
        statusCode: 400
      });
    }

    const user = await userService.enable(request.params.id);

    // Audit log
    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'user.enabled',
        entityType: 'User',
        entityId: user.id,
        oldValues: { status: 'DISABLED' },
        newValues: { status: 'ACTIVE' },
      },
    });

    return user;
  });
};
