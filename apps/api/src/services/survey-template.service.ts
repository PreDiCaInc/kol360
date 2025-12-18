import { prisma } from '../lib/prisma';
import { CreateSurveyTemplateInput, UpdateSurveyTemplateInput } from '@kol360/shared';

export class SurveyTemplateService {
  async list() {
    return prisma.surveyTemplate.findMany({
      include: {
        sections: {
          include: {
            section: {
              include: {
                questions: {
                  include: { question: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        _count: { select: { campaigns: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getById(id: string) {
    return prisma.surveyTemplate.findUnique({
      where: { id },
      include: {
        sections: {
          include: {
            section: {
              include: {
                questions: {
                  include: { question: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        _count: { select: { campaigns: true } },
      },
    });
  }

  async create(data: CreateSurveyTemplateInput) {
    return prisma.surveyTemplate.create({
      data: {
        name: data.name,
        description: data.description,
      },
    });
  }

  async update(id: string, data: UpdateSurveyTemplateInput) {
    return prisma.surveyTemplate.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
      },
    });
  }

  async delete(id: string) {
    // Check if template is used by any campaigns
    const usageCount = await prisma.campaign.count({
      where: { surveyTemplateId: id },
    });

    if (usageCount > 0) {
      throw new Error('Cannot delete template that is used by campaigns');
    }

    return prisma.surveyTemplate.delete({ where: { id } });
  }

  async addSection(templateId: string, sectionId: string, isLocked = false) {
    // Check if section already exists in template
    const existing = await prisma.templateSection.findUnique({
      where: { templateId_sectionId: { templateId, sectionId } },
    });

    if (existing) {
      throw new Error('Section already exists in this template');
    }

    const maxOrder = await prisma.templateSection.aggregate({
      where: { templateId },
      _max: { sortOrder: true },
    });

    return prisma.templateSection.create({
      data: {
        templateId,
        sectionId,
        sortOrder: (maxOrder._max.sortOrder || 0) + 1,
        isLocked,
      },
      include: { section: true },
    });
  }

  async removeSection(templateId: string, sectionId: string) {
    return prisma.templateSection.delete({
      where: { templateId_sectionId: { templateId, sectionId } },
    });
  }

  async reorderSections(templateId: string, sectionIds: string[]) {
    const updates = sectionIds.map((sectionId, index) =>
      prisma.templateSection.update({
        where: { templateId_sectionId: { templateId, sectionId } },
        data: { sortOrder: index },
      })
    );
    await prisma.$transaction(updates);
  }

  async clone(id: string, newName: string) {
    const template = await this.getById(id);
    if (!template) throw new Error('Template not found');

    return prisma.surveyTemplate.create({
      data: {
        name: newName,
        description: template.description,
        sections: {
          create: template.sections.map((ts: { sectionId: string; sortOrder: number; isLocked: boolean }) => ({
            sectionId: ts.sectionId,
            sortOrder: ts.sortOrder,
            isLocked: ts.isLocked,
          })),
        },
      },
      include: {
        sections: {
          include: { section: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  // Used when assigning template to campaign
  async instantiateForCampaign(templateId: string, campaignId: string) {
    const template = await this.getById(templateId);
    if (!template) throw new Error('Template not found');

    const surveyQuestions: {
      campaignId: string;
      questionId: string;
      sectionName: string;
      sortOrder: number;
      isRequired: boolean;
      questionTextSnapshot: string;
    }[] = [];
    let globalOrder = 0;

    for (const templateSection of template.sections) {
      for (const sectionQuestion of templateSection.section.questions) {
        surveyQuestions.push({
          campaignId,
          questionId: sectionQuestion.questionId,
          sectionName: templateSection.section.name,
          sortOrder: globalOrder++,
          isRequired: sectionQuestion.question.isRequired,
          questionTextSnapshot: sectionQuestion.question.text,
        });
      }
    }

    if (surveyQuestions.length > 0) {
      await prisma.surveyQuestion.createMany({ data: surveyQuestions });

      // Increment usage count
      const questionIds = surveyQuestions.map((q) => q.questionId);
      await prisma.question.updateMany({
        where: { id: { in: questionIds } },
        data: { usageCount: { increment: 1 } },
      });
    }
  }
}
