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

/**
 * Bio-Exec staff can be assigned to ANY client regardless of that
 * client's emailDomains allowlist — they're the platform operator and
 * routinely help across tenants. Separate from email.service.ts's
 * ALLOWED_EMAIL_DOMAIN (which is the outbound-email safety gate) to keep
 * the two concerns distinct.
 */
const ALWAYS_ALLOWED_DOMAINS = ['bio-exec.com'] as const;

/**
 * Throws if `email`'s domain isn't allowed for the given client.
 * Permissive when the client's allowlist is empty (opt-in adoption);
 * permissive when there's no client (platform admins are tenant-less).
 *
 * This is a service-layer guard, not a DB constraint — Postgres can't
 * enforce a cross-table CHECK like this. Single canonical user-create
 * path lives in `invite()` below; if any future service writes to User
 * directly, it MUST call this helper too.
 */
export function validateEmailForClient(
  email: string,
  client: { emailDomains: string[] } | null | undefined
): void {
  if (!client) return; // platform admins (no clientId) bypass
  // v1.17.17 made emailDomains required at the write layer (Zod min(1)),
  // but pre-v1.17.17 clients on prod were created with empty arrays.
  // Keep this escape hatch so legacy clients aren't broken on read —
  // any future edit through the form forces the admin to fill it in,
  // at which point this branch stops firing for that client. Once all
  // existing clients have been edited (or backfilled), this line can
  // be removed and the function reduced to the strict allowlist check.
  if (client.emailDomains.length === 0) return;

  const emailDomain = email.split('@')[1]?.toLowerCase();
  const allowed = [
    ...client.emailDomains.map((d) => d.toLowerCase()),
    ...ALWAYS_ALLOWED_DOMAINS,
  ];

  if (!emailDomain || !allowed.includes(emailDomain)) {
    const err = new Error(
      `Email domain '${emailDomain ?? '(none)'}' is not allowed for this client. ` +
        `Allowed: ${allowed.join(', ')}`
    );
    (err as Error & { code?: string }).code = 'EMAIL_DOMAIN_NOT_ALLOWED';
    throw err;
  }
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
    // Validate the email's domain against the target client's allowlist
    // BEFORE touching Cognito — a rejected invite shouldn't leak a
    // Cognito user that then fails on DB insert.
    if (data.clientId) {
      const client = await prisma.client.findUnique({
        where: { id: data.clientId },
        select: { emailDomains: true },
      });
      if (!client) throw new Error('Client not found');
      validateEmailForClient(data.email, client);
    }

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

    // If the tenant is being changed, re-validate the user's existing
    // email against the NEW client's allowlist. (Email itself isn't
    // updated through this endpoint, but reassigning a user from
    // client A → client B is the same risk class as inviting fresh.)
    if (data.clientId && data.clientId !== user.clientId) {
      const newClient = await prisma.client.findUnique({
        where: { id: data.clientId },
        select: { emailDomains: true },
      });
      if (!newClient) throw new Error('Client not found');
      validateEmailForClient(user.email, newClient);
    }

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
