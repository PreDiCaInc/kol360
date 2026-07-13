import { prisma } from '../lib/prisma';
import { PrismaPromise } from '@prisma/client';
import {
  isPlaceholderEmail,
  multiTextWithGridSchema,
  nominationBrandFlagsSchema,
} from '@kol360/shared';
import { createAuditLog } from '../lib/audit';
import { logger } from '../lib/logger';
import { PublicValidationError } from '../lib/public-errors';
import { CampaignBrandOptionService } from './campaign-brand-option.service';

const brandOptionService = new CampaignBrandOptionService();

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
  // v1.17.81 — Brand-Affinity Grid opt-in per question. False for every
  // question of a classic (non-grid) campaign.
  useBrandGrid: boolean;
}

interface BrandOptionForRespondent {
  id: string;
  brandName: string;
  displayOrder: number;
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
    // v1.17.81 — Brand-Affinity Grid config. Empty array on classic
    // campaigns; the FE reads this + question.useBrandGrid to decide
    // whether to render the brand grid at all.
    brandOptions: BrandOptionForRespondent[];
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
            // v1.17.81 — Brand-Affinity Grid config for grid campaigns.
            brandOptions: {
              orderBy: { displayOrder: 'asc' },
              select: { id: true, brandName: true, displayOrder: true },
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
        // v1.17.81 — always emit brandOptions; empty array on classic
        // campaigns. FE gates rendering on question.useBrandGrid.
        brandOptions: campaignHcp.campaign.brandOptions.map((b: { id: string; brandName: string; displayOrder: number }) => ({
          id: b.id,
          brandName: b.brandName,
          displayOrder: b.displayOrder,
        })),
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
          useBrandGrid: boolean;
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
          // v1.17.81 — Brand-Affinity Grid opt-in per question.
          useBrandGrid: sq.useBrandGrid,
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
            // v1.17.81 — brand list, needed to validate that any
            // BRAND flag on a submitted nomination references an id
            // that belongs to THIS campaign (cross-campaign leak guard).
            brandOptions: { select: { id: true } },
          },
        },
        respondentHcp: {
          select: { email: true },
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

    // Mark as completed. Also freeze the campaign's brand-option list
    // atomically in the same transaction — see item O in the
    // brand-affinity-grid plan. Idempotent for non-first responses
    // (freezeIfFirstResponse is a `WHERE brandsFrozenAt IS NULL`
    // updateMany, so it's a no-op after the first hit).
    const completedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.surveyResponse.update({
        where: { id: response.id },
        data: {
          status: 'COMPLETED',
          completedAt,
        },
      });
      await brandOptionService.freezeIfFirstResponse(
        response.campaignId,
        completedAt,
        tx
      );
    });

    // v1.17.38 — SURFACE (don't auto-update) survey-provided "Email
    // address:" answers that differ from Hcp.email. Pre-fix the
    // answer was stored in SurveyResponseAnswer and never re-read by
    // any production flow — payment-export then sent honorarium checks
    // to placeholders while real addresses sat buried in the survey
    // answers. See
    // docs/findings/survey-email-not-propagated-to-hcp-2026-06-13.md.
    //
    // Behavior:
    //   - If survey-provided email matches Hcp.email exactly (case-
    //     insensitive after trim): no action.
    //   - If survey-provided email differs AND parses as plausible:
    //     emit a 'hcp.survey_email_mismatch' audit row capturing both
    //     values. Surfaces in audit queries + the payment-export
    //     "Survey-Provided Email" column for admin review. Hcp.email
    //     is NOT mutated — admin decides whether to update.
    //   - If survey-provided email is empty / not plausible: skipped.
    //
    // No backfill of historical responses per pteam's call.
    await this.detectSurveyEmailMismatch(response.id);

    // v1.17.81 — Brand-Affinity Grid submit path.
    // Prior to grid mode: MULTI_TEXT answerJson is `string[]`, we
    // createMany the resulting Nominations with skipDuplicates.
    //
    // In grid mode the answerJson for a useBrandGrid question is
    // `{ names: string[]; brandFlags: BrandFlagInput[][] }`. Each
    // non-empty name row spawns:
    //   - one Nomination (need the id to attach flags),
    //   - N NominationBrandFlag rows (BRAND with brandOptionId, or a
    //     single NEUTRAL / DONT_KNOW sentinel row).
    // Cross-campaign brandOptionId is rejected (respondent MUST pick
    // from THIS campaign's brand list).
    //
    // Classic questions on a grid campaign, and every question on a
    // classic campaign, still take the string[] happy path with
    // createMany. Only useBrandGrid = true questions go through the
    // per-name loop.
    const validBrandOptionIds = new Set(
      (response.campaign as { brandOptions: { id: string }[] }).brandOptions.map((b) => b.id)
    );

    // Bucket 1: classic path (fast createMany).
    const classicNominations: Array<{
      responseId: string;
      questionId: string;
      nominatorHcpId: string;
      rawNameEntered: string;
    }> = [];

    // Bucket 2: grid path (per-name creates so we can attach flags).
    // Rows are validated eagerly — any invariant break throws BEFORE
    // the DB transaction opens.
    interface GridNominationDraft {
      questionId: string;
      surveyQuestionId: string;
      rawNameEntered: string;
      flags: Array<{ flagType: 'BRAND' | 'NEUTRAL' | 'DONT_KNOW'; brandOptionId?: string }>;
    }
    const gridDrafts: GridNominationDraft[] = [];

    for (const answer of response.answers) {
      if (answer.question.question.type !== 'MULTI_TEXT' || !answer.answerJson) continue;

      const isGridQuestion = answer.question.useBrandGrid;

      if (!isGridQuestion) {
        // Classic path — string[] only. Guard against a rogue payload
        // that sent the grid shape on a non-grid question by unwrapping
        // .names if present; ignore stray brand flags in that case.
        const raw = answer.answerJson as unknown;
        const names = Array.isArray(raw)
          ? (raw as string[])
          : ((raw as { names?: string[] }).names ?? []);
        for (const name of names.filter(Boolean)) {
          classicNominations.push({
            responseId: response.id,
            questionId: answer.questionId,
            nominatorHcpId: response.respondentHcpId,
            rawNameEntered: name.trim(),
          });
        }
        continue;
      }

      // Grid path — must be the extended shape.
      const parsed = multiTextWithGridSchema.safeParse(answer.answerJson);
      if (!parsed.success) {
        throw new PublicValidationError(
          `Brand grid answer for question "${answer.question.question.text}" is malformed — expected { names, brandFlags }`
        );
      }
      const { names, brandFlags } = parsed.data;
      if (brandFlags.length !== names.length) {
        throw new PublicValidationError(
          `Brand grid answer for question "${answer.question.question.text}" has mismatched names/brandFlags lengths`
        );
      }

      for (let i = 0; i < names.length; i++) {
        const rawName = names[i]?.trim() ?? '';
        if (!rawName) continue; // empty rows silently dropped, same as classic

        const flagsForRow = brandFlags[i] ?? [];
        // Enforce item S at submit-time (Zod can't reach here because
        // it doesn't know per-question useBrandGrid).
        const flagsCheck = nominationBrandFlagsSchema.safeParse(flagsForRow);
        if (!flagsCheck.success) {
          throw new PublicValidationError(
            `Brand grid for "${rawName}" on question "${answer.question.question.text}" is invalid: ${flagsCheck.error.issues.map((e) => e.message).join('; ')}`
          );
        }

        // Reject BRAND flags whose brandOptionId isn't part of THIS
        // campaign's list. Prevents an attacker or a stale client from
        // referencing a brand from another campaign.
        for (const f of flagsCheck.data) {
          if (f.flagType === 'BRAND' && !validBrandOptionIds.has(f.brandOptionId!)) {
            throw new PublicValidationError(
              `Brand grid for "${rawName}" references a brandOptionId that does not belong to this campaign`
            );
          }
        }

        gridDrafts.push({
          questionId: answer.questionId,
          surveyQuestionId: answer.question.id,
          rawNameEntered: rawName,
          flags: flagsCheck.data,
        });
      }
    }

    // Write phase — classic first (bulk), then grid (per-row so we get
    // Nomination ids to attach flags). One transaction so a mid-write
    // failure rolls back partial nomination/flag writes.
    await prisma.$transaction(async (tx) => {
      if (classicNominations.length > 0) {
        await tx.nomination.createMany({
          data: classicNominations,
          skipDuplicates: true,
        });
      }
      for (const draft of gridDrafts) {
        const nom = await tx.nomination.create({
          data: {
            responseId: response.id,
            questionId: draft.questionId,
            nominatorHcpId: response.respondentHcpId,
            rawNameEntered: draft.rawNameEntered,
          },
          select: { id: true },
        });
        if (draft.flags.length > 0) {
          await tx.nominationBrandFlag.createMany({
            data: draft.flags.map((f) => ({
              nominationId: nom.id,
              flagType: f.flagType,
              brandOptionId: f.flagType === 'BRAND' ? f.brandOptionId! : null,
            })),
          });
        }
      }
    });

    // Create payment record if honorarium is set, skip for internal emails when exclude flag is on
    const isInternalEmail = response.respondentHcp?.email?.endsWith('@bio-exec.com');
    const skipPayment = response.campaign.excludeInternalEmails && isInternalEmail;
    if (response.campaign.honorariumAmount && !skipPayment) {
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

  /**
   * v1.17.38 — surface (don't auto-update) survey-provided email
   * addresses that differ from the HCP's current email. Emits a
   * 'hcp.survey_email_mismatch' audit row when a discrepancy is
   * detected; otherwise no-ops.
   *
   * The audit row is the durable record:
   *   - oldValues.email = Hcp.email at submit time
   *   - newValues.email = survey-provided "Email address:" answer
   *   - newValues.responseId / campaignId for trace-back
   * Admins can query AuditLog WHERE action='hcp.survey_email_mismatch'
   * to find unresolved cases. Payment-export annotates each line with
   * the survey-provided value when an unresolved mismatch exists.
   *
   * Non-blocking: any error here logs but doesn't break the submit
   * flow — the survey's already saved by the time we get here.
   */
  private async detectSurveyEmailMismatch(responseId: string): Promise<void> {
    try {
      const response = await prisma.surveyResponse.findUnique({
        where: { id: responseId },
        select: {
          campaignId: true,
          respondentHcpId: true,
          respondentHcp: { select: { id: true, email: true } },
          answers: {
            include: { question: { include: { question: true } } },
          },
        },
      });
      if (!response?.respondentHcp) return;

      // Locate the "Email address:" answer. Match the question text
      // case-insensitively + tolerantly so minor edits ("Email
      // Address:" / "Email address" / "Your email:") still hit.
      const emailAnswer = response.answers.find((a) => {
        const text = (a.question?.question?.text ?? '').trim().toLowerCase();
        return /^email( address)?:?$/i.test(text);
      });
      const rawSurveyEmail = (emailAnswer?.answerText ?? '').trim();
      if (!rawSurveyEmail) return;

      // Plausibility check — basic shape. Don't surface
      // "johndoe@gmial" typos as mismatches; the discrepancy noise
      // would drown out the real signal.
      const plausibleEmailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      if (!plausibleEmailRe.test(rawSurveyEmail)) return;

      const surveyEmail = rawSurveyEmail.toLowerCase();
      const currentEmail = (response.respondentHcp.email ?? '').trim().toLowerCase();

      // Same → no action. (Case-insensitive after trim.)
      if (surveyEmail === currentEmail) return;

      // Skip when the survey-provided email is itself a placeholder
      // (the respondent literally typed nomail@…). Not actionable.
      if (isPlaceholderEmail(surveyEmail)) return;

      // Different + plausible → surface via audit row.
      await createAuditLog('system:survey_submission', {
        action: 'hcp.survey_email_mismatch',
        entityType: 'Hcp',
        entityId: response.respondentHcp.id,
        oldValues: { email: response.respondentHcp.email },
        newValues: {
          email: rawSurveyEmail,
          responseId,
          campaignId: response.campaignId,
        },
      });
    } catch (err) {
      // Best-effort — don't fail the survey submit over a detection
      // bookkeeping issue.
      logger.warn('Failed to detect survey email mismatch', {
        responseId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
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
