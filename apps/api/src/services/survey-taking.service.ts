import { prisma } from '../lib/prisma';

interface SurveyQuestion {
  id: string;
  questionId: string;
  text: string;
  type: string;
  section: string | null;
  isRequired: boolean;
  options: unknown;
}

interface SurveyData {
  campaign: {
    id: string;
    name: string;
    status: string;
    honorariumAmount: number | null;
  };
  hcp: {
    firstName: string;
    lastName: string;
  };
  questions: SurveyQuestion[];
  response: {
    status: string;
    answers: Record<string, unknown>;
  } | null;
}

export class SurveyTakingService {
  async getSurveyByToken(token: string): Promise<SurveyData | null> {
    const campaignHcp = await prisma.campaignHcp.findUnique({
      where: { surveyToken: token },
      include: {
        campaign: {
          include: {
            surveyQuestions: {
              include: { question: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        hcp: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    if (!campaignHcp) return null;

    // Get existing response if any
    const response = await prisma.surveyResponse.findUnique({
      where: { surveyToken: token },
      include: {
        answers: true,
      },
    });

    return {
      campaign: {
        id: campaignHcp.campaign.id,
        name: campaignHcp.campaign.name,
        status: campaignHcp.campaign.status,
        honorariumAmount: campaignHcp.campaign.honorariumAmount
          ? Number(campaignHcp.campaign.honorariumAmount)
          : null,
      },
      hcp: campaignHcp.hcp,
      questions: campaignHcp.campaign.surveyQuestions.map((sq: {
        id: string;
        questionId: string;
        questionTextSnapshot: string;
        sectionName: string | null;
        isRequired: boolean;
        question: { type: string; options: unknown };
      }) => ({
        id: sq.id,
        questionId: sq.questionId,
        text: sq.questionTextSnapshot,
        type: sq.question.type,
        section: sq.sectionName,
        isRequired: sq.isRequired,
        options: sq.question.options,
      })),
      response: response
        ? {
            status: response.status,
            answers: response.answers.reduce(
              (acc: Record<string, unknown>, a: { questionId: string; answerJson: unknown; answerText: string | null }) => {
                acc[a.questionId] = a.answerJson ?? a.answerText;
                return acc;
              },
              {}
            ),
          }
        : null,
    };
  }

  async startSurvey(token: string, ipAddress?: string) {
    // Check if response exists
    const existingResponse = await prisma.surveyResponse.findUnique({
      where: { surveyToken: token },
    });

    if (existingResponse) {
      if (existingResponse.status === 'COMPLETED') {
        throw new Error('Survey already completed');
      }

      // Update to OPENED if still PENDING
      return prisma.surveyResponse.update({
        where: { surveyToken: token },
        data: {
          status: existingResponse.status === 'PENDING' ? 'OPENED' : existingResponse.status,
          startedAt: existingResponse.startedAt || new Date(),
          ipAddress: ipAddress || existingResponse.ipAddress,
        },
      });
    }

    // Create response record if not exists
    const campaignHcp = await prisma.campaignHcp.findUnique({
      where: { surveyToken: token },
    });

    if (!campaignHcp) {
      throw new Error('Invalid survey token');
    }

    return prisma.surveyResponse.create({
      data: {
        campaignId: campaignHcp.campaignId,
        respondentHcpId: campaignHcp.hcpId,
        surveyToken: token,
        status: 'OPENED',
        startedAt: new Date(),
        ipAddress,
      },
    });
  }

  async saveProgress(token: string, answers: Record<string, unknown>) {
    const response = await prisma.surveyResponse.findUnique({
      where: { surveyToken: token },
    });

    if (!response) {
      throw new Error('Survey not started');
    }

    if (response.status === 'COMPLETED') {
      throw new Error('Cannot save to completed survey');
    }

    // Update status to IN_PROGRESS
    await prisma.surveyResponse.update({
      where: { id: response.id },
      data: { status: 'IN_PROGRESS' },
    });

    // Upsert answers
    for (const [questionId, value] of Object.entries(answers)) {
      if (value === null || value === undefined) continue;

      const isJson = typeof value === 'object';

      // Find existing answer
      const existing = await prisma.surveyResponseAnswer.findFirst({
        where: { responseId: response.id, questionId },
      });

      if (existing) {
        await prisma.surveyResponseAnswer.update({
          where: { id: existing.id },
          data: {
            answerText: isJson ? null : String(value),
            answerJson: isJson ? (value as object) : undefined,
          },
        });
      } else {
        await prisma.surveyResponseAnswer.create({
          data: {
            responseId: response.id,
            questionId,
            answerText: isJson ? null : String(value),
            answerJson: isJson ? (value as object) : undefined,
          },
        });
      }
    }

    return { saved: true };
  }

  async submitSurvey(token: string, answers: Record<string, unknown>) {
    // Save final answers first
    await this.saveProgress(token, answers);

    const response = await prisma.surveyResponse.findUnique({
      where: { surveyToken: token },
      include: {
        campaign: true,
        answers: {
          include: {
            question: {
              include: { question: true },
            },
          },
        },
      },
    });

    if (!response) {
      throw new Error('Survey not found');
    }

    // Mark as completed
    await prisma.surveyResponse.update({
      where: { id: response.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    // Create nominations from MULTI_TEXT answers
    const nominations: Array<{
      responseId: string;
      questionId: string;
      nominatorHcpId: string;
      rawNameEntered: string;
    }> = [];

    for (const answer of response.answers) {
      if (answer.question.question.type === 'MULTI_TEXT' && answer.answerJson) {
        const names = answer.answerJson as string[];
        for (const name of names.filter(Boolean)) {
          nominations.push({
            responseId: response.id,
            questionId: answer.questionId,
            nominatorHcpId: response.respondentHcpId,
            rawNameEntered: name.trim(),
          });
        }
      }
    }

    if (nominations.length > 0) {
      await prisma.nomination.createMany({
        data: nominations,
        skipDuplicates: true,
      });
    }

    // Create payment record if honorarium is set
    if (response.campaign.honorariumAmount) {
      await prisma.payment.create({
        data: {
          campaignId: response.campaignId,
          hcpId: response.respondentHcpId,
          responseId: response.id,
          amount: response.campaign.honorariumAmount,
          status: 'PENDING_EXPORT',
        },
      });
    }

    return { submitted: true };
  }

  async unsubscribe(
    token: string,
    scope: 'CAMPAIGN' | 'GLOBAL',
    reason?: string
  ) {
    const campaignHcp = await prisma.campaignHcp.findUnique({
      where: { surveyToken: token },
      include: {
        hcp: { select: { email: true } },
      },
    });

    if (!campaignHcp || !campaignHcp.hcp.email) {
      throw new Error('Invalid token or no email associated');
    }

    // Check if already opted out
    const existing = await prisma.optOut.findFirst({
      where: {
        email: campaignHcp.hcp.email,
        scope,
        ...(scope === 'CAMPAIGN' ? { campaignId: campaignHcp.campaignId } : {}),
        resubscribedAt: null,
      },
    });

    if (existing) {
      return { alreadyOptedOut: true };
    }

    await prisma.optOut.create({
      data: {
        email: campaignHcp.hcp.email,
        scope,
        campaignId: scope === 'CAMPAIGN' ? campaignHcp.campaignId : null,
        reason,
        optedOutVia: 'email_link',
      },
    });

    return { optedOut: true, scope };
  }
}

export const surveyTakingService = new SurveyTakingService();
