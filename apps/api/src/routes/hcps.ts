import { FastifyPluginAsync } from 'fastify';
import { createHcpSchema, updateHcpSchema } from '@kol360/shared';
import { requireTenantUser, gateWritesToAdmins, getClientHcpIds, hasHcpAccess } from '../middleware/rbac';
import { HcpService } from '../services/hcp.service';
import { pickHcpAuditSnapshot } from '../services/hcp-fields';
// score-calculation.service removed in Phase 3 PR A — see /admin/kol-analysis.
import { importProgressStore } from '../services/import-progress.service';
import { createAuditLog } from '../lib/audit';
import { influencerTypeImportService } from '../services/influencer-type-import.service';
import multipart from '@fastify/multipart';

const hcpService = new HcpService();

export const hcpRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit
  // v1.17.17: tenant-user gate at the file level (allows TEAM_MEMBER read);
  // writes (POST/PUT/PATCH/DELETE) gated to CLIENT_ADMIN+ in one line.
  fastify.addHook('preHandler', requireTenantUser());
  fastify.addHook('preHandler', gateWritesToAdmins());

  // Get filter options (specialties and states)
  fastify.get('/filters', async () => {
    const [specialties, states] = await Promise.all([
      hcpService.getSpecialties(),
      hcpService.getStates(),
    ]);
    return { specialties, states };
  });

  // Search HCPs
  fastify.get('/', async (request, reply) => {
    const { query, specialty, state, diseaseAreaIds, optOutStatus, page, limit, sortBy, sortOrder, country } = request.query as {
      query?: string;
      specialty?: string;
      state?: string;
      diseaseAreaIds?: string | string[];
      optOutStatus?: string;
      page?: string;
      limit?: string;
      sortBy?: string;
      sortOrder?: string;
      // v1.17.68 — optional country filter. Web layer passes the
      // currently-scoped Client.defaultCountry so a US client's admin
      // list hides CA HCPs (and vice versa). Unset = all.
      country?: string;
    };

    // CLIENT_ADMIN can only see HCPs assigned to their campaigns
    let hcpIds: string[] | undefined;
    if (request.user!.role !== 'PLATFORM_ADMIN') {
      // SECURITY: Reject if non-platform-admin has no tenant context
      if (!request.user!.tenantId) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'No tenant context available',
          statusCode: 403,
        });
      }
      hcpIds = await getClientHcpIds(fastify.prisma, request.user!.tenantId);
    }

    // diseaseAreaIds may arrive as a single string, comma-delimited, or as repeated
    // ?diseaseAreaIds=... query params (Fastify gives us string | string[]). Normalize.
    const normalizedDaIds: string[] | undefined = (() => {
      if (diseaseAreaIds === undefined) return undefined;
      const arr = Array.isArray(diseaseAreaIds) ? diseaseAreaIds : [diseaseAreaIds];
      const flat = arr.flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean);
      return flat.length > 0 ? flat : undefined;
    })();

    return hcpService.search({
      query,
      specialty,
      state,
      diseaseAreaIds: normalizedDaIds,
      hcpIds,
      optOutStatus: optOutStatus as 'any' | 'global' | 'campaign' | 'active' | 'none' | undefined,
      // v1.17.45 — narrow to the 4 supported sort keys; anything else
      // ignored (falls back to default last-name-then-first sort).
      sortBy: (['name', 'npi', 'state', 'specialty'] as const).includes(
        sortBy as 'name' | 'npi' | 'state' | 'specialty',
      )
        ? (sortBy as 'name' | 'npi' | 'state' | 'specialty')
        : undefined,
      sortOrder: sortOrder === 'desc' ? 'desc' : sortOrder === 'asc' ? 'asc' : undefined,
      country: country === 'CA' ? 'CA' : country === 'US' ? 'US' : undefined,
      page: parseInt(page || '1', 10),
      limit: parseInt(limit || '50', 10),
    });
  });

  // Get HCP by ID
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    // CLIENT_ADMIN can only access HCPs in their campaigns
    if (!(await hasHcpAccess(fastify.prisma, request.params.id, request.user!))) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'No access to this HCP',
        statusCode: 403,
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
    await createAuditLog(request.user!.sub, {
      action: 'hcp.created',
      entityType: 'Hcp',
      entityId: hcp.id,
      newValues: { npi: data.npi, name: `${data.firstName} ${data.lastName}` },
    });

    return reply.status(201).send(hcp);
  });

  // Update HCP
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    // CLIENT_ADMIN can only update HCPs in their campaigns
    if (!(await hasHcpAccess(fastify.prisma, request.params.id, request.user!))) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'No access to this HCP',
        statusCode: 403,
      });
    }

    const data = updateHcpSchema.parse(request.body);
    const existing = await hcpService.getById(request.params.id);

    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'HCP not found',
        statusCode: 404,
      });
    }

    // v1.17.34: NPI changes were singled out into hcp.npi_changed so
    // audit queries could surface canonical-identifier churn in a
    // single SELECT.
    // v1.17.35: extend the same dedicated-action pattern to email +
    // specialty — the next two fields most often investigated when a
    // customer asks "how did this row get changed?". Each emits its
    // OWN audit row in addition to (and instead of) the generic
    // hcp.updated.
    const isNpiChange =
      data.npi !== undefined && data.npi !== null && data.npi !== existing.npi;
    const isEmailChange =
      data.email !== undefined && data.email !== null && data.email !== existing.email;
    const isSpecialtyChange =
      data.specialty !== undefined &&
      data.specialty !== null &&
      data.specialty !== existing.specialty;

    let hcp;
    try {
      hcp = await hcpService.update(request.params.id, data);
    } catch (err: unknown) {
      // Prisma unique-violation on Hcp.npi — surface as 409 instead of
      // letting the generic error handler return 500/503.
      const prismaErr = err as { code?: string; meta?: { target?: string[] | string } };
      const target = Array.isArray(prismaErr?.meta?.target)
        ? prismaErr.meta!.target!.join(',')
        : prismaErr?.meta?.target ?? '';
      if (prismaErr?.code === 'P2002' && target.includes('npi')) {
        return reply.status(409).send({
          error: 'Conflict',
          message: `Another HCP already exists with NPI ${data.npi}`,
          statusCode: 409,
        });
      }
      throw err;
    }

    // v1.17.35: emit one audit row per dedicated change (npi / email /
    // specialty). When none of those changed but the row was touched
    // (firstName, lastName, city, state, etc.), fall through to the
    // generic hcp.updated row. The result: an audit query like
    //   SELECT * FROM "AuditLog"
    //   WHERE "entityType"='Hcp' AND action='hcp.email_changed'
    //   ORDER BY "createdAt" DESC LIMIT 50
    // surfaces every email churn across the platform in <1ms.
    const baseEntity = {
      entityType: 'Hcp' as const,
      entityId: hcp.id,
    };
    if (isNpiChange) {
      await createAuditLog(request.user!.sub, {
        ...baseEntity,
        action: 'hcp.npi_changed',
        oldValues: { firstName: existing.firstName, lastName: existing.lastName, npi: existing.npi },
        newValues: { npi: data.npi },
      });
    }
    if (isEmailChange) {
      await createAuditLog(request.user!.sub, {
        ...baseEntity,
        action: 'hcp.email_changed',
        oldValues: { firstName: existing.firstName, lastName: existing.lastName, email: existing.email },
        newValues: { email: data.email },
      });
    }
    if (isSpecialtyChange) {
      await createAuditLog(request.user!.sub, {
        ...baseEntity,
        action: 'hcp.specialty_changed',
        oldValues: { firstName: existing.firstName, lastName: existing.lastName, specialty: existing.specialty },
        newValues: { specialty: data.specialty },
      });
    }
    // Always emit a base hcp.updated row when at least one dedicated
    // change fired OR the row was touched by a non-dedicated field.
    // (The route only reaches here if the update body parsed
    // successfully, so we know SOMETHING in the payload was intended
    // as an update.)
    if (!isNpiChange && !isEmailChange && !isSpecialtyChange) {
      // v2.1.2 — pre-image snapshot via the shared picker (was:
      // `{ firstName, lastName }` inline — only 2 of 13 audit-worthy
      // fields). Same const used by both bulk-import parse sites, so
      // any Hcp column added later flows into audit consistently across
      // admin-edit + bulk-import + campaign-scoped bulk. See
      // docs/findings/bulk-import-no-oldvalues-blocks-surgical-revert-
      // 2026-08-05.md.
      await createAuditLog(request.user!.sub, {
        ...baseEntity,
        action: 'hcp.updated',
        oldValues: pickHcpAuditSnapshot(existing),
        newValues: data,
      });
    }

    return hcp;
  });

  // Get import progress by ID
  fastify.get<{ Params: { importId: string } }>('/import/progress/:importId', async (request, reply) => {
    const progress = importProgressStore.get(request.params.importId);
    if (!progress) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Import not found or already expired',
        statusCode: 404,
      });
    }
    return progress;
  });

  // Bulk import HCPs from Excel or CSV
  fastify.post('/import', async (request, reply) => {
    // v1.17.68 — `country` query param determines which national-ID
    // regime validates the CSV's identifier column (NPI / OneKey ID).
    // Defaults to 'US' so existing admin import flows keep working
    // with zero change. The web UI passes 'CA' when the current
    // Client's defaultCountry is Canada.
    const { importId, country: countryRaw } = request.query as {
      importId?: string;
      country?: string;
    };
    const country: 'US' | 'CA' = countryRaw === 'CA' ? 'CA' : 'US';
    const file = await request.file();
    if (!file) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'No file uploaded',
        statusCode: 400,
      });
    }

    const filename = file.filename.toLowerCase();
    if (!filename.endsWith('.xlsx') && !filename.endsWith('.xls') && !filename.endsWith('.csv')) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Unsupported file format. Please use .xlsx, .xls, or .csv files.',
        statusCode: 400,
      });
    }

    const buffer = await file.toBuffer();
    const result = await hcpService.importFromFile(
      buffer,
      request.user!.sub,
      file.filename,
      importId,
      null,
      country,
    );

    // v1.17.35: the batch-summary audit row now points at the new
    // HcpImportBatch.id, and per-row 'hcp.created' / 'hcp.updated' rows
    // are already emitted from the service. The summary row is kept
    // for back-compat with dashboards that filter on
    // action='hcp.bulk_import'.
    await createAuditLog(request.user!.sub, {
      action: 'hcp.bulk_import',
      entityType: 'Hcp',
      entityId: result.batchId ?? 'bulk',
      newValues: {
        batchId: result.batchId,
        fileName: file.filename,
        recordsTotal: result.total,
        created: result.created,
        updated: result.updated + result.merged,
        errors: result.errors.length,
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
    await createAuditLog(request.user!.sub, {
      action: 'hcp.alias_added',
      entityType: 'HcpAlias',
      entityId: alias.id,
      newValues: { hcpId: request.params.id, aliasName },
    });

    return reply.status(201).send(alias);
  });

  // Remove alias from HCP
  fastify.delete<{ Params: { id: string; aliasId: string } }>(
    '/:id/aliases/:aliasId',
    async (request, reply) => {
      await hcpService.removeAlias(request.params.aliasId);

      // Audit log
      await createAuditLog(request.user!.sub, {
        action: 'hcp.alias_removed',
        entityType: 'HcpAlias',
        entityId: request.params.aliasId,
      });

      return reply.status(204).send();
    }
  );

  // Bulk import aliases from Excel or CSV
  fastify.post('/aliases/import', async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'No file uploaded',
        statusCode: 400,
      });
    }

    const filename = file.filename.toLowerCase();
    if (!filename.endsWith('.xlsx') && !filename.endsWith('.xls') && !filename.endsWith('.csv')) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Unsupported file format. Please use .xlsx, .xls, or .csv files.',
        statusCode: 400,
      });
    }

    const buffer = await file.toBuffer();
    const result = await hcpService.importAliases(buffer, request.user!.sub, file.filename);

    // Audit log
    await createAuditLog(request.user!.sub, {
      action: 'hcp.aliases_bulk_import',
      entityType: 'HcpAlias',
      entityId: 'bulk',
      newValues: { created: result.created, skipped: result.skipped, errors: result.errors.length },
    });

    return result;
  });

  // Set HCP specialties (replaces all existing)
  fastify.put<{ Params: { id: string } }>('/:id/specialties', async (request, reply) => {
    const { specialtyIds, primarySpecialtyId } = request.body as {
      specialtyIds: string[];
      primarySpecialtyId?: string;
    };

    if (!Array.isArray(specialtyIds)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'specialtyIds must be an array',
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

    const specialties = await hcpService.setHcpSpecialties(
      request.params.id,
      specialtyIds,
      primarySpecialtyId
    );

    // Audit log
    await createAuditLog(request.user!.sub, {
      action: 'hcp.specialties_updated',
      entityType: 'Hcp',
      entityId: request.params.id,
      newValues: { specialtyIds, primarySpecialtyId },
    });

    return specialties;
  });

  // Add specialty to HCP
  fastify.post<{ Params: { id: string } }>('/:id/specialties', async (request, reply) => {
    const { specialtyId, isPrimary } = request.body as {
      specialtyId: string;
      isPrimary?: boolean;
    };

    if (!specialtyId) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'specialtyId is required',
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

    const hcpSpecialty = await hcpService.addSpecialtyToHcp(
      request.params.id,
      specialtyId,
      isPrimary || false
    );

    // Audit log
    await createAuditLog(request.user!.sub, {
      action: 'hcp.specialty_added',
      entityType: 'HcpSpecialty',
      entityId: hcpSpecialty.id,
      newValues: { hcpId: request.params.id, specialtyId, isPrimary },
    });

    return reply.status(201).send(hcpSpecialty);
  });

  // Remove specialty from HCP
  fastify.delete<{ Params: { id: string; specialtyId: string } }>(
    '/:id/specialties/:specialtyId',
    async (request, reply) => {
      await hcpService.removeSpecialtyFromHcp(request.params.id, request.params.specialtyId);

      // Audit log
      await createAuditLog(request.user!.sub, {
        action: 'hcp.specialty_removed',
        entityType: 'HcpSpecialty',
        entityId: `${request.params.id}_${request.params.specialtyId}`,
      });

      return reply.status(204).send();
    }
  );

  // Import segment scores from Excel or CSV
  // diseaseAreaId is required - scores are tied to a specific disease area
  fastify.post('/import-segment-scores', async (request, reply) => {
    const { diseaseAreaId } = request.query as { diseaseAreaId?: string };
    if (!diseaseAreaId) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'diseaseAreaId query parameter is required',
        statusCode: 400,
      });
    }

    const file = await request.file();
    if (!file) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'No file uploaded',
        statusCode: 400,
      });
    }

    const filename = file.filename.toLowerCase();
    if (!filename.endsWith('.xlsx') && !filename.endsWith('.xls') && !filename.endsWith('.csv')) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Unsupported file format. Please use .xlsx, .xls, or .csv files.',
        statusCode: 400,
      });
    }

    const { importId } = request.query as { diseaseAreaId?: string; importId?: string };
    const buffer = await file.toBuffer();
    const result = await hcpService.importSegmentScores(buffer, diseaseAreaId, file.filename, importId);

    // Audit log
    await createAuditLog(request.user!.sub, {
      action: 'hcp.segment_scores_import',
      entityType: 'HcpDiseaseAreaScore',
      entityId: 'bulk',
      newValues: { created: result.created, updated: result.updated, errors: result.errors.length },
    });

    return result;
  });

  // /recalculate-composites endpoint removed in Phase 3 PR A. The previous
  // implementation used hardcoded weights (10/15/10/10/10/10/5/5/25) ignoring
  // every client config — exactly the bug KOL Analysis was built to fix.
  // Composite scores now live on HcpAnalysisScore per-(client, DA) with
  // per-analysis weights; recompute via the Recalculate button on the
  // /admin/kol-analysis/<id> page (or auto on included-campaign publish).

  // v1.17.42 — data-team-managed influencer-type classification import.
  // Preview returns the summary + per-row resolution so the UI can
  // render the confirmation dialog. Import applies the writes.
  // Both expect `diseaseAreaId` as a form field alongside the file.

  async function readImportInputs(request: import('fastify').FastifyRequest) {
    const parts = request.parts();
    let fileBuffer: Buffer | null = null;
    let fileName: string | null = null;
    let diseaseAreaId: string | null = null;
    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer();
        fileName = part.filename;
      } else if (part.fieldname === 'diseaseAreaId') {
        diseaseAreaId = String(part.value ?? '');
      }
    }
    return { fileBuffer, fileName, diseaseAreaId };
  }

  fastify.post('/influencer-types/preview', async (request, reply) => {
    const { fileBuffer, fileName, diseaseAreaId } = await readImportInputs(request);
    if (!fileBuffer || !fileName) {
      return reply.status(400).send({ error: 'Bad Request', message: 'No file uploaded', statusCode: 400 });
    }
    if (!diseaseAreaId) {
      return reply.status(400).send({ error: 'Bad Request', message: 'diseaseAreaId is required', statusCode: 400 });
    }
    try {
      return await influencerTypeImportService.preview({
        buffer: fileBuffer,
        filename: fileName,
        diseaseAreaId,
        actorCognitoSub: request.user!.sub,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Preview failed';
      return reply.status(400).send({ error: 'Bad Request', message, statusCode: 400 });
    }
  });

  fastify.post('/influencer-types/import', async (request, reply) => {
    const { fileBuffer, fileName, diseaseAreaId } = await readImportInputs(request);
    if (!fileBuffer || !fileName) {
      return reply.status(400).send({ error: 'Bad Request', message: 'No file uploaded', statusCode: 400 });
    }
    if (!diseaseAreaId) {
      return reply.status(400).send({ error: 'Bad Request', message: 'diseaseAreaId is required', statusCode: 400 });
    }
    try {
      return await influencerTypeImportService.import({
        buffer: fileBuffer,
        filename: fileName,
        diseaseAreaId,
        actorCognitoSub: request.user!.sub,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      return reply.status(400).send({ error: 'Bad Request', message, statusCode: 400 });
    }
  });
};
