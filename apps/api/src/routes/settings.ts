import { FastifyPluginAsync } from 'fastify';
import { requirePlatformAdmin } from '../middleware/rbac';
import { createAuditLog } from '../lib/audit';

interface SettingsResponse {
  email: {
    sendExternalEmail: boolean;
    emailMockMode: boolean;
    sesFromEmail: string;
    sesFromName: string;
  };
  security: {
    healthCheckToken: string; // Masked value
  };
  system: {
    appUrl: string;
    environment: string;
  };
}

interface UpdateSettingsInput {
  healthCheckToken?: string;
  sendExternalEmail?: boolean;
  emailMockMode?: boolean;
  sesFromEmail?: string;
  sesFromName?: string;
}

// Mask sensitive values for display
function maskValue(value: string | undefined): string {
  if (!value) return '';
  if (value.length <= 4) return '****';
  return '****' + value.slice(-4);
}

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  // Get current settings (masked sensitive values)
  fastify.get('/', {
    preHandler: requirePlatformAdmin(),
  }, async (): Promise<SettingsResponse> => {
    return {
      email: {
        sendExternalEmail: process.env.SEND_EXTERNAL_EMAIL === 'true',
        emailMockMode: process.env.EMAIL_MOCK_MODE === 'true',
        sesFromEmail: process.env.SES_FROM_EMAIL || '',
        sesFromName: process.env.SES_FROM_NAME || '',
      },
      security: {
        healthCheckToken: maskValue(process.env.HEALTH_CHECK_TOKEN),
      },
      system: {
        appUrl: process.env.NEXT_PUBLIC_APP_URL || '',
        environment: process.env.NODE_ENV || 'development',
      },
    };
  });

  // Update settings (admin only)
  // Note: This updates environment variables in memory only.
  // For persistent changes, these would need to be saved to a database
  // or configuration service. This is a simplified implementation.
  fastify.put('/', {
    preHandler: requirePlatformAdmin(),
  }, async (request, reply) => {
    const data = request.body as UpdateSettingsInput;
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};

    // Track changes for audit log
    if (data.healthCheckToken !== undefined) {
      oldValues.healthCheckToken = '****';
      newValues.healthCheckToken = '****';
      process.env.HEALTH_CHECK_TOKEN = data.healthCheckToken;
    }

    if (data.sendExternalEmail !== undefined) {
      oldValues.sendExternalEmail = process.env.SEND_EXTERNAL_EMAIL === 'true';
      newValues.sendExternalEmail = data.sendExternalEmail;
      process.env.SEND_EXTERNAL_EMAIL = String(data.sendExternalEmail);
    }

    if (data.emailMockMode !== undefined) {
      oldValues.emailMockMode = process.env.EMAIL_MOCK_MODE === 'true';
      newValues.emailMockMode = data.emailMockMode;
      process.env.EMAIL_MOCK_MODE = String(data.emailMockMode);
    }

    if (data.sesFromEmail !== undefined) {
      oldValues.sesFromEmail = process.env.SES_FROM_EMAIL;
      newValues.sesFromEmail = data.sesFromEmail;
      process.env.SES_FROM_EMAIL = data.sesFromEmail;
    }

    if (data.sesFromName !== undefined) {
      oldValues.sesFromName = process.env.SES_FROM_NAME;
      newValues.sesFromName = data.sesFromName;
      process.env.SES_FROM_NAME = data.sesFromName;
    }

    // Audit log the settings change
    await createAuditLog(request.user!.sub, {
      action: 'settings.updated',
      entityType: 'Settings',
      entityId: 'system',
      oldValues,
      newValues,
    });

    return reply.status(200).send({
      message: 'Settings updated successfully',
      note: 'Changes are applied to the running process. For permanent changes, update environment variables in your deployment configuration.',
    });
  });
};
