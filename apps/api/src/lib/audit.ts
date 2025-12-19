import { prisma } from './prisma';

type AuditLogData = {
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  tenantId?: string;
};

/**
 * Creates an audit log entry with the correct user ID.
 * Looks up the User.id from the Cognito sub (UUID) since AuditLog.userId
 * has a foreign key relationship to the User table which uses cuid IDs.
 *
 * If the user record doesn't exist, the audit log is silently skipped
 * to avoid blocking the main operation.
 */
export async function createAuditLog(
  cognitoSub: string,
  data: AuditLogData
): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { cognitoSub },
    select: { id: true },
  });

  if (user) {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        ...data,
      },
    });
  }
}
