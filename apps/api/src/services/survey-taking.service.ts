import { prisma } from '../lib/prisma';
import { PrismaPromise } from '@prisma/client';

interface SurveyQuestion {
  id: string;
  questionId: string;
  text: string;
  type: string;
  section: string | null;
  sectionDescription: string | null;
  isRequired: boolean;
  options: unknown;
  minEntries: number | null;
  defaultEntries: number | null;
}

interface SurveyData {
  campaign: {
    id: string;
    name: string;
    status: string;
    honorariumAmount: number | null;
    // Landing page customization
    surveyWelcomeTitle: string | null;
    surveyWelcomeMessage: string | null;
    surveyThankYouTitle: string | null;
    surveyThankYouMessage: string | null;
    surveyAlreadyDoneTitle: string | null;
    surveyAlreadyDoneMessage: string | null;
    surveyDisqualifiedTitle: string | null;
    surveyDisqualifiedMessage: string | null;
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
            surveyTemplate: {
              include: {
                sections: {
                  include: { section: { select: { name: true, description: true } } },
                },
              },
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
        surveyWelcomeTitle: campaignHcp.campaign.surveyWelcomeTitle,
        surveyWelcomeMessage: campaignHcp.campaign.surveyWelcomeMessage,
        surveyThankYouTitle: campaignHcp.campaign.surveyThankYouTitle,
        surveyThankYouMessage: campaignHcp.campaign.surveyThankYouMessage,
        surveyAlreadyDoneTitle: campaignHcp.campaign.surveyAlreadyDoneTitle,
        surveyAlreadyDoneMessage: campaignHcp.campaign.surveyAlreadyDoneMessage,
        surveyDisqualifiedTitle: campaignHcp.campaign.surveyDisqualifiedTitle,
        surveyDisqualifiedMessage: campaignHcp.campaign.surveyDisqualifiedMessage,
      },
      hcp: campaignHcp.hcp,
      questions: (() => {
        // Build section name → description map from template
        const sectionDescMap: Record<string, string> = {};
        const tmpl = campaignHcp.campaign.surveyTemplate as { sections: { section: { name: string; description: string | null } }[] } | null;
        if (tmpl?.sections) {
          for (const ts of tmpl.sections) {
            if (ts.section.description) {
              sectionDescMap[ts.section.name] = ts.section.description;
            }
          }
        }

        return campaignHcp.campaign.surveyQuestions.map((sq: {
          id: string;
          questionId: string;
          questionTextSnapshot: string;
          sectionName: string | null;
          isRequired: boolean;
          question: { type: string; options: unknown; minEntries: number | null; defaultEntries: number | null };
        }) => ({
          id: sq.id,
          questionId: sq.questionId,
          text: sq.questionTextSnapshot,
          type: sq.question.type,
          section: sq.sectionName,
          sectionDescription: sq.sectionName ? (sectionDescMap[sq.sectionName] || null) : null,
          isRequired: sq.isRequired,
          options: sq.question.options,
          minEntries: sq.question.minEntries,
          defaultEntries: sq.question.defaultEntries,
        }));
      })(),
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

    // Fetch all existing answers in one query to avoid N+1
    const existingAnswers = await prisma.surveyResponseAnswer.findMany({
      where: { responseId: response.id },
    });
    const existingByQuestionId = new Map(existingAnswers.map((a) => [a.questionId, a]));

    // Batch all operations in a single transaction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const operations: PrismaPromise<any>[] = [
      prisma.surveyResponse.update({
        where: { id: response.id },
        data: { status: 'IN_PROGRESS' },
      }),
    ];

    for (const [questionId, value] of Object.entries(answers)) {
      if (value === null || value === undefined) continue;

      const isJson = typeof value === 'object';
      const existing = existingByQuestionId.get(questionId);

      if (existing) {
        operations.push(
          prisma.surveyResponseAnswer.update({
            where: { id: existing.id },
            data: {
              answerText: isJson ? null : String(value),
              answerJson: isJson ? (value as object) : undefined,
            },
          })
        );
      } else {
        operations.push(
          prisma.surveyResponseAnswer.create({
            data: {
              responseId: response.id,
              questionId,
              answerText: isJson ? null : String(value),
              answerJson: isJson ? (value as object) : undefined,
            },
          })
        );
      }
    }

    await prisma.$transaction(operations);

    return { saved: true };
  }

  async submitSurvey(token: string, answers: Record<string, unknown>) {
    // Save final answers first
    await this.saveProgress(token, answers);

    const response = await prisma.surveyResponse.findUnique({
      where: { surveyToken: token },
      include: {
        campaign: {
          include: {
            surveyQuestions: {
              include: { question: true },
            },
          },
        },
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

    // Validate required fields and minEntries
    const validationErrors: string[] = [];
    for (const sq of response.campaign.surveyQuestions) {
      const answer = response.answers.find((a) => a.questionId === sq.id);
      const answerValue = answer?.answerJson ?? answer?.answerText;

      // Check required questions (use sq.isRequired — campaign-specific override, not question bank global)
      if (sq.isRequired) {
        const isEmpty =
          answerValue === undefined ||
          answerValue === null ||
          answerValue === '' ||
          (Array.isArray(answerValue) && answerValue.filter(Boolean).length === 0) ||
          // MULTI_CHOICE stores { selected: string[], texts: {} }
          (typeof answerValue === 'object' && !Array.isArray(answerValue) && answerValue !== null &&
            'selected' in (answerValue as Record<string, unknown>) &&
            Array.isArray((answerValue as { selected: unknown[] }).selected) &&
            (answerValue as { selected: unknown[] }).selected.length === 0) ||
          // RANK_ORDER stores { ranked: string[], texts?: {} }
          (typeof answerValue === 'object' && !Array.isArray(answerValue) && answerValue !== null &&
            'ranked' in (answerValue as Record<string, unknown>) &&
            Array.isArray((answerValue as { ranked: unknown[] }).ranked) &&
            (answerValue as { ranked: unknown[] }).ranked.length === 0);

        if (isEmpty) {
          validationErrors.push(`Question "${sq.question.text}" is required`);
          continue;
        }
      }

      // Check minEntries for MULTI_TEXT questions
      if (sq.question.type === 'MULTI_TEXT' && sq.question.minEntries != null && sq.question.minEntries > 0) {
        const filledEntries = Array.isArray(answerValue) ? answerValue.filter(Boolean).length : 0;
        if (filledEntries < sq.question.minEntries) {
          validationErrors.push(
            `Question "${sq.question.text}" requires at least ${sq.question.minEntries} names`
          );
        }
      }
    }

    if (validationErrors.length > 0) {
      throw new Error(`Validation failed: ${validationErrors.join('; ')}`);
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
