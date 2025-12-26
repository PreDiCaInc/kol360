import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { CreateQuestionInput, UpdateQuestionInput } from '@kol360/shared';

interface ListParams {
  category?: string;
  type?: string;
  tags?: string[];
  status?: string;
  search?: string;
  page: number;
  limit: number;
}

export class QuestionService {
  async list(params: ListParams) {
    const { category, type, tags, status, search, page, limit } = params;

    const where: Record<string, unknown> = {};

    if (category) where.category = category;
    if (type) where.type = type;
    if (status) where.status = status;
    if (tags?.length) where.tags = { hasSome: tags };
    if (search) {
      where.text = { contains: search, mode: 'insensitive' };
    }

    const [total, items] = await Promise.all([
      prisma.question.count({ where }),
      prisma.question.findMany({
        where,
        include: {
          _count: {
            select: {
              sectionQuestions: true,
              surveyQuestions: true,
            },
          },
        },
        orderBy: [{ category: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getById(id: string) {
    return prisma.question.findUnique({
      where: { id },
      include: {
        sectionQuestions: {
          include: { section: true },
        },
        _count: {
          select: { surveyQuestions: true },
        },
      },
    });
  }

  async create(data: CreateQuestionInput) {
    return prisma.question.create({
      data: {
        text: data.text,
        type: data.type,
        category: data.category,
        isRequired: data.isRequired ?? false,
        options: data.options ?? undefined,
        tags: data.tags ?? [],
        minEntries: data.minEntries ?? undefined,
        defaultEntries: data.defaultEntries ?? undefined,
        nominationType: data.nominationType ?? undefined,
        status: 'active',
      },
    });
  }

  async update(id: string, data: UpdateQuestionInput) {
    // Check if question is used in active campaigns
    const usageCount = await prisma.surveyQuestion.count({
      where: {
        questionId: id,
        campaign: { status: { in: ['ACTIVE'] } },
      },
    });

    if (usageCount > 0 && data.text) {
      throw new Error('Cannot modify text of question used in active campaigns');
    }

    return prisma.question.update({
      where: { id },
      data: {
        ...(data.text !== undefined && { text: data.text }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.isRequired !== undefined && { isRequired: data.isRequired }),
        ...(data.options !== undefined && {
          options: data.options === null ? Prisma.JsonNull : data.options,
        }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.minEntries !== undefined && { minEntries: data.minEntries }),
        ...(data.defaultEntries !== undefined && { defaultEntries: data.defaultEntries }),
        ...(data.nominationType !== undefined && { nominationType: data.nominationType }),
      },
    });
  }

  async archive(id: string) {
    return prisma.question.update({
      where: { id },
      data: { status: 'archived' },
    });
  }

  async restore(id: string) {
    return prisma.question.update({
      where: { id },
      data: { status: 'active' },
    });
  }

  async getCategories() {
    const categories = await prisma.question.groupBy({
      by: ['category'],
      where: { category: { not: null } },
      _count: true,
    });
    return categories.map((c: { category: string | null; _count: number }) => ({
      name: c.category,
      count: c._count,
    }));
  }

  async getTags() {
    const questions = await prisma.question.findMany({
      where: { tags: { isEmpty: false } },
      select: { tags: true },
    });

    const tagCounts: Record<string, number> = {};
    questions.forEach((q: { tags: string[] }) => {
      q.tags.forEach((tag: string) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    return Object.entries(tagCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }
}
