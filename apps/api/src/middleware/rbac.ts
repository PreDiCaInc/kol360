import { FastifyRequest, FastifyReply } from 'fastify';
import { UserRole } from '@kol360/shared';

export function requireAuth() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
        statusCode: 401
      });
    }
  };
}

export function requireRole(...allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
        statusCode: 401
      });
    }

    if (!allowedRoles.includes(request.user.role as UserRole)) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Insufficient permissions',
        statusCode: 403
      });
    }
  };
}

export function requirePlatformAdmin() {
  return requireRole('PLATFORM_ADMIN');
}

export function requireClientAdmin() {
  return requireRole('PLATFORM_ADMIN', 'CLIENT_ADMIN');
}

export function requireTenantAccess(getTenantId: (request: FastifyRequest) => string | undefined) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized', statusCode: 401 });
    }

    // Platform admins can access all tenants
    if (request.user.role === 'PLATFORM_ADMIN') {
      return;
    }

    const requestedTenantId = getTenantId(request);
    if (requestedTenantId && request.user.tenantId !== requestedTenantId) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Cannot access other tenant data',
        statusCode: 403
      });
    }
  };
}
