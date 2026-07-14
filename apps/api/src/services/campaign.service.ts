import { prisma } from '../lib/prisma';
import { SurveyTemplateService } from './survey-template.service';
// score-calculation.service removed in Phase 3 PR A. /publish is now a
// status transition only; the KOL Analysis auto-recalc covers what
// publishScores() / calculateSurveyScores() / calculateCompositeScores() did.
import { kolAnalysisService } from './kol-analysis.service';
import { CreateCampaignInput, UpdateCampaignInput, CampaignListQuery, EmailTemplatesInput, LandingPageTemplatesInput } from '@kol360/shared';
import { CampaignStatus, Prisma } from '@prisma/client';

const surveyTemplateService = new SurveyTemplateService();

export class CampaignService {
  async list(params: CampaignListQuery) {
    const { clientId, status, page, limit } = params;

    const where: Prisma.CampaignWhereInput = {};
    if (clientId) where.clientId = clientId;
    if (status) where.status = status as CampaignStatus;

    const [total, items] = await Promise.all([
      prisma.campaign.count({ where }),
      prisma.campaign.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          diseaseArea: { select: { id: true, name: true } },
          _count: {
            select: {
              campaignHcps: true,
              surveyResponses: true,
            },
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

  async getById(id: string) {
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        client: true,
        diseaseArea: true,
        surveyTemplate: true,
        // compositeScoreConfig include removed in Phase 3 PR B —
        // the model and table are dropped in this release.
        surveyQuestions: {
          include: { question: true },
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: {
            campaignHcps: true,
            surveyResponses: true,
            surveyQuestions: true,
          },
        },
      },
    });

    if (!campaign) return null;

    // Get completed responses count separately
    const completedResponses = await prisma.surveyResponse.count({
      where: {
        campaignId: id,
        status: 'COMPLETED',
      },
    });

    return {
      ...campaign,
      _count: {
        ...campaign._count,
        completedResponses,
      },
    };
  }

  async create(data: CreateCampaignInput, createdBy: string) {
    const campaign = await prisma.campaign.create({
      data: {
        clientId: data.clientId,
        diseaseAreaId: data.diseaseAreaId,
        name: data.name,
        description: data.description,
        surveyTemplateId: data.surveyTemplateId,
        honorariumAmount: data.honorariumAmount ?? 0,
        excludeInternalEmails: data.excludeInternalEmails ?? false,
        surveyOpenDate: data.surveyOpenDate ? new Date(data.surveyOpenDate) : null,
        surveyCloseDate: data.surveyCloseDate ? new Date(data.surveyCloseDate) : null,
        createdBy,
        status: 'DRAFT',
      },
    });

    // CompositeScoreConfig row creation removed in Phase 3 PR A — weights are
    // now per-analysis (KolAnalysis.weightsJson), not per-campaign. The legacy
    // table still exists in PR A so existing rows remain readable; PR B drops it.

    // If template selected, instantiate questions
    if (data.surveyTemplateId) {
      await surveyTemplateService.instantiateForCampaign(
        data.surveyTemplateId,
        campaign.id
      );
    }

    return campaign;
  }

  async update(id: string, data: UpdateCampaignInput) {
    // If surveyTemplateId is being changed, lock once first response is received
    if (data.surveyTemplateId !== undefined) {
      const existing = await prisma.campaign.findUnique({
        where: { id },
        select: {
          surveyTemplateId: true,
          status: true,
          _count: { select: { surveyResponses: true } },
        },
      });

      if (!existing) {
        throw new Error('Campaign not found');
      }

      if (existing._count.surveyResponses > 0) {
        throw new Error('Survey template cannot be changed after responses have been received');
      }

      // Only instantiate if template is actually changing
      if (existing.surveyTemplateId !== data.surveyTemplateId) {
        // Remove old questions if any
        await prisma.surveyQuestion.deleteMany({ where: { campaignId: id } });

        // Instantiate new questions from the new template (if one was selected)
        if (data.surveyTemplateId) {
          await surveyTemplateService.instantiateForCampaign(data.surveyTemplateId, id);
        }
      }
    }

    return prisma.campaign.update({
      where: { id },
      data: {
        ...data,
        honorariumAmount: data.honorariumAmount ?? undefined,
        surveyOpenDate: data.surveyOpenDate ? new Date(data.surveyOpenDate) : undefined,
        surveyCloseDate: data.surveyCloseDate ? new Date(data.surveyCloseDate) : undefined,
      },
    });
  }

  async delete(id: string) {
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (campaign?.status !== 'DRAFT') {
      throw new Error('Can only delete draft campaigns');
    }

    return prisma.campaign.delete({ where: { id } });
  }

  /**
   * Force delete a test campaign regardless of status.
   * Only works for campaigns with E2E_TEST_CAMPAIGN_ prefix.
   * Deletes all related data (responses, HCPs, scores, etc.)
   */
  async forceDeleteTestCampaign(id: string) {
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      return null; // Already deleted
    }

    // Safety check: only allow force delete for test campaigns
    if (!campaign.name.startsWith('E2E_TEST_CAMPAIGN_')) {
      throw new Error('Force delete only allowed for E2E test campaigns');
    }

    // Delete in correct order to handle foreign key constraints.
    //
    // Payment.responseId is @unique with default Restrict — deleting a
    // SurveyResponse that still has an attached Payment throws
    // Payment_responseId_fkey. Payments MUST be deleted before their
    // SurveyResponses. This bug lived here until 2026-07-13 when it was
    // caught alongside the identical bug in e2e/cleanup-test-data.ts:
    // the old order (Payment last) crashed on every test campaign that
    // reached the payment-processing phase, leaking >500 stale rows on
    // test between 2026-06-03 and 2026-07-13.
    //
    // NominationBrandFlag (v1.17.78+) cascades from Nomination; no
    // explicit delete. CampaignBrandOption (v1.17.78+) cascades from
    // Campaign; no explicit delete.
    await prisma.$transaction(async (tx) => {
      const responses = await tx.surveyResponse.findMany({
        where: { campaignId: id },
        select: { id: true },
      });
      const responseIds = responses.map((r) => r.id);

      // 1. Nominations (cascades to NominationBrandFlag) + answers.
      if (responseIds.length > 0) {
        await tx.nomination.deleteMany({
          where: { responseId: { in: responseIds } },
        });
        await tx.surveyResponseAnswer.deleteMany({
          where: { responseId: { in: responseIds } },
        });
      }

      // 2. Payments — MUST come before SurveyResponses.
      await tx.payment.deleteMany({ where: { campaignId: id } });

      // 3. SurveyResponses.
      await tx.surveyResponse.deleteMany({ where: { campaignId: id } });

      // 4. CampaignHcps.
      await tx.campaignHcp.deleteMany({ where: { campaignId: id } });

      // 5. SurveyQuestions.
      await tx.surveyQuestion.deleteMany({ where: { campaignId: id } });

      // 6. Campaign (cascades to CampaignBrandOption).
      await tx.campaign.delete({ where: { id } });
    });

    return campaign;
  }

  async activate(id: string) {
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (campaign?.status !== 'DRAFT') {
      throw new Error('Can only activate draft campaigns');
    }

    // Validate: must have HCPs and questions
    const hcpCount = await prisma.campaignHcp.count({ where: { campaignId: id } });
    const questionCount = await prisma.surveyQuestion.count({ where: { campaignId: id } });

    if (hcpCount === 0) throw new Error('Campaign must have at least one HCP');
    if (questionCount === 0) throw new Error('Campaign must have survey questions');

    return prisma.campaign.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        surveyOpenDate: new Date(),
      },
    });
  }

  async close(id: string) {
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (campaign?.status !== 'ACTIVE') {
      throw new Error('Can only close active campaigns');
    }

    return prisma.campaign.update({
      where: { id },
      data: {
        status: 'CLOSED',
        surveyCloseDate: new Date(),
      },
    });
  }

  async reopen(id: string) {
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (campaign?.status !== 'CLOSED') {
      throw new Error('Can only reopen closed campaigns');
    }

    return prisma.campaign.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        surveyCloseDate: null, // Clear close date when reopening
      },
    });
  }

  async publish(id: string, publishedBy: string) {
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (campaign?.status !== 'CLOSED') {
      throw new Error('Can only publish closed campaigns');
    }

    // Phase 3 PR A: campaign-level calculateSurveyScores / calculateCompositeScores /
    // publishScores all removed. /publish is now a pure status transition; the
    // KOL Analysis auto-recalc below produces the customer-visible scores.
    void publishedBy; // intentionally unused — was passed to the deleted publishScores

    const published = await prisma.campaign.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });

    // Auto-recalculate any KOL analysis that includes this campaign so the
    // curated dashboards stay current on publish (locked decision: explicit
    // button + auto on publish). Best-effort — never block/await-fail publish.
    try {
      const links = await prisma.kolAnalysisCampaign.findMany({
        where: { campaignId: id, included: true },
        select: { analysisId: true },
      });
      for (const { analysisId } of links) {
        try {
          await kolAnalysisService.recalculateAnalysis(analysisId);
        } catch (err) {
          console.error(`[publish] analysis recalc failed for ${analysisId}:`, err);
        }
      }
    } catch (err) {
      console.error('[publish] analysis auto-recalc lookup failed:', err);
    }

    return published;
  }

  async updateEmailTemplates(id: string, data: EmailTemplatesInput) {
    return prisma.campaign.update({
      where: { id },
      data: {
        invitationEmailSubject: data.invitationEmailSubject,
        invitationEmailBody: data.invitationEmailBody,
        reminderEmailSubject: data.reminderEmailSubject,
        reminderEmailBody: data.reminderEmailBody,
      },
    });
  }

  async updateLandingPageTemplates(id: string, data: LandingPageTemplatesInput) {
    return prisma.campaign.update({
      where: { id },
      data: {
        surveyWelcomeTitle: data.surveyWelcomeTitle,
        surveyWelcomeMessage: data.surveyWelcomeMessage,
        surveyThankYouTitle: data.surveyThankYouTitle,
        surveyThankYouMessage: data.surveyThankYouMessage,
        surveyAlreadyDoneTitle: data.surveyAlreadyDoneTitle,
        surveyAlreadyDoneMessage: data.surveyAlreadyDoneMessage,
        surveyDisqualifiedTitle: data.surveyDisqualifiedTitle,
        surveyDisqualifiedMessage: data.surveyDisqualifiedMessage,
      },
    });
  }
}
