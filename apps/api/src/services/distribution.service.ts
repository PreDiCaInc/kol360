import { prisma } from '../lib/prisma';
import { emailService } from './email.service';

interface ListParams {
  status?: string;
  page: number;
  limit: number;
}

export class DistributionService {
  async listCampaignHcps(campaignId: string) {
    return prisma.campaignHcp.findMany({
      where: { campaignId },
      include: {
        hcp: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            specialty: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async assignHcps(campaignId: string, hcpIds: string[]) {
    // Check which HCPs are already assigned
    const existing = await prisma.campaignHcp.findMany({
      where: { campaignId, hcpId: { in: hcpIds } },
      select: { hcpId: true },
    });
    const existingIds = new Set(existing.map((e: { hcpId: string }) => e.hcpId));
    const newIds = hcpIds.filter((id) => !existingIds.has(id));

    if (newIds.length > 0) {
      await prisma.campaignHcp.createMany({
        data: newIds.map((hcpId) => ({ campaignId, hcpId })),
      });
    }

    return { added: newIds.length, skipped: existingIds.size };
  }

  async removeHcp(campaignId: string, hcpId: string) {
    const campaignHcp = await prisma.campaignHcp.findUnique({
      where: { campaignId_hcpId: { campaignId, hcpId } },
    });

    if (!campaignHcp) {
      throw new Error('HCP not assigned to this campaign');
    }

    // Don't allow removal if survey was already sent
    if (campaignHcp.emailSentAt) {
      throw new Error('Cannot remove HCP after survey invitation was sent');
    }

    await prisma.campaignHcp.delete({
      where: { id: campaignHcp.id },
    });

    return { removed: true };
  }

  async sendInvitations(campaignId: string) {
    return emailService.sendBulkInvitations(campaignId);
  }

  async sendReminders(campaignId: string, maxReminders: number = 3) {
    return emailService.sendBulkReminders(campaignId, maxReminders);
  }

  async sendSingleInvitation(campaignId: string, hcpId: string) {
    const campaignHcp = await prisma.campaignHcp.findUnique({
      where: {
        campaignId_hcpId: { campaignId, hcpId },
      },
      include: {
        hcp: true,
        campaign: {
          select: { name: true, honorariumAmount: true, status: true },
        },
      },
    });

    if (!campaignHcp) {
      throw new Error('HCP not found in campaign');
    }

    if (!campaignHcp.hcp.email) {
      throw new Error('HCP has no email address');
    }

    if (campaignHcp.campaign.status !== 'ACTIVE') {
      throw new Error('Campaign is not active');
    }

    return emailService.sendSurveyInvitation({
      campaignId,
      hcpId,
      email: campaignHcp.hcp.email,
      firstName: campaignHcp.hcp.firstName,
      lastName: campaignHcp.hcp.lastName,
      surveyToken: campaignHcp.surveyToken,
      campaignName: campaignHcp.campaign.name,
      honorariumAmount: campaignHcp.campaign.honorariumAmount
        ? Number(campaignHcp.campaign.honorariumAmount)
        : null,
    });
  }

  async getStats(campaignId: string) {
    const [
      total,
      invited,
      optedOut,
      responses,
    ] = await Promise.all([
      prisma.campaignHcp.count({ where: { campaignId } }),
      prisma.campaignHcp.count({ where: { campaignId, emailSentAt: { not: null } } }),
      prisma.optOut.count({
        where: {
          OR: [
            { scope: 'GLOBAL' },
            { scope: 'CAMPAIGN', campaignId },
          ],
          resubscribedAt: null,
        },
      }),
      prisma.surveyResponse.groupBy({
        by: ['status'],
        where: { campaignId },
        _count: true,
      }),
    ]);

    const statusCounts = responses.reduce(
      (acc: Record<string, number>, r: { status: string; _count: number }) => {
        acc[r.status] = r._count;
        return acc;
      },
      {} as Record<string, number>
    );

    const completed = statusCounts['COMPLETED'] || 0;
    const opened = statusCounts['OPENED'] || 0;
    const inProgress = statusCounts['IN_PROGRESS'] || 0;

    return {
      total,
      invited,
      notInvited: total - invited,
      opened,
      inProgress,
      completed,
      optedOut,
      responseRate: invited > 0 ? Math.round((completed / invited) * 100) : 0,
    };
  }

  async listHcps(campaignId: string, params: ListParams) {
    const { status, page, limit } = params;

    // Build where clause based on status filter
    const where: Record<string, unknown> = { campaignId };

    if (status === 'not_invited') {
      where.emailSentAt = null;
    } else if (status === 'invited') {
      where.emailSentAt = { not: null };
    }

    const [total, items] = await Promise.all([
      prisma.campaignHcp.count({ where }),
      prisma.campaignHcp.findMany({
        where,
        include: {
          hcp: {
            select: {
              id: true,
              npi: true,
              firstName: true,
              lastName: true,
              email: true,
              specialty: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Get response statuses for these HCPs
    const hcpIds = items.map((i: { hcpId: string }) => i.hcpId);
    const surveyResponses = await prisma.surveyResponse.findMany({
      where: {
        campaignId,
        respondentHcpId: { in: hcpIds },
      },
      select: {
        respondentHcpId: true,
        status: true,
        completedAt: true,
      },
    });

    const responseMap = new Map(
      surveyResponses.map((r: { respondentHcpId: string; status: string; completedAt: Date | null }) => [
        r.respondentHcpId,
        r,
      ])
    );

    const itemsWithStatus = items.map((item: { hcpId: string }) => ({
      ...item,
      surveyStatus: responseMap.get(item.hcpId)?.status || null,
      completedAt: responseMap.get(item.hcpId)?.completedAt || null,
    }));

    return {
      items: itemsWithStatus,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }
}

export const distributionService = new DistributionService();
