import { prisma } from '../lib/prisma';
import { OptOutScope, Prisma } from '@prisma/client';

export interface CreateOptOutInput {
  hcpId: string;
  scope: OptOutScope;
  campaignId?: string;
  reason: string;
  userId: string;
}

export interface ResubscribeInput {
  optOutId: string;
  userId: string;
  reason?: string;
}

export interface ListOptOutsParams {
  page?: number;
  limit?: number;
  search?: string;
  scope?: OptOutScope | 'ALL';
  status?: 'active' | 'resubscribed' | 'all';
  campaignId?: string;
  sortBy?: 'optedOutAt' | 'email' | 'scope';
  sortOrder?: 'asc' | 'desc';
}

export class OptOutService {
  /**
   * Create an opt-out on behalf of an HCP (admin action).
   * Idempotent: returns existing if already opted out for the same scope+campaign.
   */
  async optOutHcp(input: CreateOptOutInput) {
    const { hcpId, scope, campaignId, reason, userId } = input;

    if (!reason || reason.trim().length < 10) {
      throw new Error('Reason is required and must be at least 10 characters');
    }
    if (scope === 'CAMPAIGN' && !campaignId) {
      throw new Error('campaignId is required for CAMPAIGN scope');
    }

    const hcp = await prisma.hcp.findUnique({
      where: { id: hcpId },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (!hcp) throw new Error('HCP not found');
    if (!hcp.email) throw new Error('HCP has no email address');

    // Check for existing active opt-out (idempotent)
    const existing = await prisma.optOut.findFirst({
      where: {
        email: hcp.email,
        scope,
        ...(scope === 'CAMPAIGN' ? { campaignId } : {}),
        resubscribedAt: null,
      },
    });
    if (existing) {
      return { optOut: existing, alreadyOptedOut: true };
    }

    const optOut = await prisma.optOut.create({
      data: {
        hcpId: hcp.id,
        email: hcp.email,
        scope,
        campaignId: scope === 'CAMPAIGN' ? campaignId : null,
        reason: reason.trim(),
        optedOutVia: 'admin_ui_user_request',
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'opt_out.created_by_admin',
        entityType: 'OptOut',
        entityId: optOut.id,
        newValues: {
          hcpId: hcp.id,
          email: hcp.email,
          hcpName: `${hcp.firstName} ${hcp.lastName}`,
          scope,
          campaignId,
          reason: reason.trim(),
        } as Prisma.InputJsonValue,
      },
    });

    return { optOut, alreadyOptedOut: false };
  }

  /**
   * Resubscribe an HCP (admin action — reverses an opt-out).
   */
  async resubscribeHcp(input: ResubscribeInput) {
    const { optOutId, userId, reason } = input;

    const optOut = await prisma.optOut.findUnique({
      where: { id: optOutId },
    });
    if (!optOut) throw new Error('Opt-out record not found');
    if (optOut.resubscribedAt) throw new Error('Already resubscribed');

    const updated = await prisma.optOut.update({
      where: { id: optOutId },
      data: {
        resubscribedAt: new Date(),
        resubscribedVia: 'admin_ui_user_request',
        ...(reason ? { reason: `${optOut.reason || ''}\n[Resubscribed: ${reason.trim()}]`.trim() } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'opt_out.resubscribed_by_admin',
        entityType: 'OptOut',
        entityId: optOutId,
        oldValues: { resubscribedAt: null } as Prisma.InputJsonValue,
        newValues: {
          email: optOut.email,
          scope: optOut.scope,
          resubscribeReason: reason || null,
        } as Prisma.InputJsonValue,
      },
    });

    return updated;
  }

  /**
   * Get current opt-out status for an HCP (used to render the right button).
   * Returns the list of active opt-outs (CAMPAIGN-specific or GLOBAL).
   */
  async getHcpOptOutStatus(hcpId: string, campaignId?: string) {
    const hcp = await prisma.hcp.findUnique({
      where: { id: hcpId },
      select: { email: true },
    });
    if (!hcp || !hcp.email) return { hasGlobal: false, hasCampaign: false, optOuts: [] };

    const active = await prisma.optOut.findMany({
      where: {
        email: hcp.email,
        resubscribedAt: null,
        OR: [
          { scope: 'GLOBAL' },
          ...(campaignId ? [{ scope: 'CAMPAIGN' as const, campaignId }] : []),
        ],
      },
      orderBy: { optedOutAt: 'desc' },
    });

    return {
      hasGlobal: active.some(o => o.scope === 'GLOBAL'),
      hasCampaign: active.some(o => o.scope === 'CAMPAIGN'),
      optOuts: active,
    };
  }

  /**
   * List all opt-outs with filters, search, pagination — for admin opt-outs page.
   */
  async list(params: ListOptOutsParams) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(5000, Math.max(1, params.limit || 50));
    const sortBy = params.sortBy || 'optedOutAt';
    const sortOrder = params.sortOrder || 'desc';

    const where: Prisma.OptOutWhereInput = {};

    if (params.scope && params.scope !== 'ALL') {
      where.scope = params.scope;
    }
    if (params.campaignId) {
      where.campaignId = params.campaignId;
    }
    if (params.status === 'active') {
      where.resubscribedAt = null;
    } else if (params.status === 'resubscribed') {
      where.resubscribedAt = { not: null };
    }
    if (params.search) {
      where.OR = [
        { email: { contains: params.search, mode: 'insensitive' } },
        { hcp: { firstName: { contains: params.search, mode: 'insensitive' } } },
        { hcp: { lastName: { contains: params.search, mode: 'insensitive' } } },
        { reason: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.optOut.count({ where }),
      prisma.optOut.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          hcp: { select: { id: true, npi: true, firstName: true, lastName: true } },
          campaign: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      items: items.map(o => ({
        id: o.id,
        hcpId: o.hcpId,
        npi: o.hcp?.npi || null,
        firstName: o.hcp?.firstName || null,
        lastName: o.hcp?.lastName || null,
        email: o.email,
        scope: o.scope,
        campaignId: o.campaignId,
        campaignName: o.campaign?.name || null,
        reason: o.reason,
        optedOutAt: o.optedOutAt.toISOString(),
        optedOutVia: o.optedOutVia,
        resubscribedAt: o.resubscribedAt ? o.resubscribedAt.toISOString() : null,
        resubscribedVia: o.resubscribedVia,
      })),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    };
  }
}

export const optOutService = new OptOutService();
