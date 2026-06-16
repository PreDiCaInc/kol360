import { randomBytes } from 'crypto';
import { prisma } from '../lib/prisma';
import { cognitoService } from './cognito.service';
import { emailService } from './email.service';
import { logger } from '../lib/logger';
import { CreateUserInput, UpdateUserInput } from '@kol360/shared';

// v1.17.48 — generate a strong temp password that satisfies the
// Cognito user-pool password policy (lowercase + uppercase + number
// + special, min length 8). 18 url-safe-ish chars + a guaranteed
// symbol + 'Aa1' suffix ensures all four character classes are
// present even if the random portion happens to miss one.
function generateTempPassword(): string {
  const random = randomBytes(16)
    .toString('base64')
    .replace(/[+/=]/g, '')
    .slice(0, 14);
  // Random suffix from a small symbol pool — guarantees the special
  // character class. Then 'Aa1' guarantees upper / lower / digit.
  const symbols = '!@#$%&*';
  const sym = symbols[randomBytes(1)[0] % symbols.length];
  return `${random}${sym}Aa1`;
}

// v1.17.48 — pretty role label for the invite email body.
function roleLabelFor(role: string): string {
  switch (role) {
    case 'PLATFORM_ADMIN':
      return 'Platform Administrator';
    case 'CLIENT_ADMIN':
      return 'Client Administrator';
    case 'TEAM_MEMBER':
      return 'Team Member';
    default:
      return role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
  }
}

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
  // v1.17.19: the legacy "empty allowlist = no enforcement" escape
  // hatch is gone. Every prod + test client was backfilled with at
  // least one domain alongside this change; Zod min(1) prevents new
  // clients from being created with empty arrays. An empty array
  // here now means someone bypassed Zod (Prisma direct, manual SQL,
  // or a migration backfill that didn't set a value) — in which case
  // we want the strict allowlist check below to fire (i.e., only
  // ALWAYS_ALLOWED_DOMAINS like bio-exec.com get through, everything
  // else is rejected) rather than silently letting any domain in.

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

    // v1.17.48 — generate our own temp password so Cognito's default
    // one-line "username + temp password" email is suppressed (the
    // MessageAction='SUPPRESS' branch in cognitoService.createUser
    // triggers when a tempPassword is provided). We then send a
    // properly-branded invite email via SES with a real sign-in link.
    // Pteam: pre-fix users got one ugly line from Cognito with no
    // link to the app and no branding.
    const tempPassword = generateTempPassword();

    // Create in Cognito first - must succeed before creating DB record
    const cognitoUser = await cognitoService.createUser(data.email, tempPassword);

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

    const dbUser = await prisma.user.create({
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

    // v1.17.48 — send our own polished invitation email via SES.
    // Resolve client name (if any) so the email can address it.
    // Wrapped in try/catch: a send failure shouldn't roll back the
    // Cognito + DB state (the admin can resend later via the existing
    // resend path). Logged so ops can spot it.
    try {
      let clientName: string | undefined;
      if (data.clientId) {
        const client = await prisma.client.findUnique({
          where: { id: data.clientId },
          select: { name: true },
        });
        clientName = client?.name;
      }
      await emailService.sendUserInvitation({
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        tempPassword,
        roleLabel: roleLabelFor(data.role),
        clientName,
      });
    } catch (err) {
      logger.error('Failed to send user invitation email — Cognito user + DB row remain. Admin should resend.', {
        userId: dbUser.id,
        email: data.email,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return dbUser;
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
