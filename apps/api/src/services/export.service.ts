import { prisma } from '../lib/prisma';
import ExcelJS from 'exceljs';
import { PaymentStatus } from '@prisma/client';

interface ExportResult {
  buffer: Buffer;
  filename: string;
  recordCount: number;
}

interface ImportResult {
  processed: number;
  updated: number;
  errors: Array<{ row: number; error: string }>;
}

export class ExportService {
  /**
   * Export all completed survey responses for a campaign
   */
  async exportResponses(campaignId: string): Promise<ExportResult> {
    // Get campaign info for filename
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { name: true },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Get all survey questions for this campaign (for column headers)
    const surveyQuestions = await prisma.surveyQuestion.findMany({
      where: { campaignId },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        questionTextSnapshot: true,
        sectionName: true,
      },
    });

    // Get all completed responses with answers
    const responses = await prisma.surveyResponse.findMany({
      where: {
        campaignId,
        status: 'COMPLETED',
      },
      include: {
        respondentHcp: {
          select: {
            npi: true,
            firstName: true,
            lastName: true,
            email: true,
            specialty: true,
            city: true,
            state: true,
          },
        },
        answers: {
          select: {
            questionId: true,
            answerText: true,
            answerJson: true,
          },
        },
      },
      orderBy: { completedAt: 'desc' },
    });

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'KOL360';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Survey Responses');

    // Build header row
    const headers = [
      'NPI',
      'First Name',
      'Last Name',
      'Email',
      'Specialty',
      'City',
      'State',
      'Completed At',
      ...surveyQuestions.map(q => q.questionTextSnapshot),
    ];

    worksheet.addRow(headers);

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Add data rows
    for (const response of responses) {
      const answerMap = new Map(
        response.answers.map(a => [a.questionId, a.answerText || JSON.stringify(a.answerJson) || ''])
      );

      const row = [
        response.respondentHcp.npi,
        response.respondentHcp.firstName,
        response.respondentHcp.lastName,
        response.respondentHcp.email || '',
        response.respondentHcp.specialty || '',
        response.respondentHcp.city || '',
        response.respondentHcp.state || '',
        response.completedAt?.toISOString() || '',
        ...surveyQuestions.map(q => answerMap.get(q.id) || ''),
      ];

      worksheet.addRow(row);
    }

    // Auto-fit columns
    worksheet.columns.forEach(column => {
      column.width = 20;
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    const sanitizedName = campaign.name.replace(/[^a-zA-Z0-9]/g, '_');
    const date = new Date().toISOString().split('T')[0];

    return {
      buffer: Buffer.from(buffer),
      filename: `${sanitizedName}_Responses_${date}.xlsx`,
      recordCount: responses.length,
    };
  }

  /**
   * Export HCP scores for a campaign
   */
  async exportScores(campaignId: string): Promise<ExportResult> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        diseaseArea: true,
        compositeScoreConfig: true,
      },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Get campaign scores with HCP info
    const scores = await prisma.hcpCampaignScore.findMany({
      where: { campaignId },
      include: {
        hcp: {
          select: {
            npi: true,
            firstName: true,
            lastName: true,
            email: true,
            specialty: true,
            city: true,
            state: true,
          },
        },
      },
      orderBy: { compositeScore: 'desc' },
    });

    // Get disease area scores for objective metrics
    const hcpIds = scores.map(s => s.hcpId);
    const diseaseAreaScores = await prisma.hcpDiseaseAreaScore.findMany({
      where: {
        hcpId: { in: hcpIds },
        diseaseAreaId: campaign.diseaseAreaId,
        isCurrent: true,
      },
    });

    const daScoreMap = new Map(diseaseAreaScores.map(s => [s.hcpId, s]));

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'KOL360';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('HCP Scores');

    // Headers
    const headers = [
      'Rank',
      'NPI',
      'First Name',
      'Last Name',
      'Email',
      'Specialty',
      'City',
      'State',
      'Publications Score',
      'Clinical Trials Score',
      'Trade Pubs Score',
      'Org Leadership Score',
      'Org Awareness Score',
      'Conference Score',
      'Social Media Score',
      'Media/Podcasts Score',
      'Survey Score',
      'Nomination Count',
      'Composite Score',
    ];

    worksheet.addRow(headers);

    // Style header
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Add data rows
    scores.forEach((score, index) => {
      const daScore = daScoreMap.get(score.hcpId);

      const toNum = (val: unknown): string => {
        if (val === null || val === undefined) return '';
        return Number(val).toFixed(2);
      };

      const row = [
        index + 1,
        score.hcp.npi,
        score.hcp.firstName,
        score.hcp.lastName,
        score.hcp.email || '',
        score.hcp.specialty || '',
        score.hcp.city || '',
        score.hcp.state || '',
        toNum(daScore?.scorePublications),
        toNum(daScore?.scoreClinicalTrials),
        toNum(daScore?.scoreTradePubs),
        toNum(daScore?.scoreOrgLeadership),
        toNum(daScore?.scoreOrgAwareness),
        toNum(daScore?.scoreConference),
        toNum(daScore?.scoreSocialMedia),
        toNum(daScore?.scoreMediaPodcasts),
        toNum(score.scoreSurvey),
        score.nominationCount,
        toNum(score.compositeScore),
      ];

      worksheet.addRow(row);
    });

    // Auto-fit columns
    worksheet.columns.forEach(column => {
      column.width = 18;
    });

    const buffer = await workbook.xlsx.writeBuffer();

    const sanitizedName = campaign.name.replace(/[^a-zA-Z0-9]/g, '_');
    const date = new Date().toISOString().split('T')[0];

    return {
      buffer: Buffer.from(buffer),
      filename: `${sanitizedName}_Scores_${date}.xlsx`,
      recordCount: scores.length,
    };
  }

  /**
   * Export payments pending export for payment processing
   */
  async exportPayments(campaignId: string, exportedBy: string): Promise<ExportResult> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { name: true },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Get pending payments
    const payments = await prisma.payment.findMany({
      where: {
        campaignId,
        status: 'PENDING_EXPORT',
      },
      include: {
        hcp: {
          select: {
            npi: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        response: {
          select: {
            completedAt: true,
          },
        },
      },
    });

    if (payments.length === 0) {
      throw new Error('No pending payments to export');
    }

    // Create export batch
    const exportBatch = await prisma.paymentExportBatch.create({
      data: {
        campaignId,
        exportedBy,
        recordCount: payments.length,
      },
    });

    // Update payments to EXPORTED status
    await prisma.payment.updateMany({
      where: {
        id: { in: payments.map(p => p.id) },
      },
      data: {
        status: 'EXPORTED',
        exportedAt: new Date(),
        exportBatchId: exportBatch.id,
      },
    });

    // Create status history for each payment
    for (const payment of payments) {
      await prisma.paymentStatusHistory.create({
        data: {
          paymentId: payment.id,
          oldStatus: 'PENDING_EXPORT',
          newStatus: 'EXPORTED',
          changedBy: exportedBy,
          importBatchId: exportBatch.id,
        },
      });
    }

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'KOL360';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Payments');

    const headers = [
      'Payment ID',
      'NPI',
      'First Name',
      'Last Name',
      'Email',
      'Survey Completion Date',
      'Payment Amount',
      'Currency',
    ];

    worksheet.addRow(headers);

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    for (const payment of payments) {
      const row = [
        payment.id,
        payment.hcp.npi,
        payment.hcp.firstName,
        payment.hcp.lastName,
        payment.hcp.email || '',
        payment.response.completedAt?.toISOString().split('T')[0] || '',
        Number(payment.amount).toFixed(2),
        payment.currency,
      ];

      worksheet.addRow(row);
    }

    worksheet.columns.forEach(column => {
      column.width = 20;
    });

    const buffer = await workbook.xlsx.writeBuffer();

    const sanitizedName = campaign.name.replace(/[^a-zA-Z0-9]/g, '_');
    const date = new Date().toISOString().split('T')[0];

    // Update batch with filename
    await prisma.paymentExportBatch.update({
      where: { id: exportBatch.id },
      data: { fileName: `${sanitizedName}_Payments_${date}.xlsx` },
    });

    return {
      buffer: Buffer.from(buffer),
      filename: `${sanitizedName}_Payments_${date}.xlsx`,
      recordCount: payments.length,
    };
  }

  /**
   * Import payment status updates from Excel file
   */
  async importPaymentStatus(
    campaignId: string,
    buffer: Buffer,
    importedBy: string
  ): Promise<ImportResult> {
    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer;
    await workbook.xlsx.load(arrayBuffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('No worksheet found in file');
    }

    // Get headers from first row
    const headers: string[] = [];
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber - 1] = String(cell.value || '').toLowerCase().trim();
    });

    // Find column indices
    const paymentIdCol = headers.findIndex(h => h === 'payment id');
    const npiCol = headers.findIndex(h => h === 'npi');
    const statusCol = headers.findIndex(h => h === 'status');

    if (statusCol === -1) {
      throw new Error('Status column not found in file');
    }

    // Status mapping from external formats to our enum
    const statusMap: Record<string, PaymentStatus> = {
      'sent': 'EMAIL_SENT',
      'email_sent': 'EMAIL_SENT',
      'delivered': 'EMAIL_DELIVERED',
      'email_delivered': 'EMAIL_DELIVERED',
      'opened': 'EMAIL_OPENED',
      'email_opened': 'EMAIL_OPENED',
      'claimed': 'CLAIMED',
      'accepted': 'CLAIMED',
      'paid': 'CLAIMED',
      'bounced': 'BOUNCED',
      'rejected': 'REJECTED',
      'declined': 'REJECTED',
      'expired': 'EXPIRED',
    };

    const result: ImportResult = {
      processed: 0,
      updated: 0,
      errors: [],
    };

    // Create import batch
    const importBatch = await prisma.paymentImportBatch.create({
      data: {
        campaignId,
        importedBy,
        fileName: 'status_import.xlsx',
        recordCount: 0,
        matchedCount: 0,
        unmatchedCount: 0,
        status: 'processing',
      },
    });

    // Process each row (skip header)
    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      result.processed++;

      try {
        // Get identifier (Payment ID or NPI)
        let identifier = '';
        if (paymentIdCol >= 0) {
          identifier = String(row.getCell(paymentIdCol + 1).value || '').trim();
        }
        if (!identifier && npiCol >= 0) {
          identifier = String(row.getCell(npiCol + 1).value || '').trim();
        }

        if (!identifier) {
          result.errors.push({
            row: i,
            error: 'No payment ID or NPI found',
          });
          continue;
        }

        // Get status
        const rawStatus = String(row.getCell(statusCol + 1).value || '').toLowerCase().trim();
        const mappedStatus = statusMap[rawStatus];

        if (!mappedStatus) {
          result.errors.push({
            row: i,
            error: `Unknown status: ${rawStatus}`,
          });
          continue;
        }

        // Find payment
        let payment;
        if (identifier.match(/^[a-z0-9]{20,}$/i)) {
          // Looks like a cuid - payment ID
          payment = await prisma.payment.findFirst({
            where: { id: identifier, campaignId },
          });
        } else {
          // Assume NPI
          payment = await prisma.payment.findFirst({
            where: {
              campaignId,
              hcp: { npi: identifier },
            },
          });
        }

        if (!payment) {
          result.errors.push({
            row: i,
            error: `Payment not found for: ${identifier}`,
          });
          continue;
        }

        // Update payment status
        const oldStatus = payment.status;
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: mappedStatus,
            statusUpdatedAt: new Date(),
          },
        });

        // Create status history
        await prisma.paymentStatusHistory.create({
          data: {
            paymentId: payment.id,
            oldStatus,
            newStatus: mappedStatus,
            changedBy: importedBy,
            importBatchId: importBatch.id,
          },
        });

        result.updated++;
      } catch (error) {
        result.errors.push({
          row: i,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Update import batch
    await prisma.paymentImportBatch.update({
      where: { id: importBatch.id },
      data: {
        recordCount: result.processed,
        matchedCount: result.updated,
        unmatchedCount: result.errors.length,
        status: result.errors.length > 0 ? 'completed_with_errors' : 'completed',
      },
    });

    return result;
  }

  /**
   * List payments for a campaign
   */
  async listPayments(
    campaignId: string,
    params: { status?: PaymentStatus; page: number; limit: number }
  ) {
    const { status, page, limit } = params;

    const where: { campaignId: string; status?: PaymentStatus } = { campaignId };
    if (status) where.status = status;

    const [total, items] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        include: {
          hcp: {
            select: {
              npi: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          response: {
            select: { completedAt: true },
          },
          statusHistory: {
            orderBy: { changedAt: 'desc' },
            take: 5,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get payment stats for a campaign
   */
  async getPaymentStats(campaignId: string) {
    const stats = await prisma.payment.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: true,
      _sum: { amount: true },
    });

    const total = await prisma.payment.aggregate({
      where: { campaignId },
      _count: true,
      _sum: { amount: true },
    });

    return {
      byStatus: stats.reduce((acc, s) => {
        acc[s.status] = {
          count: s._count,
          amount: Number(s._sum.amount || 0),
        };
        return acc;
      }, {} as Record<string, { count: number; amount: number }>),
      total: {
        count: total._count,
        amount: Number(total._sum.amount || 0),
      },
    };
  }
}

export const exportService = new ExportService();
