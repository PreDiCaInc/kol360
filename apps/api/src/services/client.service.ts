import { prisma } from '../lib/prisma';
import { CreateClientInput, UpdateClientInput } from '@kol360/shared';

export class ClientService {
  async list(includeInactive = false) {
    return prisma.client.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        _count: {
          select: {
            users: true,
            campaigns: true,
            liteClientDiseaseAreas: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getById(id: string) {
    return prisma.client.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true,
          },
        },
        campaigns: {
          select: {
            id: true,
            name: true,
            status: true,
            diseaseArea: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        liteClientDiseaseAreas: {
          include: {
            diseaseArea: true,
          },
        },
        _count: {
          select: { users: true, campaigns: true },
        },
      },
    });
  }

  async create(data: CreateClientInput, createdBy: string) {
    return prisma.client.create({
      data: {
        ...data,
      },
    });
  }

  async update(id: string, data: UpdateClientInput) {
    return prisma.client.update({
      where: { id },
      data,
    });
  }

  async deactivate(id: string) {
    return prisma.client.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async grantDiseaseAreaAccess(clientId: string, diseaseAreaId: string, grantedBy: string) {
    return prisma.liteClientDiseaseArea.create({
      data: {
        clientId,
        diseaseAreaId,
        grantedBy,
      },
    });
  }

  async revokeDiseaseAreaAccess(clientId: string, diseaseAreaId: string) {
    return prisma.liteClientDiseaseArea.deleteMany({
      where: { clientId, diseaseAreaId },
    });
  }
}
