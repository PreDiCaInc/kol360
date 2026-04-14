import { prisma } from '../lib/prisma';
import { HcpService } from './hcp.service';

const hcpServiceInstance = new HcpService();
import { emailService } from './email.service';
import { createAuditLog } from '../lib/audit';
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
      select: {
        id: true,
        campaignId: true,
        hcpId: true,
        surveyToken: true,
        emailSentAt: true,
        reminderCount: true,
        lastReminderAt: true,
        createdAt: true,
        // Segmentation fields
        marketDecile: true,
        product1Decile: true,
        product2Decile: true,
        practiceSetting: true,
        practiceSentiment: true,
        prescribingBehavior: true,
        segmentation1: true,
        segmentation2: true,
        segmentation3: true,
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

  async sendInvitations(campaignId: string, progressId?: string) {
    return emailService.sendBulkInvitations(campaignId, progressId);
  }

  async sendReminders(campaignId: string, maxReminders: number = 3, progressId?: string) {
    return emailService.sendBulkReminders(campaignId, maxReminders, progressId);
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
      atMaxReminders,
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
      // Count invited HCPs that have hit the default reminder limit (3) and have not completed
      prisma.campaignHcp.count({
        where: {
          campaignId,
          emailSentAt: { not: null },
          reminderCount: { gte: 3 },
          hcp: {
            surveyResponses: {
              none: { campaignId, status: 'COMPLETED' },
            },
          },
        },
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
      atMaxReminders,
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
        select: {
          id: true,
          campaignId: true,
          hcpId: true,
          surveyToken: true,
          emailSentAt: true,
          reminderCount: true,
          lastReminderAt: true,
          createdAt: true,
          // Segmentation fields
          marketDecile: true,
          product1Decile: true,
          product2Decile: true,
          practiceSetting: true,
          practiceSentiment: true,
          prescribingBehavior: true,
          segmentation1: true,
          segmentation2: true,
          segmentation3: true,
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
   * Get survey status list — enriched view of campaign HCPs with derived status
   * (completed/in_progress/opened/unsubscribed/invited/not_invited) and status date.
   * Supports search, status filter, sort, and pagination.
   */
  async getSurveyStatusList(
    campaignId: string,
    params: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string | string[]; // single value or array of statuses (multi-select)
      sortBy?: 'firstName' | 'lastName' | 'specialty' | 'state' | 'status' | 'date' | 'lastQuestion';
      sortOrder?: 'asc' | 'desc';
    }
  ) {
    const page = Math.max(1, params.page || 1);
    // Allow large limits for export-all (frontend passes 5000 to fetch all records)
    const limit = Math.min(5000, Math.max(1, params.limit || 50));
    const search = params.search?.trim();
    // Normalize status filter to an array; 'all' or empty means no filter
    const statusInput = params.status;
    const statusSet: Set<string> | null = (() => {
      if (!statusInput) return null;
      const arr = Array.isArray(statusInput)
        ? statusInput
        : statusInput.split(',').map(s => s.trim()).filter(Boolean);
      if (arr.length === 0 || arr.includes('all')) return null;
      return new Set(arr);
    })();
    const sortBy = params.sortBy || 'lastName';
    const sortOrder = params.sortOrder || 'asc';

    // Build base where clause — only filter by DB-level criteria here (search, not status)
    const where: Record<string, unknown> = { campaignId };

    if (search) {
      where.hcp = {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { npi: { contains: search } },
        ],
      };
    }

    // Fetch all matching rows (we compute status in JS and then paginate)
    const allRows = await prisma.campaignHcp.findMany({
      where,
      select: {
        id: true,
        hcpId: true,
        surveyToken: true,
        emailSentAt: true,
        lastReminderAt: true,
        createdAt: true,
        hcp: {
          select: {
            id: true,
            npi: true,
            firstName: true,
            lastName: true,
            email: true,
            specialty: true,
            subSpecialty: true,
            city: true,
            state: true,
          },
        },
      },
    });

    const hcpIds = allRows.map(r => r.hcpId);

    // Total questions in this campaign (for progress denominator)
    const totalQuestions = await prisma.surveyQuestion.count({ where: { campaignId } });

    // Batch query responses, opt-outs, and last-answered-question per response
    const [responses, optOuts] = await Promise.all([
      prisma.surveyResponse.findMany({
        where: { campaignId, respondentHcpId: { in: hcpIds } },
        select: {
          id: true,
          respondentHcpId: true,
          status: true,
          startedAt: true,
          completedAt: true,
        },
      }),
      prisma.optOut.findMany({
        where: {
          hcpId: { in: hcpIds },
          resubscribedAt: null,
          OR: [
            { scope: 'GLOBAL' },
            { scope: 'CAMPAIGN', campaignId },
          ],
        },
        select: {
          hcpId: true,
          optedOutAt: true,
        },
      }),
    ]);

    // Compute last answered question (max sortOrder) per response
    const responseIds = responses.map(r => r.id);
    const lastAnsweredMap = new Map<string, number>();
    if (responseIds.length > 0) {
      const rows = await prisma.$queryRaw<Array<{ responseId: string; maxOrder: number }>>`
        SELECT a."responseId" as "responseId", MAX(sq."sortOrder") as "maxOrder"
        FROM "SurveyResponseAnswer" a
        JOIN "SurveyQuestion" sq ON a."questionId" = sq.id
        WHERE a."responseId" = ANY(${responseIds}::text[])
        GROUP BY a."responseId"
      `;
      for (const r of rows) {
        // sortOrder is 0-indexed in schema; display as 1-indexed
        lastAnsweredMap.set(r.responseId, Number(r.maxOrder) + 1);
      }
    }

    const responseMap = new Map(responses.map(r => [r.respondentHcpId, r]));
    const optOutMap = new Map(
      optOuts.filter(o => o.hcpId !== null).map(o => [o.hcpId!, o])
    );

    // Enrich each row with derived status + date + progress
    const enriched = allRows.map(row => {
      const response = responseMap.get(row.hcpId);
      const optOut = optOutMap.get(row.hcpId);
      const lastQuestion = response ? (lastAnsweredMap.get(response.id) ?? 0) : 0;

      let status: 'completed' | 'in_progress' | 'opened' | 'unsubscribed' | 'invited' | 'not_invited';
      let statusDate: Date | null;

      if (optOut) {
        status = 'unsubscribed';
        statusDate = optOut.optedOutAt;
      } else if (response?.status === 'COMPLETED') {
        status = 'completed';
        statusDate = response.completedAt;
      } else if (response?.status === 'IN_PROGRESS') {
        status = 'in_progress';
        statusDate = response.startedAt;
      } else if (response?.status === 'OPENED') {
        status = 'opened';
        statusDate = response.startedAt;
      } else if (row.emailSentAt) {
        status = 'invited';
        // Use the more recent of emailSentAt and lastReminderAt
        statusDate = row.lastReminderAt && row.lastReminderAt > row.emailSentAt
          ? row.lastReminderAt
          : row.emailSentAt;
      } else {
        status = 'not_invited';
        statusDate = row.createdAt;
      }

      return {
        campaignHcpId: row.id,
        hcpId: row.hcpId,
        npi: row.hcp.npi,
        firstName: row.hcp.firstName,
        lastName: row.hcp.lastName,
        email: row.hcp.email,
        specialty: row.hcp.specialty,
        subSpecialty: row.hcp.subSpecialty,
        city: row.hcp.city,
        state: row.hcp.state,
        status,
        statusDate: statusDate ? statusDate.toISOString() : null,
        lastQuestion,                    // 0 if no answers yet, otherwise 1-indexed question number
        totalQuestions,                  // total questions in the campaign
        surveyToken: row.surveyToken,    // route strips this for non-PLATFORM_ADMIN
      };
    });

    // Apply status filter (multi-select): null = no filter
    const filtered = statusSet === null
      ? enriched
      : enriched.filter(r => statusSet.has(r.status));

    // Sort
    const sortMultiplier = sortOrder === 'asc' ? 1 : -1;
    const getSortValue = (row: typeof filtered[0]): string | number => {
      switch (sortBy) {
        case 'firstName': return (row.firstName || '').toLowerCase();
        case 'lastName': return (row.lastName || '').toLowerCase();
        case 'specialty': return (row.specialty || '').toLowerCase();
        case 'state': return (row.state || '').toLowerCase();
        case 'status': return row.status;
        case 'date': return row.statusDate ? new Date(row.statusDate).getTime() : 0;
        case 'lastQuestion': return row.lastQuestion;
        default: return (row.lastName || '').toLowerCase();
      }
    };

    filtered.sort((a, b) => {
      const av = getSortValue(a);
      const bv = getSortValue(b);
      if (av < bv) return -1 * sortMultiplier;
      if (av > bv) return 1 * sortMultiplier;
      return 0;
    });

    // Paginate
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const items = filtered.slice((page - 1) * limit, page * limit);

    return {
      items,
      pagination: { page, limit, total, pages },
      totalQuestions,
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
          specialty: (() => {
            const raw = (row['Specialty'] || row['specialty'] || null) as string | null;
            if (!raw) return null;
            const s = raw.trim().toUpperCase();
            if (s === 'OD') return 'Optometry';
            if (s === 'MD' || s === 'DO') return 'Ophthalmology';
            return raw.trim();
          })(),
          subSpecialty: (row['Sub-specialty'] || row['subSpecialty'] || row['sub_specialty'] || null) as string | null,
          city: (row['City'] || row['city'] || null) as string | null,
          state: (row['State'] || row['state'] || null) as string | null,
        };

        if (!hcpData.firstName || !hcpData.lastName) {
          throw new Error('First Name and Last Name are required');
        }

        if (!hcpData.email) {
          throw new Error('Email is required');
        }

        if (!hcpData.specialty) {
          throw new Error('Specialty is required');
        }

        // Check if HCP already exists
        let hcp = await prisma.hcp.findUnique({ where: { npi } });

        if (hcp) {
          // Capture old values for audit logging
          const oldValues = {
            firstName: hcp.firstName,
            lastName: hcp.lastName,
            email: hcp.email,
            specialty: hcp.specialty,
            subSpecialty: hcp.subSpecialty,
            city: hcp.city,
            state: hcp.state,
          };

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
              isSurveyTaker: true,
            },
          });

          // Audit log if any field actually changed
          const newValues = {
            firstName: hcp.firstName,
            lastName: hcp.lastName,
            email: hcp.email,
            specialty: hcp.specialty,
            subSpecialty: hcp.subSpecialty,
            city: hcp.city,
            state: hcp.state,
          };

          const hasChanges = Object.keys(oldValues).some(
            (key) => oldValues[key as keyof typeof oldValues] !== newValues[key as keyof typeof newValues]
          );

          if (hasChanges) {
            await createAuditLog(userId, {
              action: 'hcp.updated',
              entityType: 'Hcp',
              entityId: hcp.id,
              oldValues,
              newValues: { ...newValues, _source: 'campaign-import', _campaignId: campaignId },
            });
          }

          result.hcpsExisting++;
        } else {
          // Create new HCP atomically (beId generation + creation in single transaction)
          // email is guaranteed to be non-null here (validated above)
          hcp = await hcpServiceInstance.createWithAtomicBeId({
            ...hcpData,
            email: hcpData.email as string, // Validated above - email is required
          }, userId);
          result.hcpsCreated++;
        }

        // Extract campaign-level segmentation fields
        const segmentationData = this.extractSegmentationFields(row);

        // Check if HCP is already assigned to this campaign
        const existingAssignment = await prisma.campaignHcp.findUnique({
          where: { campaignId_hcpId: { campaignId, hcpId: hcp.id } },
        });

        if (existingAssignment) {
          // Update segmentation fields if provided
          if (Object.keys(segmentationData).length > 0) {
            await prisma.campaignHcp.update({
              where: { id: existingAssignment.id },
              data: segmentationData,
            });
          }
          result.skipped++;
        } else {
          // Assign HCP to campaign with segmentation data
          await prisma.campaignHcp.create({
            data: { campaignId, hcpId: hcp.id, ...segmentationData },
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

  /**
   * Extract campaign-level HCP segmentation fields from a row
   * All fields are optional
   */
  private extractSegmentationFields(row: Record<string, unknown>): Record<string, number | string | null> {
    const data: Record<string, number | string | null> = {};

    // Helper to parse decile values (1-10)
    const parseDecile = (value: unknown): number | null => {
      if (value === null || value === undefined || value === '') return null;
      const num = parseInt(String(value), 10);
      if (isNaN(num) || num < 1 || num > 10) return null;
      return num;
    };

    // Helper to parse string values
    const parseString = (value: unknown): string | null => {
      if (value === null || value === undefined || value === '') return null;
      return String(value).trim();
    };

    // Market Decile (1-10)
    const marketDecile = parseDecile(
      row['Market Decile'] || row['marketDecile'] || row['market_decile']
    );
    if (marketDecile !== null) data.marketDecile = marketDecile;

    // Product1 Decile (1-10)
    const product1Decile = parseDecile(
      row['Product1 Decile'] || row['product1Decile'] || row['product1_decile']
    );
    if (product1Decile !== null) data.product1Decile = product1Decile;

    // Product2 Decile (1-10)
    const product2Decile = parseDecile(
      row['Product2 Decile'] || row['product2Decile'] || row['product2_decile']
    );
    if (product2Decile !== null) data.product2Decile = product2Decile;

    // Practice Setting (Surgical, Community, Academic, Retail)
    const practiceSetting = parseString(
      row['Practice Setting'] || row['practiceSetting'] || row['practice_setting']
    );
    if (practiceSetting !== null) data.practiceSetting = practiceSetting;

    // Practice Sentiment (categorical)
    const practiceSentiment = parseString(
      row['Practice Sentiment'] || row['practiceSentiment'] || row['practice_sentiment']
    );
    if (practiceSentiment !== null) data.practiceSentiment = practiceSentiment;

    // Prescribing Behavior (Champions/Loyalist, Splitter, Dabblers, Unaware/Disengaged)
    const prescribingBehavior = parseString(
      row['Prescribing Behavior'] || row['prescribingBehavior'] || row['prescribing_behavior']
    );
    if (prescribingBehavior !== null) data.prescribingBehavior = prescribingBehavior;

    // Segmentation1 (categorical)
    const segmentation1 = parseString(
      row['Segmentation1'] || row['segmentation1'] || row['Segmentation 1']
    );
    if (segmentation1 !== null) data.segmentation1 = segmentation1;

    // Segmentation2 (categorical)
    const segmentation2 = parseString(
      row['Segmentation2'] || row['segmentation2'] || row['Segmentation 2']
    );
    if (segmentation2 !== null) data.segmentation2 = segmentation2;

    // Segmentation3 (categorical)
    const segmentation3 = parseString(
      row['Segmentation3'] || row['segmentation3'] || row['Segmentation 3']
    );
    if (segmentation3 !== null) data.segmentation3 = segmentation3;

    return data;
  }
}

export const distributionService = new DistributionService();
