import { FastifyPluginAsync } from 'fastify';
import { getBeIdRequestSchema, GetBeIdResponse } from '@kol360/shared';
import { requireM2M } from '../plugins/m2m-auth';
import { HcpService } from '../services/hcp.service';
import { createAuditLog } from '../lib/audit';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const hcpService = new HcpService();

// v1.17.29 — POST /api/v1/hcps/get-beid for the curation integration.
//
// Sits in its own route plugin (registered separately from hcpRoutes in
// app.ts) so it doesn't inherit the user-session preHandlers
// (requireTenantUser + gateWritesToAdmins) that gate the rest of
// /api/v1/hcps/*. Auth here is the M2M client_credentials flow only.
//
// Wire spec: kolcuration/spec/dba-ticket-kol360-deploy-sync-endpoints-koltest.md
// Reply with the build plan: kolcuration/spec/dba-reply-kol360-get-beid-koltest.md
export const curationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/get-beid',
    { preHandler: requireM2M({ scope: 'kol360-api/hcps:write-stub' }) },
    async (request, reply) => {
      const body = getBeIdRequestSchema.parse(request.body);
      const m2mClientId = request.m2m?.clientId ?? 'unknown-m2m-client';

      // === NPI dedup path ===
      // If curation supplied an NPI we already know, return the existing
      // beId. No row mutation. If the request name doesn't match the
      // stored row's name, audit-log the mismatch — gives the kol360
      // side a queryable record without breaking the request flow.
      if (body.npi) {
        const existing = await prisma.hcp.findUnique({
          where: { npi: body.npi },
          select: {
            id: true,
            beId: true,
            firstName: true,
            lastName: true,
            createdAt: true,
            country: true,
            nationalIdType: true,
          },
        });
        if (existing) {
          const nameMatches =
            existing.firstName.trim().toLowerCase() === body.firstName.trim().toLowerCase() &&
            existing.lastName.trim().toLowerCase() === body.lastName.trim().toLowerCase();

          if (!nameMatches) {
            await createAuditLog(m2mClientId, {
              action: 'hcp.curation_name_mismatch',
              entityType: 'Hcp',
              entityId: existing.id,
              oldValues: { firstName: existing.firstName, lastName: existing.lastName },
              newValues: {
                firstName: body.firstName,
                lastName: body.lastName,
                discoveredFrom: body.discoveredFrom,
                m2mClientId,
              },
            }).catch((err) => {
              // Audit log failures shouldn't block the response; the
              // mismatch is informational.
              logger.warn('Failed to write curation_name_mismatch audit', {
                error: err instanceof Error ? err.message : String(err),
                hcpId: existing.id,
              });
            });
          }

          const resp: GetBeIdResponse = {
            beId: existing.beId,
            id: existing.id,
            createdAt: existing.createdAt.toISOString(),
            wasExisting: true,
            // Echo persisted values, not request values — dedup path
            // returns the STORED row's country, which may differ from
            // whatever the caller sent this time (rare but possible if
            // an earlier mint used different values).
            country: existing.country as 'US' | 'CA',
            nationalIdType: existing.nationalIdType as 'NPI' | 'MINC',
          };
          return reply.status(201).send(resp);
        }
      }

      // === Mint path ===
      // Two sub-cases share this branch: (a) NPI supplied but new to us,
      // (b) no NPI at all. Either way we mint a fresh beId via the
      // existing atomic helper, create the Hcp row with curation
      // metadata, and audit-log the source side.
      const beId = await hcpService.generateBeId();
      const now = new Date();
      const created = await prisma.hcp.create({
        data: {
          beId,
          npi: body.npi ?? null,
          // v1.17.69 — persist country + type from the request. Both
          // default 'US'/'NPI' via the shared Zod schema so existing
          // curation clients that don't send them get the same
          // behavior they had pre-v1.17.69.
          country: body.country,
          nationalIdType: body.nationalIdType,
          firstName: body.firstName,
          lastName: body.lastName,
          email: 'nomail@kol360research.com', // schema default; curation has no email at this point
          specialty: body.specialty ?? null,
          city: body.city ?? null,
          state: body.state ?? null,
          curationManagedAt: now,
          discoveredFrom: body.discoveredFrom,
          createdBy: m2mClientId,
        },
        select: { id: true, beId: true, createdAt: true, country: true, nationalIdType: true },
      });

      await createAuditLog(m2mClientId, {
        action: body.npi ? 'hcp.curation_minted_with_npi' : 'hcp.curation_minted_no_npi',
        entityType: 'Hcp',
        entityId: created.id,
        newValues: {
          beId: created.beId,
          npi: body.npi ?? null,
          name: `${body.firstName} ${body.lastName}`,
          discoveredFrom: body.discoveredFrom,
          m2mClientId,
        },
      }).catch((err) => {
        logger.warn('Failed to write curation mint audit', {
          error: err instanceof Error ? err.message : String(err),
          hcpId: created.id,
        });
      });

      const resp: GetBeIdResponse = {
        beId: created.beId,
        id: created.id,
        createdAt: created.createdAt.toISOString(),
        wasExisting: false,
        country: created.country as 'US' | 'CA',
        nationalIdType: created.nationalIdType as 'NPI' | 'MINC',
      };
      return reply.status(201).send(resp);
    }
  );
};
