import { prisma } from '../lib/prisma';
import { cognitoService } from './cognito.service';
import { CreateUserInput, UpdateUserInput } from '@kol360/shared';

interface ListQuery {
  clientId?: string;
  role?: string;
  status?: string;
  page: number;
  limit: number;
}

export class UserService {
  async list(query: ListQuery) {
    const { clientId, role, status, page, limit } = query;

    const where: Record<string, unknown> = {};
    if (clientId) where.clientId = clientId;
    if (role) where.role = role;
    if (status) where.status = status;

    const [total, items] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: {
        client: true,
        auditLogs: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async invite(data: CreateUserInput) {
    // Create in Cognito first - must succeed before creating DB record
    const cognitoUser = await cognitoService.createUser(data.email);

    if (!cognitoUser?.Username) {
      throw new Error('Failed to create user in Cognito');
    }

    // Set tenant-id custom attribute (role is managed via groups)
    if (data.clientId) {
      await cognitoService.updateUserAttributes(data.email, {
        tenantId: data.clientId,
      });
    }

    // Add to role group (platform-admins, client-admins, or team-members)
    await cognitoService.addUserToGroup(
      data.email,
      cognitoService.getRoleGroup(data.role)
    );

    // Only create in database after Cognito operations succeed
    return prisma.user.create({
      data: {
        cognitoSub: cognitoUser.Username,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role as 'PLATFORM_ADMIN' | 'CLIENT_ADMIN' | 'TEAM_MEMBER',
        clientId: data.clientId,
        status: 'PENDING_VERIFICATION',
      },
    });
  }

  async update(id: string, data: UpdateUserInput) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new Error('User not found');

    // Update Cognito group if role changed (role is managed via groups, not custom attributes)
    if (data.role && data.role !== user.role) {
      await cognitoService.removeUserFromGroup(user.email, cognitoService.getRoleGroup(user.role));
      await cognitoService.addUserToGroup(user.email, cognitoService.getRoleGroup(data.role));
    }

    return prisma.user.update({
      where: { id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role as 'PLATFORM_ADMIN' | 'CLIENT_ADMIN' | 'TEAM_MEMBER' | undefined,
        clientId: data.clientId,
      },
    });
  }

  async approve(id: string, approvedBy: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new Error('User not found');

    // Enable in Cognito
    await cognitoService.enableUser(user.email);

    return prisma.user.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        approvedAt: new Date(),
        approvedBy,
      },
    });
  }

  async disable(id: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new Error('User not found');

    await cognitoService.disableUser(user.email);

    return prisma.user.update({
      where: { id },
      data: { status: 'DISABLED' },
    });
  }

  async enable(id: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new Error('User not found');

    await cognitoService.enableUser(user.email);

    return prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  }
}
