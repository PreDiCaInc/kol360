import { FastifyRequest, FastifyReply } from 'fastify';
import { UserRole } from '@kol360/shared';
import { PrismaClient } from '@prisma/client';

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

// v1.17.17: read-only access for any authenticated tenant user (incl.
// TEAM_MEMBER). Use this as the GATE preHandler — pair it with
// gateWritesToAdmins() so members can read, admins can write. Routes
// that MUST stay admin-only (e.g. /clients cross-tenant view) keep
// their existing requireClientAdmin/requirePlatformAdmin instead.
export function requireTenantUser() {
  return requireRole('PLATFORM_ADMIN', 'CLIENT_ADMIN', 'TEAM_MEMBER');
}

// v1.17.17: 403 any non-GET request from a non-admin. Combined with a
// requireTenantUser() gate above, this gives the standard "members read,
// admins write" model for a route file in two lines instead of per-route
// writeGuards on every POST/PUT/PATCH/DELETE. Methods are matched
// case-insensitively; OPTIONS/HEAD pass through.
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export function gateWritesToAdmins() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!WRITE_METHODS.has(request.method.toUpperCase())) return;
    const role = request.user?.role;
    if (role === 'PLATFORM_ADMIN' || role === 'CLIENT_ADMIN') return;
    return reply.status(403).send({
      error: 'Forbidden',
      message: 'Insufficient permissions for write operation',
      statusCode: 403,
    });
  };
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

// ============================================================================
// Tenant Access Helper Functions
// ============================================================================

/**
 * Get disease area IDs that a client has campaigns in
 */
export async function getClientDiseaseAreaIds(
  prisma: PrismaClient,
  clientId: string
): Promise<string[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { clientId },
    select: { diseaseAreaId: true },
    distinct: ['diseaseAreaId'],
  });
  return campaigns.map((c) => c.diseaseAreaId);
}

/**
 * Get HCP IDs assigned to a client's campaigns
 */
export async function getClientHcpIds(
  prisma: PrismaClient,
  clientId: string
): Promise<string[]> {
  const campaignHcps = await prisma.campaignHcp.findMany({
    where: {
      campaign: { clientId },
    },
    select: { hcpId: true },
    distinct: ['hcpId'],
  });
  return campaignHcps.map((ch) => ch.hcpId);
}

/**
 * Check if a user has access to a specific disease area (via campaigns)
 */
export async function hasDiseaseAreaAccess(
  prisma: PrismaClient,
  diseaseAreaId: string,
  user: { role: string; tenantId?: string }
): Promise<boolean> {
  // Platform admins can access all disease areas
  if (user.role === 'PLATFORM_ADMIN') return true;
  if (!user.tenantId) return false;

  const count = await prisma.campaign.count({
    where: {
      clientId: user.tenantId,
      diseaseAreaId,
    },
  });

  return count > 0;
}

/**
 * Check if a user has access to a specific HCP (via campaign assignments)
 */
export async function hasHcpAccess(
  prisma: PrismaClient,
  hcpId: string,
  user: { role: string; tenantId?: string }
): Promise<boolean> {
  // Platform admins can access all HCPs
  if (user.role === 'PLATFORM_ADMIN') return true;
  if (!user.tenantId) return false;

  const count = await prisma.campaignHcp.count({
    where: {
      hcpId,
      campaign: { clientId: user.tenantId },
    },
  });

  return count > 0;
}
