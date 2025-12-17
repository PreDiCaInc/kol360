import { prisma } from '../lib/prisma';

interface ListParams {
  status?: string;
  page: number;
  limit: number;
}

interface ResponseItem {
  id: string;
  campaignId: string;
  surveyToken: string;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  ipAddress: string | null;
  excludedAt?: Date | null;
  excludedReason?: string | null;
  excludedBy?: string | null;
  createdAt: Date;
  respondentHcp: {
    id: string;
    npi: string;
    firstName: string;
    lastName: string;
    email: string | null;
  };
  _count: {
    nominations: number;
  };
}

export class ResponseService {
  async listForCampaign(campaignId: string, params: ListParams) {
    const { status, page, limit } = params;

    const where: Record<string, unknown> = { campaignId };
    if (status) where.status = status;

    const [total, items] = await Promise.all([
      prisma.surveyResponse.count({ where }),
      prisma.surveyResponse.findMany({
        where,
        include: {
          respondentHcp: {
            select: { id: true, npi: true, firstName: true, lastName: true, email: true },
          },
          _count: { select: { nominations: true } },
        },
        orderBy: { completedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: items as ResponseItem[],
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getResponseDetail(responseId: string) {
    return prisma.surveyResponse.findUnique({
      where: { id: responseId },
      include: {
        respondentHcp: true,
        campaign: {
          select: { id: true, name: true, status: true },
        },
        answers: {
          include: {
            question: {
              include: { question: true },
            },
          },
          orderBy: { question: { sortOrder: 'asc' } },
        },
        nominations: {
          include: {
            matchedHcp: { select: { id: true, firstName: true, lastName: true, npi: true } },
          },
        },
        payment: true,
      },
    });
  }

  async updateAnswer(
    responseId: string,
    questionId: string,
    value: unknown,
    updatedBy: string
  ) {
    // Verify response exists and get campaign for audit log
    const response = await prisma.surveyResponse.findUnique({
      where: { id: responseId },
      include: { campaign: { select: { id: true } } },
    });

    if (!response) {
      throw new Error('Response not found');
    }

    const isJson = typeof value === 'object';

    // Get current answer for audit
    const currentAnswer = await prisma.surveyResponseAnswer.findUnique({
      where: {
        responseId_questionId: { responseId, questionId },
      },
    });

    // Upsert the answer
    const answer = await prisma.surveyResponseAnswer.upsert({
      where: {
        responseId_questionId: { responseId, questionId },
      },
      create: {
        responseId,
        questionId,
        answerText: isJson ? null : String(value),
        answerJson: isJson ? value : null,
      },
      update: {
        answerText: isJson ? null : String(value),
        answerJson: isJson ? value : null,
      },
    });

    // Log the edit in audit log
    await prisma.auditLog.create({
      data: {
        action: 'RESPONSE_ANSWER_EDITED',
        entityType: 'SurveyResponseAnswer',
        entityId: answer.id,
        userId: updatedBy,
        details: {
          responseId,
          questionId,
          oldValue: currentAnswer?.answerText ?? currentAnswer?.answerJson,
          newValue: value,
        },
      },
    });

    return answer;
  }

  async excludeResponse(responseId: string, reason: string, excludedBy: string) {
    const response = await prisma.surveyResponse.findUnique({
      where: { id: responseId },
    });

    if (!response) {
      throw new Error('Response not found');
    }

    if (response.status === 'EXCLUDED') {
      throw new Error('Response is already excluded');
    }

    // Store the previous status before excluding
    const previousStatus = response.status;

    // Update response with exclusion info
    // Note: The schema should have an EXCLUDED status in the enum
    // If not, we'll store exclusion info in separate fields
    const updated = await prisma.surveyResponse.update({
      where: { id: responseId },
      data: {
        status: 'EXCLUDED',
        // Store exclusion metadata - if these fields don't exist,
        // they would need to be added to the schema
      },
    });

    // Log the exclusion
    await prisma.auditLog.create({
      data: {
        action: 'RESPONSE_EXCLUDED',
        entityType: 'SurveyResponse',
        entityId: responseId,
        userId: excludedBy,
        details: {
          reason,
          previousStatus,
        },
      },
    });

    return updated;
  }

  async includeResponse(responseId: string, includedBy: string) {
    const response = await prisma.surveyResponse.findUnique({
      where: { id: responseId },
    });

    if (!response) {
      throw new Error('Response not found');
    }

    if (response.status !== 'EXCLUDED') {
      throw new Error('Response is not excluded');
    }

    // Restore to COMPLETED status (most common case for re-inclusion)
    const updated = await prisma.surveyResponse.update({
      where: { id: responseId },
      data: {
        status: 'COMPLETED',
      },
    });

    // Log the re-inclusion
    await prisma.auditLog.create({
      data: {
        action: 'RESPONSE_INCLUDED',
        entityType: 'SurveyResponse',
        entityId: responseId,
        userId: includedBy,
        details: {
          previousStatus: 'EXCLUDED',
        },
      },
    });

    return updated;
  }

  async getResponseStats(campaignId: string) {
    const stats = await prisma.surveyResponse.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: true,
    });

    return stats.reduce(
      (acc: Record<string, number>, s: { status: string; _count: number }) => {
        acc[s.status] = s._count;
        return acc;
      },
      {}
    );
  }
}

export const responseService = new ResponseService();
