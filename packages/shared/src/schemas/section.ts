import { z } from 'zod';

export const createSectionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional().nullable(),
  isCore: z.boolean().default(false),
});

export const updateSectionSchema = createSectionSchema.partial();

export const addQuestionToSectionSchema = z.object({
  questionId: z.string().cuid(),
});

export const reorderQuestionsSchema = z.object({
  questionIds: z.array(z.string().cuid()),
});

export type CreateSectionInput = z.infer<typeof createSectionSchema>;
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;
export type AddQuestionToSectionInput = z.infer<typeof addQuestionToSectionSchema>;
export type ReorderQuestionsInput = z.infer<typeof reorderQuestionsSchema>;
