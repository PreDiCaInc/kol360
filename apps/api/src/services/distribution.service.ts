import { prisma } from '../lib/prisma';
import { EmailService } from './email.service';

const emailService = new EmailService();

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
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        campaignHcps: {
          where: { emailSentAt: null },
          include: { hcp: true },
        },
      },
    });

    if (!campaign) throw new Error('Campaign not found');
    if (campaign.status !== 'ACTIVE') throw new Error('Campaign must be active to send invitations');

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const ch of campaign.campaignHcps) {
      if (!ch.hcp.email) {
        failed++;
        errors.push(`${ch.hcp.firstName} ${ch.hcp.lastName}: No email address`);
        continue;
      }

      // Check opt-out
      const optOut = await prisma.optOut.findFirst({
        where: {
          email: ch.hcp.email,
          OR: [
            { scope: 'GLOBAL' },
            { scope: 'CAMPAIGN', campaignId },
          ],
          resubscribedAt: null,
        },
      });

      if (optOut) {
        failed++;
        errors.push(`${ch.hcp.firstName} ${ch.hcp.lastName}: Opted out`);
        continue;
      }

      try {
        await emailService.sendSurveyInvitation({
          to: ch.hcp.email,
          hcpName: ch.hcp.lastName,
          surveyToken: ch.surveyToken,
          campaignName: campaign.name,
          honorarium: campaign.honorariumAmount ? Number(campaign.honorariumAmount) : undefined,
        });

        await prisma.campaignHcp.update({
          where: { id: ch.id },
          data: { emailSentAt: new Date() },
        });

        sent++;
      } catch (error) {
        failed++;
        errors.push(`${ch.hcp.firstName} ${ch.hcp.lastName}: Send failed`);
      }
    }

    return { sent, failed, errors };
  }

  async sendReminders(campaignId: string) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        campaignHcps: {
          where: {
            emailSentAt: { not: null },
          },
          include: {
            hcp: true,
          },
        },
      },
    });

    if (!campaign) throw new Error('Campaign not found');
    if (campaign.status !== 'ACTIVE') throw new Error('Campaign must be active to send reminders');

    // Get HCPs who haven't completed the survey
    const completedResponses = await prisma.surveyResponse.findMany({
      where: { campaignId, status: 'COMPLETED' },
      select: { respondentHcpId: true },
    });
    const completedHcpIds = new Set(completedResponses.map((r: { respondentHcpId: string | null }) => r.respondentHcpId));

    let sent = 0;
    const errors: string[] = [];

    for (const ch of campaign.campaignHcps) {
      // Skip if already completed
      if (completedHcpIds.has(ch.hcpId)) continue;
      if (!ch.hcp.email) continue;

      try {
        await emailService.sendReminder({
          to: ch.hcp.email,
          hcpName: ch.hcp.lastName,
          surveyToken: ch.surveyToken,
          campaignName: campaign.name,
          reminderNumber: ch.reminderCount + 1,
        });

        await prisma.campaignHcp.update({
          where: { id: ch.id },
          data: {
            reminderCount: { increment: 1 },
            lastReminderAt: new Date(),
          },
        });

        sent++;
      } catch (error) {
        errors.push(`${ch.hcp.firstName} ${ch.hcp.lastName}: Send failed`);
      }
    }

    return { sent, errors };
  }

  async getStats(campaignId: string) {
    const [total, invited, responses] = await Promise.all([
      prisma.campaignHcp.count({ where: { campaignId } }),
      prisma.campaignHcp.count({ where: { campaignId, emailSentAt: { not: null } } }),
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
    const inProgress = (statusCounts['OPENED'] || 0) + (statusCounts['IN_PROGRESS'] || 0);

    return {
      total,
      invited,
      notInvited: total - invited,
      inProgress,
      completed,
      completionRate: invited > 0 ? Math.round((completed / invited) * 100) : 0,
    };
  }
}
