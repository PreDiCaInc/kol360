import { FastifyPluginAsync } from 'fastify';
import { requireTenantUser } from '../middleware/rbac';
import { ClientService } from '../services/client.service';

const clientService = new ClientService();

// v1.17.30 — GET /api/v1/clients/me
//
// The main /api/v1/clients/* routes (routes/clients.ts) are gated on
// requirePlatformAdmin so a TEAM_MEMBER or CLIENT_ADMIN can't read their
// own client from there. The header brand-badge component needs that read
// path though: it shows "Sun Pharma" + logo + color for hcp1@bio-exec.com.
//
// Registered as a separate plugin at the same /api/v1/clients prefix so
// it doesn't inherit the requirePlatformAdmin hook from the main plugin.
// Auth here is requireTenantUser (PLATFORM_ADMIN / CLIENT_ADMIN /
// TEAM_MEMBER), with PLATFORM_ADMIN getting null because they have no
// tenant — the badge component knows to fall back to the impersonation
// context (or hide) in that case.
export const clientMeRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireTenantUser());

  fastify.get('/me', async (request, reply) => {
    const tenantId = request.user?.tenantId;
    if (!tenantId) {
      // PLATFORM_ADMIN with no tenant. Return null so the frontend
      // unambiguously falls through to the impersonation/no-client path.
      return reply.status(200).send(null);
    }
    const client = await clientService.getById(tenantId);
    if (!client) {
      // Shouldn't normally happen (tenantId from token implies an
      // existing Client row), but treat as null rather than 404 so the
      // header doesn't error if a Client was deleted out from under a
      // logged-in user.
      return reply.status(200).send(null);
    }
    return client;
  });
};
