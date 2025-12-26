import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

const SYSTEM_USER_EMAIL = 'system@kol360.internal';

type AuditLogData = {
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: Prisma.InputJsonValue;
  newValues?: Prisma.InputJsonValue;
  tenantId?: string;
};

// Cache the system user ID to avoid repeated lookups
let cachedSystemUserId: string | null = null;

async function getSystemUserId(): Promise<string | null> {
  if (cachedSystemUserId) {
    return cachedSystemUserId;
  }

  const systemUser = await prisma.user.findFirst({
    where: { email: SYSTEM_USER_EMAIL },
    select: { id: true },
  });

  if (systemUser) {
    cachedSystemUserId = systemUser.id;
  }

  return cachedSystemUserId;
}

/**
 * Creates an audit log entry with the correct user ID.
 * Looks up the User.id from the Cognito sub (UUID) since AuditLog.userId
 * has a foreign key relationship to the User table which uses cuid IDs.
 *
 * If the user record doesn't exist, falls back to a system user and
 * includes the original cognitoSub in the audit log metadata.
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
  } else {
    // User not found - use system user and record the original cognitoSub
    const systemUserId = await getSystemUserId();

    if (systemUserId) {
      const extendedNewValues = {
        ...(typeof data.newValues === 'object' && data.newValues !== null ? data.newValues : {}),
        _performedByCognitoSub: cognitoSub,
        _userNotFoundInDatabase: true,
      };
      await prisma.auditLog.create({
        data: {
          userId: systemUserId,
          ...data,
          newValues: extendedNewValues as Prisma.InputJsonValue,
        },
      });
    } else {
      // Last resort: log error but don't block the operation
      console.error(
        `[Audit] Cannot create audit log: user not found for cognitoSub ${cognitoSub} and system user does not exist. ` +
        `Action: ${data.action}, Entity: ${data.entityType}/${data.entityId}`
      );
    }
  }
}
