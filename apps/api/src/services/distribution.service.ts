import { prisma } from '../lib/prisma';
import { emailService } from './email.service';
import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';

interface ListParams {
  status?: string;
  page: number;
  limit: number;
}

export class DistributionService {
  async listCampaignHcps(campaignId: string) {
    const items = await prisma.campaignHcp.findMany({
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

    // Get survey response statuses for these HCPs
    const hcpIds = items.map((i) => i.hcpId);
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
      surveyResponses.map((r) => [r.respondentHcpId, r])
    );

    return items.map((item) => ({
      ...item,
      surveyStatus: responseMap.get(item.hcpId)?.status || null,
      completedAt: responseMap.get(item.hcpId)?.completedAt || null,
    }));
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
    const recentlySurveyed = statusCounts['RECENTLY_SURVEYED'] || 0;

    return {
      total,
      invited,
      notInvited: total - invited,
      opened,
      inProgress,
      completed,
      recentlySurveyed,
      optedOut,
      completionRate: invited > 0 ? Math.round((completed / invited) * 100) : 0,
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

  /**
   * Import HCPs from Excel or CSV file and assign them to a campaign
   */
  async importHcpsFromFile(campaignId: string, buffer: Buffer, filename: string, userId: string) {
    const rows = await this.parseFileToRows(buffer, filename);

    const result = {
      total: rows.length,
      hcpsCreated: 0,
      hcpsExisting: 0,
      addedToCampaign: 0,
      skipped: 0,
      errors: [] as { row: number; error: string }[],
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        // Normalize NPI
        const npi = String(row['NPI'] || row['npi'] || '').trim();
        if (!/^\d{10}$/.test(npi)) {
          throw new Error('Invalid NPI format (must be 10 digits)');
        }

        const hcpData = {
          npi,
          firstName: String(row['First Name'] || row['firstName'] || row['first_name'] || '').trim(),
          lastName: String(row['Last Name'] || row['lastName'] || row['last_name'] || '').trim(),
          email: (row['Email'] || row['email'] || null) as string | null,
          specialty: (row['Specialty'] || row['specialty'] || null) as string | null,
          subSpecialty: (row['Sub-specialty'] || row['subSpecialty'] || row['sub_specialty'] || null) as string | null,
          city: (row['City'] || row['city'] || null) as string | null,
          state: (row['State'] || row['state'] || null) as string | null,
        };

        if (!hcpData.firstName || !hcpData.lastName) {
          throw new Error('First Name and Last Name are required');
        }

        // Check if HCP already exists
        let hcp = await prisma.hcp.findUnique({ where: { npi } });

        if (hcp) {
          // Update existing HCP with any new data
          hcp = await prisma.hcp.update({
            where: { npi },
            data: {
              firstName: hcpData.firstName || hcp.firstName,
              lastName: hcpData.lastName || hcp.lastName,
              email: hcpData.email || hcp.email,
              specialty: hcpData.specialty || hcp.specialty,
              subSpecialty: hcpData.subSpecialty || hcp.subSpecialty,
              city: hcpData.city || hcp.city,
              state: hcpData.state || hcp.state,
            },
          });
          result.hcpsExisting++;
        } else {
          // Create new HCP
          hcp = await prisma.hcp.create({
            data: { ...hcpData, createdBy: userId },
          });
          result.hcpsCreated++;
        }

        // Check if HCP is already assigned to this campaign
        const existingAssignment = await prisma.campaignHcp.findUnique({
          where: { campaignId_hcpId: { campaignId, hcpId: hcp.id } },
        });

        if (existingAssignment) {
          result.skipped++;
        } else {
          // Assign HCP to campaign
          await prisma.campaignHcp.create({
            data: { campaignId, hcpId: hcp.id },
          });
          result.addedToCampaign++;
        }
      } catch (error) {
        result.errors.push({ row: i + 2, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    return result;
  }

  /**
   * Parse file buffer (Excel or CSV) to array of row objects
   */
  private async parseFileToRows(buffer: Buffer, filename: string): Promise<Record<string, unknown>[]> {
    const isExcel = filename.endsWith('.xlsx') || filename.endsWith('.xls');
    const isCsv = filename.endsWith('.csv');

    if (!isExcel && !isCsv) {
      throw new Error('Unsupported file format. Please use .xlsx, .xls, or .csv files.');
    }

    if (isCsv) {
      return this.parseCsvToRows(buffer);
    } else {
      return this.parseExcelToRows(buffer);
    }
  }

  private parseCsvToRows(buffer: Buffer): Record<string, unknown>[] {
    const content = buffer.toString('utf-8');
    const records = parseCsv(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
    return records as Record<string, unknown>[];
  }

  private async parseExcelToRows(buffer: Buffer): Promise<Record<string, unknown>[]> {
    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    await workbook.xlsx.load(arrayBuffer);
    const sheet = workbook.worksheets[0];

    const rows: Record<string, unknown>[] = [];
    const headers: string[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        row.eachCell((cell) => {
          headers.push(String(cell.value || ''));
        });
      } else {
        const rowData: Record<string, unknown> = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1];
          if (header) {
            rowData[header] = cell.value;
          }
        });
        rows.push(rowData);
      }
    });

    return rows;
  }
}

export const distributionService = new DistributionService();
