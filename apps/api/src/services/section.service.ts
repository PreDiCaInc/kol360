import { prisma } from '../lib/prisma';
import { CreateSectionInput, UpdateSectionInput } from '@kol360/shared';

export class SectionService {
  async list() {
    return prisma.sectionTemplate.findMany({
      include: {
        questions: {
          include: { question: true },
          orderBy: { sortOrder: 'asc' },
        },
        _count: { select: { templateSections: true } },
      },
      orderBy: [{ isCore: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async getById(id: string) {
    return prisma.sectionTemplate.findUnique({
      where: { id },
      include: {
        questions: {
          include: { question: true },
          orderBy: { sortOrder: 'asc' },
        },
        _count: { select: { templateSections: true } },
      },
    });
  }

  async create(data: CreateSectionInput) {
    const maxOrder = await prisma.sectionTemplate.aggregate({
      _max: { sortOrder: true },
    });

    return prisma.sectionTemplate.create({
      data: {
        name: data.name,
        description: data.description,
        isCore: data.isCore ?? false,
        sortOrder: (maxOrder._max.sortOrder || 0) + 1,
      },
    });
  }

  async update(id: string, data: UpdateSectionInput) {
    return prisma.sectionTemplate.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.isCore !== undefined && { isCore: data.isCore }),
      },
    });
  }

  async delete(id: string) {
    // Check if it's a core section
    const section = await prisma.sectionTemplate.findUnique({
      where: { id },
      include: { _count: { select: { templateSections: true } } },
    });

    if (!section) {
      throw new Error('Section not found');
    }

    if (section.isCore) {
      throw new Error('Cannot delete core sections');
    }

    if (section._count.templateSections > 0) {
      throw new Error('Cannot delete section that is used in templates. Remove it from all templates first.');
    }

    // Delete associated section questions first (they cascade, but let's be explicit)
    await prisma.sectionQuestion.deleteMany({ where: { sectionId: id } });

    return prisma.sectionTemplate.delete({ where: { id } });
  }

  async addQuestion(sectionId: string, questionId: string) {
    // Check if question already exists in section
    const existing = await prisma.sectionQuestion.findUnique({
      where: { sectionId_questionId: { sectionId, questionId } },
    });

    if (existing) {
      throw new Error('Question already exists in this section');
    }

    const maxOrder = await prisma.sectionQuestion.aggregate({
      where: { sectionId },
      _max: { sortOrder: true },
    });

    return prisma.sectionQuestion.create({
      data: {
        sectionId,
        questionId,
        sortOrder: (maxOrder._max.sortOrder || 0) + 1,
      },
      include: { question: true },
    });
  }

  async removeQuestion(sectionId: string, questionId: string) {
    return prisma.sectionQuestion.delete({
      where: { sectionId_questionId: { sectionId, questionId } },
    });
  }

  async reorderQuestions(sectionId: string, questionIds: string[]) {
    const updates = questionIds.map((questionId, index) =>
      prisma.sectionQuestion.update({
        where: { sectionId_questionId: { sectionId, questionId } },
        data: { sortOrder: index },
      })
    );
    await prisma.$transaction(updates);
  }
}
