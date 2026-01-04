import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { QuestionService } from '../question.service';

// Mock prisma
vi.mock('../../lib/prisma', () => ({
  prisma: {
    question: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn(),
    },
    surveyQuestion: {
      count: vi.fn(),
    },
  },
}));

import { prisma } from '../../lib/prisma';

describe('QuestionService', () => {
  let questionService: QuestionService;

  beforeEach(() => {
    questionService = new QuestionService();
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should return paginated questions', async () => {
      const mockQuestions = [
        { id: 'q-1', text: 'Question 1', type: 'TEXT', category: 'general' },
        { id: 'q-2', text: 'Question 2', type: 'SINGLE_SELECT', category: 'general' },
      ];

      (prisma.question.count as Mock).mockResolvedValue(2);
      (prisma.question.findMany as Mock).mockResolvedValue(mockQuestions);

      const result = await questionService.list({ page: 1, limit: 10 });

      expect(result.items).toEqual(mockQuestions);
      expect(result.pagination).toEqual({ page: 1, limit: 10, total: 2, pages: 1 });
    });

    it('should filter by category', async () => {
      (prisma.question.count as Mock).mockResolvedValue(0);
      (prisma.question.findMany as Mock).mockResolvedValue([]);

      await questionService.list({ page: 1, limit: 10, category: 'demographics' });

      expect(prisma.question.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'demographics' }),
        })
      );
    });

    it('should filter by type', async () => {
      (prisma.question.count as Mock).mockResolvedValue(0);
      (prisma.question.findMany as Mock).mockResolvedValue([]);

      await questionService.list({ page: 1, limit: 10, type: 'MULTI_SELECT' });

      expect(prisma.question.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'MULTI_SELECT' }),
        })
      );
    });

    it('should filter by tags', async () => {
      (prisma.question.count as Mock).mockResolvedValue(0);
      (prisma.question.findMany as Mock).mockResolvedValue([]);

      await questionService.list({ page: 1, limit: 10, tags: ['oncology', 'screening'] });

      expect(prisma.question.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tags: { hasSome: ['oncology', 'screening'] } }),
        })
      );
    });

    it('should search by text', async () => {
      (prisma.question.count as Mock).mockResolvedValue(0);
      (prisma.question.findMany as Mock).mockResolvedValue([]);

      await questionService.list({ page: 1, limit: 10, search: 'patient' });

      expect(prisma.question.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            text: { contains: 'patient', mode: 'insensitive' },
          }),
        })
      );
    });
  });

  describe('getById', () => {
    it('should return question with sections', async () => {
      const mockQuestion = {
        id: 'q-1',
        text: 'Question',
        sectionQuestions: [{ section: { id: 's-1', name: 'Section 1' } }],
        _count: { surveyQuestions: 3 },
      };

      (prisma.question.findUnique as Mock).mockResolvedValue(mockQuestion);

      const result = await questionService.getById('q-1');

      expect(result).toEqual(mockQuestion);
      expect(prisma.question.findUnique).toHaveBeenCalledWith({
        where: { id: 'q-1' },
        include: expect.objectContaining({
          sectionQuestions: expect.any(Object),
          _count: expect.any(Object),
        }),
      });
    });

    it('should return null for non-existent question', async () => {
      (prisma.question.findUnique as Mock).mockResolvedValue(null);

      const result = await questionService.getById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new question', async () => {
      const mockQuestion = {
        id: 'q-1',
        text: 'New question?',
        type: 'TEXT',
        category: 'general',
        status: 'active',
      };

      (prisma.question.create as Mock).mockResolvedValue(mockQuestion);

      const result = await questionService.create({
        text: 'New question?',
        type: 'TEXT',
        category: 'general',
      });

      expect(result).toEqual(mockQuestion);
      expect(prisma.question.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          text: 'New question?',
          type: 'TEXT',
          category: 'general',
          status: 'active',
          isRequired: false,
          tags: [],
        }),
      });
    });

    it('should create question with options', async () => {
      const options = ['Option A', 'Option B', 'Option C'];

      (prisma.question.create as Mock).mockResolvedValue({ id: 'q-1' });

      await questionService.create({
        text: 'Select one',
        type: 'SINGLE_SELECT',
        category: 'general',
        options,
      });

      expect(prisma.question.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          options,
        }),
      });
    });

    it('should create question with nomination settings', async () => {
      (prisma.question.create as Mock).mockResolvedValue({ id: 'q-1' });

      await questionService.create({
        text: 'Nominate HCPs',
        type: 'NOMINATION',
        category: 'nomination',
        minEntries: 3,
        defaultEntries: 5,
        nominationType: 'HCP',
      });

      expect(prisma.question.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          minEntries: 3,
          defaultEntries: 5,
          nominationType: 'HCP',
        }),
      });
    });
  });

  describe('update', () => {
    it('should update question', async () => {
      (prisma.surveyQuestion.count as Mock).mockResolvedValue(0);
      (prisma.question.update as Mock).mockResolvedValue({ id: 'q-1', text: 'Updated' });

      const result = await questionService.update('q-1', { text: 'Updated' });

      expect(result.text).toBe('Updated');
    });

    it('should throw error when modifying text of question in active campaign', async () => {
      (prisma.surveyQuestion.count as Mock).mockResolvedValue(1);

      await expect(
        questionService.update('q-1', { text: 'New text' })
      ).rejects.toThrow('Cannot modify text of question used in active campaigns');
    });

    it('should allow updating non-text fields of question in active campaign', async () => {
      (prisma.surveyQuestion.count as Mock).mockResolvedValue(1);
      (prisma.question.update as Mock).mockResolvedValue({ id: 'q-1', category: 'updated' });

      await expect(
        questionService.update('q-1', { category: 'updated' })
      ).resolves.not.toThrow();
    });
  });

  describe('archive', () => {
    it('should set status to archived', async () => {
      (prisma.question.update as Mock).mockResolvedValue({ id: 'q-1', status: 'archived' });

      const result = await questionService.archive('q-1');

      expect(result.status).toBe('archived');
      expect(prisma.question.update).toHaveBeenCalledWith({
        where: { id: 'q-1' },
        data: { status: 'archived' },
      });
    });
  });

  describe('restore', () => {
    it('should set status to active', async () => {
      (prisma.question.update as Mock).mockResolvedValue({ id: 'q-1', status: 'active' });

      const result = await questionService.restore('q-1');

      expect(result.status).toBe('active');
      expect(prisma.question.update).toHaveBeenCalledWith({
        where: { id: 'q-1' },
        data: { status: 'active' },
      });
    });
  });

  describe('getCategories', () => {
    it('should return category counts', async () => {
      const mockCategories = [
        { category: 'general', _count: 10 },
        { category: 'demographics', _count: 5 },
      ];

      (prisma.question.groupBy as Mock).mockResolvedValue(mockCategories);

      const result = await questionService.getCategories();

      expect(result).toEqual([
        { name: 'general', count: 10 },
        { name: 'demographics', count: 5 },
      ]);
    });
  });

  describe('getTags', () => {
    it('should return aggregated tag counts', async () => {
      const mockQuestions = [
        { tags: ['oncology', 'screening'] },
        { tags: ['oncology', 'treatment'] },
        { tags: ['screening'] },
      ];

      (prisma.question.findMany as Mock).mockResolvedValue(mockQuestions);

      const result = await questionService.getTags();

      expect(result).toContainEqual({ name: 'oncology', count: 2 });
      expect(result).toContainEqual({ name: 'screening', count: 2 });
      expect(result).toContainEqual({ name: 'treatment', count: 1 });
    });

    it('should sort tags by count descending', async () => {
      const mockQuestions = [
        { tags: ['common', 'rare'] },
        { tags: ['common', 'medium'] },
        { tags: ['common'] },
      ];

      (prisma.question.findMany as Mock).mockResolvedValue(mockQuestions);

      const result = await questionService.getTags();

      expect(result[0].name).toBe('common');
      expect(result[0].count).toBe(3);
    });
  });
});
