import { FastifyPluginAsync } from 'fastify';
import { requirePlatformAdmin, requireClientAdmin } from '../middleware/rbac';
import { prisma } from '../lib/prisma';
import { createAuditLog } from '../lib/audit';

export const specialtyRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all specialties (any authenticated user can read)
  fastify.get('/', { preHandler: [requireClientAdmin()] }, async (request) => {
    const { includeInactive } = request.query as { includeInactive?: string };

    return prisma.specialty.findMany({
      where: includeInactive === 'true' ? {} : { isActive: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { hcps: true } },
      },
    });
  });

  // Get specialty by ID
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireClientAdmin()] },
    async (request, reply) => {
      const specialty = await prisma.specialty.findUnique({
        where: { id: request.params.id },
        include: {
          _count: { select: { hcps: true } },
        },
      });

      if (!specialty) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Specialty not found',
          statusCode: 404,
        });
      }

      return specialty;
    }
  );

  // Create specialty (platform admin only)
  fastify.post('/', { preHandler: [requirePlatformAdmin()] }, async (request, reply) => {
    const { name, code, category } = request.body as {
      name: string;
      code?: string;
      category?: string;
    };

    if (!name || !name.trim()) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'name is required',
        statusCode: 400,
      });
    }

    // Generate code from name if not provided
    const specialtyCode = code || name.toLowerCase().replace(/[^a-z0-9]/g, '_');

    // Check for duplicates
    const existing = await prisma.specialty.findFirst({
      where: {
        OR: [{ name: name.trim() }, { code: specialtyCode }],
      },
    });

    if (existing) {
      return reply.status(409).send({
        error: 'Conflict',
        message: 'Specialty with this name or code already exists',
        statusCode: 409,
      });
    }

    const specialty = await prisma.specialty.create({
      data: {
        name: name.trim(),
        code: specialtyCode,
        category: category?.trim() || null,
      },
    });

    await createAuditLog(request.user!.sub, {
      action: 'specialty.created',
      entityType: 'Specialty',
      entityId: specialty.id,
      newValues: { name, code: specialtyCode, category },
    });

    return reply.status(201).send(specialty);
  });

  // Update specialty (platform admin only)
  fastify.put<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requirePlatformAdmin()] },
    async (request, reply) => {
      const { name, code, category, isActive } = request.body as {
        name?: string;
        code?: string;
        category?: string;
        isActive?: boolean;
      };

      const existing = await prisma.specialty.findUnique({
        where: { id: request.params.id },
      });

      if (!existing) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Specialty not found',
          statusCode: 404,
        });
      }

      // Check for name/code conflicts
      if (name || code) {
        const conflict = await prisma.specialty.findFirst({
          where: {
            id: { not: request.params.id },
            OR: [
              name ? { name: name.trim() } : {},
              code ? { code } : {},
            ].filter((c) => Object.keys(c).length > 0),
          },
        });

        if (conflict) {
          return reply.status(409).send({
            error: 'Conflict',
            message: 'Another specialty with this name or code already exists',
            statusCode: 409,
          });
        }
      }

      const specialty = await prisma.specialty.update({
        where: { id: request.params.id },
        data: {
          ...(name && { name: name.trim() }),
          ...(code && { code }),
          ...(category !== undefined && { category: category?.trim() || null }),
          ...(isActive !== undefined && { isActive }),
        },
      });

      await createAuditLog(request.user!.sub, {
        action: 'specialty.updated',
        entityType: 'Specialty',
        entityId: specialty.id,
        oldValues: { name: existing.name, code: existing.code, category: existing.category },
        newValues: { name, code, category, isActive },
      });

      return specialty;
    }
  );

  // Delete specialty (platform admin only) - soft delete by setting isActive = false
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requirePlatformAdmin()] },
    async (request, reply) => {
      const existing = await prisma.specialty.findUnique({
        where: { id: request.params.id },
        include: { _count: { select: { hcps: true } } },
      });

      if (!existing) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Specialty not found',
          statusCode: 404,
        });
      }

      // Soft delete if there are associated HCPs
      if (existing._count.hcps > 0) {
        await prisma.specialty.update({
          where: { id: request.params.id },
          data: { isActive: false },
        });
      } else {
        // Hard delete if no associations
        await prisma.specialty.delete({
          where: { id: request.params.id },
        });
      }

      await createAuditLog(request.user!.sub, {
        action: 'specialty.deleted',
        entityType: 'Specialty',
        entityId: request.params.id,
        oldValues: { name: existing.name },
      });

      return reply.status(204).send();
    }
  );
};
