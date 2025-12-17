import { prisma } from '../lib/prisma';
import { SurveyTemplateService } from './survey-template.service';
import { CreateCampaignInput, UpdateCampaignInput, CampaignListQuery } from '@kol360/shared';

const surveyTemplateService = new SurveyTemplateService();

export class CampaignService {
  async list(params: CampaignListQuery) {
    const { clientId, status, page, limit } = params;

    const where: {
      clientId?: string;
      status?: string;
    } = {};
    if (clientId) where.clientId = clientId;
    if (status) where.status = status;

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
    return prisma.campaign.findUnique({
      where: { id },
      include: {
        client: true,
        diseaseArea: true,
        surveyTemplate: true,
        compositeScoreConfig: true,
        surveyQuestions: {
          include: { question: true },
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: {
            campaignHcps: true,
            surveyResponses: true,
          },
        },
      },
    });
  }

  async create(data: CreateCampaignInput, createdBy: string) {
    const campaign = await prisma.campaign.create({
      data: {
        clientId: data.clientId,
        diseaseAreaId: data.diseaseAreaId,
        name: data.name,
        description: data.description,
        surveyTemplateId: data.surveyTemplateId,
        honorariumAmount: data.honorariumAmount,
        surveyOpenDate: data.surveyOpenDate ? new Date(data.surveyOpenDate) : null,
        surveyCloseDate: data.surveyCloseDate ? new Date(data.surveyCloseDate) : null,
        createdBy,
        status: 'DRAFT',
      },
    });

    // Create default score config
    await prisma.compositeScoreConfig.create({
      data: { campaignId: campaign.id },
    });

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
    return prisma.campaign.update({
      where: { id },
      data: {
        ...data,
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
      data: { status: 'ACTIVE' },
    });
  }

  async close(id: string) {
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (campaign?.status !== 'ACTIVE') {
      throw new Error('Can only close active campaigns');
    }

    return prisma.campaign.update({
      where: { id },
      data: { status: 'CLOSED' },
    });
  }

  async reopen(id: string) {
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (campaign?.status !== 'CLOSED') {
      throw new Error('Can only reopen closed campaigns');
    }

    return prisma.campaign.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  }

  async publish(id: string) {
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (campaign?.status !== 'CLOSED') {
      throw new Error('Can only publish closed campaigns');
    }

    return prisma.campaign.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
  }
}
